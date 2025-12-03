(function() {
    'use strict';

    window.Domus = window.Domus || {};

    /**
     * Global state
     */
    Domus.state = {
        role: 'owner',
        hasOwnerRole: false,
        hasTenantOwnerRole: false,
        currentRoleView: 'owner',
        currentView: null,
        currentYear: (new Date()).getFullYear(),
        selectedPropertyId: null,
        selectedUnitId: null,
        selectedPartnerId: null,
        selectedTenancyId: null
    };

    /**
     * Utility helpers
     */
    Domus.Utils = (function() {
        function escapeHtml(value) {
            const str = value === undefined || value === null ? '' : String(value);
            return str.replace(/[&<>"']/g, ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[ch]));
        }

        return { escapeHtml };
    })();

    /**
     * Simple Pub/Sub to share events between modules
     */
    Domus.Events = (function() {
        const listeners = {};

        function on(event, cb) {
            listeners[event] = listeners[event] || [];
            listeners[event].push(cb);
        }

        function emit(event, payload) {
            (listeners[event] || []).forEach(cb => cb(payload));
        }

        return { on, emit };
    })();

    /**
     * API helper for AJAX requests with Nextcloud headers
     */
    Domus.Api = (function() {
        const baseUrl = OC.generateUrl('/apps/domus');

        function request(method, path, data, isFormData = false) {
            const opts = {
                method: method,
                headers: {
                    'OCS-APIREQUEST': 'true',
                    requesttoken: OC.requestToken
                }
            };

            if (data) {
                if (isFormData) {
                    opts.body = data;
                } else {
                    opts.headers['Content-Type'] = 'application/json';
                    opts.body = JSON.stringify(data);
                }
            }

            return fetch(baseUrl + path, opts).then(handleResponse);
        }

        function handleResponse(response) {
            if (!response.ok) {
                return response.text().then(msg => {
                    throw new Error(msg || response.statusText);
                });
            }
            const contentType = response.headers.get('Content-Type') || '';
            if (contentType.indexOf('application/json') !== -1) {
                return response.json();
            }
            return response.text();
        }

        function queryWithYear(path) {
            return `${path}?year=${Domus.state.currentYear}`;
        }

        return {
            get: path => request('GET', path),
            post: (path, data) => request('POST', path, data),
            put: (path, data) => request('PUT', path, data),
            delete: path => request('DELETE', path),
            getDashboardSummary: () => request('GET', queryWithYear('/dashboard/summary')),
            getProperties: () => request('GET', queryWithYear('/properties')),
            createProperty: data => request('POST', '/properties', data),
            updateProperty: (id, data) => request('PUT', `/properties/${id}`, data),
            deleteProperty: id => request('DELETE', `/properties/${id}`),
            getProperty: id => request('GET', `/properties/${id}`),
            getUnits: (propertyId) => {
                const path = propertyId ? `/properties/${propertyId}/units` : '/units';
                return request('GET', queryWithYear(path));
            },
            createUnit: data => request('POST', '/units', data),
            updateUnit: (id, data) => request('PUT', `/units/${id}`, data),
            deleteUnit: id => request('DELETE', `/units/${id}`),
            getPartners: (type) => {
                const path = type ? `/partners?partnerType=${encodeURIComponent(type)}` : '/partners';
                return request('GET', path);
            },
            createPartner: data => request('POST', '/partners', data),
            updatePartner: (id, data) => request('PUT', `/partners/${id}`, data),
            deletePartner: id => request('DELETE', `/partners/${id}`),
            getTenancies: filters => {
                let path = '/tenancies';
                const params = new URLSearchParams();
                params.append('year', Domus.state.currentYear);
                if (filters && filters.status) params.append('status', filters.status);
                if (filters && filters.propertyId) params.append('propertyId', filters.propertyId);
                return request('GET', `${path}?${params.toString()}`);
            },
            createTenancy: data => request('POST', '/tenancies', data),
            updateTenancy: (id, data) => request('PUT', `/tenancies/${id}`, data),
            deleteTenancy: id => request('DELETE', `/tenancies/${id}`),
            getBookings: filters => {
                let path = '/bookings';
                const params = new URLSearchParams();
                params.append('year', Domus.state.currentYear);
                if (filters) {
                    Object.keys(filters).forEach(key => {
                        if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
                            params.append(key, filters[key]);
                        }
                    });
                }
                return request('GET', `${path}?${params.toString()}`);
            },
            createBooking: data => request('POST', '/bookings', data),
            updateBooking: (id, data) => request('PUT', `/bookings/${id}`, data),
            deleteBooking: id => request('DELETE', `/bookings/${id}`),
            getReports: (propertyId) => {
                let path = '/reports';
                if (propertyId) {
                    path = `/properties/${propertyId}/reports/${Domus.state.currentYear}`;
                }
                return request('GET', path);
            },
            createReport: (propertyId) => request('POST', `/properties/${propertyId}/reports/${Domus.state.currentYear}`),
            createTenancyReport: (tenancyId) => request('POST', `/tenancies/${tenancyId}/reports/${Domus.state.currentYear}`),
            getDocuments: (entityType, entityId) => request('GET', `/documents/${entityType}/${entityId}`),
            linkDocument: (entityType, entityId, data) => request('POST', `/documents/${entityType}/${entityId}`, data),
            uploadDocument: (entityType, entityId, formData) => request('POST', `/documents/${entityType}/${entityId}/upload`, formData, true),
            unlinkDocument: id => request('DELETE', `/documents/${id}`)
        };
    })();

    /**
     * Generic UI helpers
     */
    Domus.UI = (function() {
        function renderContent(html) {
            const el = document.getElementById('app-content');
            if (el) {
                el.innerHTML = html;
            }
        }

        function renderSidebar(html) {
            const el = document.getElementById('app-sidebar');
            if (el) {
                el.innerHTML = html || '';
                el.classList.toggle('domus-sidebar-hidden', !html);
            }
        }

        function showLoading(message) {
            renderContent('<div class="domus-loading">' + Domus.Utils.escapeHtml(message || t('domus', 'Loading…')) + '</div>');
        }

        function showError(message) {
            renderContent('<div class="domus-error">' + Domus.Utils.escapeHtml(message || t('domus', 'An error occurred')) + '</div>');
        }

        function showNotification(message, type) {
            if (window.OC && OC.Toast) {
                const normalizedType = type || 'info';
                if (typeof OC.Toast[normalizedType] === 'function') {
                    OC.Toast[normalizedType](message);
                    return;
                }
                if (typeof OC.Toast.message === 'function') {
                    OC.Toast.message(message);
                    return;
                }
            }

            const container = document.createElement('div');
            container.className = 'domus-notification domus-notification-' + (type || 'info');
            container.textContent = message;
            document.body.appendChild(container);
            setTimeout(() => container.remove(), 4000);
        }

        function openModal(options) {
            const { title, content, size } = options || {};
            const backdrop = document.createElement('div');
            backdrop.className = 'domus-modal-backdrop';

            const modal = document.createElement('div');
            modal.className = 'domus-modal';
            if (size) {
                modal.classList.add(`domus-modal-${size}`);
            }

            const header = document.createElement('div');
            header.className = 'domus-modal-header';
            const heading = document.createElement('h3');
            heading.textContent = title || '';
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'domus-modal-close';
            closeBtn.setAttribute('aria-label', t('domus', 'Close modal'));
            closeBtn.innerHTML = '&times;';
            header.appendChild(heading);
            header.appendChild(closeBtn);

            const body = document.createElement('div');
            body.className = 'domus-modal-body';
            if (typeof content === 'string') {
                body.innerHTML = content;
            } else if (content instanceof Node) {
                body.appendChild(content);
            }

            modal.appendChild(header);
            modal.appendChild(body);
            backdrop.appendChild(modal);
            document.body.appendChild(backdrop);

            function closeModal() {
                document.removeEventListener('keydown', onEsc);
                backdrop.remove();
            }

            function onEsc(event) {
                if (event.key === 'Escape') {
                    closeModal();
                }
            }

            document.addEventListener('keydown', onEsc);
            closeBtn.addEventListener('click', closeModal);
            backdrop.addEventListener('click', function(e) {
                if (e.target === backdrop) {
                    closeModal();
                }
            });

            return { modalEl: modal, close: closeModal };
        }

        function buildTable(headers, rows) {
            let html = '<table class="domus-table">';
            html += '<thead><tr>' + headers.map(h => '<th>' + Domus.Utils.escapeHtml(h) + '</th>').join('') + '</tr></thead>';
            html += '<tbody>';
            if (!rows || rows.length === 0) {
                html += '<tr><td colspan="' + headers.length + '">' + Domus.Utils.escapeHtml(t('domus', 'No entries found.')) + '</td></tr>';
            } else {
                rows.forEach(row => {
                    html += '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>';
                });
            }
            html += '</tbody></table>';
            return html;
        }

        function buildYearFilter(onChange) {
            const currentYear = Domus.state.currentYear;
            const years = [currentYear - 1, currentYear, currentYear + 1];
            let html = '<label class="domus-inline-label">' + Domus.Utils.escapeHtml(t('domus', 'Year')) + ' ';
            html += '<select id="domus-year-select">';
            years.forEach(y => {
                html += '<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>' + y + '</option>';
            });
            html += '</select></label>';
            setTimeout(() => {
                const select = document.getElementById('domus-year-select');
                if (select) {
                    select.addEventListener('change', function() {
                        Domus.state.currentYear = parseInt(this.value, 10);
                        onChange && onChange(Domus.state.currentYear);
                    });
                }
            }, 0);
            return html;
        }

        function buildBackButton(targetView, args) {
            const serializedArgs = (args || []).join(',');
            return '<button class="domus-back-button" data-back="' + Domus.Utils.escapeHtml(targetView) + '" data-back-args="' + Domus.Utils.escapeHtml(serializedArgs) + '">' + Domus.Utils.escapeHtml(t('domus', 'Back')) + '</button>';
        }

        function buildSectionHeader(title, action) {
            let actionHtml = '';
            if (action) {
                let attrs = '';
                if (action.id) {
                    attrs += ' id="' + Domus.Utils.escapeHtml(action.id) + '"';
                }
                if (action.dataset) {
                    Object.keys(action.dataset).forEach(key => {
                        const value = action.dataset[key];
                        if (value === undefined || value === null || value === '') {
                            return;
                        }
                        attrs += ' data-' + Domus.Utils.escapeHtml(key) + '="' + Domus.Utils.escapeHtml(String(value)) + '"';
                    });
                }
                const label = action.label || '+';
                const titleAttr = action.title || t('domus', 'Add');
                actionHtml = '<button class="domus-section-action"' + attrs + ' title="' + Domus.Utils.escapeHtml(titleAttr) + '">' + Domus.Utils.escapeHtml(label) + '</button>';
            }

            return '<div class="domus-section-header"><h3>' + Domus.Utils.escapeHtml(title) + '</h3>' + actionHtml + '</div>';
        }

        function bindBackButtons() {
            document.querySelectorAll('button[data-back]').forEach(btn => {
                btn.addEventListener('click', function() {
                    const target = this.getAttribute('data-back');
                    const argsRaw = this.getAttribute('data-back-args') || '';
                    const args = argsRaw ? argsRaw.split(',').filter(Boolean) : [];
                    Domus.Router.navigate(target, args);
                });
            });
        }

        return {
            renderContent,
            renderSidebar,
            showLoading,
            showError,
            showNotification,
            buildTable,
            buildYearFilter,
            buildBackButton,
            buildSectionHeader,
            bindBackButtons,
            openModal
        };
    })();

    /**
     * Role helper
     */
    Domus.Role = (function() {
        function setRoleInfo(info) {
            Domus.state.role = info.role;
            Domus.state.hasOwnerRole = !!info.hasOwnerRole;
            Domus.state.hasTenantOwnerRole = !!info.hasTenantOwnerRole;
            Domus.state.currentRoleView = Domus.state.hasOwnerRole ? 'owner' : 'tenantOwner';
        }

        function isOwnerView() {
            return Domus.state.currentRoleView === 'owner';
        }

        return { setRoleInfo, isOwnerView };
    })();

    /**
     * Router mapping view identifiers to renderers
     */
    Domus.Router = (function() {
        const routes = {};
        let skipNextHashChange = false;

        function register(name, handler) {
            routes[name] = handler;
        }

        function navigate(name, args) {
            Domus.state.currentView = name;
            if (routes[name]) {
                routes[name].apply(null, args || []);
            }
            skipNextHashChange = updateHash(name, args);
            Domus.Navigation.render();
        }

        function updateHash(name, args) {
            const hash = '#/' + name + (args && args.length ? '/' + args.join('/') : '');
            if (window.location.hash !== hash) {
                window.location.hash = hash;
                return true;
            }
            return false;
        }

        function parseHash() {
            const hash = window.location.hash.replace(/^#\//, '');
            if (!hash) return null;
            const parts = hash.split('/');
            return { name: parts[0], args: parts.slice(1) };
        }

        window.addEventListener('hashchange', function() {
            if (skipNextHashChange) {
                skipNextHashChange = false;
                return;
            }
            const parsed = parseHash();
            if (parsed && routes[parsed.name]) {
                Domus.state.currentView = parsed.name;
                routes[parsed.name].apply(null, parsed.args);
                Domus.Navigation.render();
            }
        });

        return { register, navigate };
    })();

    /**
     * Navigation builder
     */
    Domus.Navigation = (function() {
        function render() {
            const container = document.getElementById('app-navigation');
            if (!container) return;

            const ul = document.createElement('ul');
            ul.className = 'domus-nav';

            getMenuItems().forEach(item => {
                const li = document.createElement('li');
                li.className = Domus.state.currentView === item.view ? 'active' : '';
                const link = document.createElement('a');
                link.href = '#';
                link.textContent = item.label;
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    Domus.Router.navigate(item.view, item.args || []);
                });
                li.appendChild(link);
                ul.appendChild(li);
            });

            container.innerHTML = '';
            container.appendChild(ul);

            if (Domus.state.hasOwnerRole && Domus.state.hasTenantOwnerRole) {
                const roleSwitcher = document.createElement('div');
                roleSwitcher.className = 'domus-role-switcher';
                const label = document.createElement('label');
                label.textContent = t('domus', 'View as');
                const select = document.createElement('select');
                select.innerHTML = '<option value="owner">' + Domus.Utils.escapeHtml(t('domus', 'Owner')) + '</option>' +
                    '<option value="tenantOwner">' + Domus.Utils.escapeHtml(t('domus', 'Tenant/Owner')) + '</option>';
                select.value = Domus.state.currentRoleView;
                select.addEventListener('change', function() {
                    Domus.state.currentRoleView = this.value;
                    render();
                    Domus.Router.navigate('dashboard');
                });
                roleSwitcher.appendChild(label);
                roleSwitcher.appendChild(select);
                container.appendChild(roleSwitcher);
            }
        }

        function getMenuItems() {
            if (!Domus.Role.isOwnerView()) {
                return [
                    { view: 'dashboard', label: t('domus', 'Dashboard') },
                    { view: 'tenancies', label: t('domus', 'My tenancies') },
                    { view: 'reports', label: t('domus', 'My reports') }
                ];
            }
            return [
                { view: 'dashboard', label: t('domus', 'Dashboard') },
                { view: 'properties', label: t('domus', 'Properties') },
                { view: 'units', label: t('domus', 'Units') },
                { view: 'partners', label: t('domus', 'Partners') },
                { view: 'tenancies', label: t('domus', 'Tenancies') },
                { view: 'bookings', label: t('domus', 'Bookings') },
                { view: 'reports', label: t('domus', 'Reports') }
            ];
        }

        return { render };
    })();

    /**
     * Dashboard view
     */
    Domus.Dashboard = (function() {
        function render() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading dashboard…'));
            Domus.Api.getDashboardSummary()
                .then(data => {
                    const html = buildHeader() + buildContent(data || {});
                    Domus.UI.renderContent(html);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function buildHeader() {
            const filter = Domus.UI.buildYearFilter(() => Domus.Router.navigate('dashboard'));
            return '<div class="domus-toolbar">' + filter + '</div>';
        }

        function buildContent(data) {
            if (!Domus.Role.isOwnerView()) {
                return buildTenantDashboard(data);
            }
            return buildOwnerDashboard(data);
        }

        function buildOwnerDashboard(data) {
            const cards = [
                { label: t('domus', 'Properties'), value: data.propertyCount || 0 },
                { label: t('domus', 'Units'), value: data.unitCount || 0 },
                { label: t('domus', 'Active tenancies'), value: data.tenancyCount || 0 },
                { label: t('domus', 'Open bookings'), value: data.bookingCount || 0 }
            ];

            const cardHtml = cards.map(card => '<div class="domus-card"><div class="domus-card-title">' +
                Domus.Utils.escapeHtml(card.label) + '</div><div class="domus-card-value">' +
                Domus.Utils.escapeHtml(card.value.toString()) + '</div></div>').join('');

            const propertyRows = (data.properties || []).map(p => [
                Domus.Utils.escapeHtml(p.name || ''),
                Domus.Utils.escapeHtml(p.city || ''),
                Domus.Utils.escapeHtml((p.unitCount || 0).toString()),
                '<button class="domus-link" data-property-id="' + p.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Open')) + '</button>'
            ]);

            const table = Domus.UI.buildTable([
                t('domus', 'Name'), t('domus', 'City'), t('domus', 'Units'), ''
            ], propertyRows);

            setTimeout(bindPropertyLinks, 0);

            return '<div class="domus-cards">' + cardHtml + '</div>' +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Properties overview')) + '</h2>' + table;
        }

        function bindPropertyLinks() {
            document.querySelectorAll('button[data-property-id]').forEach(btn => {
                btn.addEventListener('click', function() {
                    Domus.Router.navigate('propertyDetail', [this.getAttribute('data-property-id')]);
                });
            });
        }

        function buildTenantDashboard(data) {
            const tenancyRows = (data.tenancies || []).map(tn => [
                Domus.Utils.escapeHtml(tn.unitLabel || ''),
                Domus.Utils.escapeHtml(tn.period || ''),
                Domus.Utils.escapeHtml(tn.status || ''),
                '<button class="domus-link" data-tenancy-id="' + tn.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Details')) + '</button>'
            ]);
            const reportRows = (data.reports || []).map(rp => [
                Domus.Utils.escapeHtml(rp.propertyName || ''),
                Domus.Utils.escapeHtml((rp.year || Domus.state.currentYear).toString()),
                '<a class="domus-link" href="' + Domus.Utils.escapeHtml(rp.downloadUrl || '#') + '">' + Domus.Utils.escapeHtml(t('domus', 'Download')) + '</a>'
            ]);

            setTimeout(() => {
                document.querySelectorAll('button[data-tenancy-id]').forEach(btn => {
                    btn.addEventListener('click', function() {
                        Domus.Router.navigate('tenancyDetail', [this.getAttribute('data-tenancy-id')]);
                    });
                });
            }, 0);

            return '<h2>' + Domus.Utils.escapeHtml(t('domus', 'My tenancies')) + '</h2>' +
                Domus.UI.buildTable([t('domus', 'Unit'), t('domus', 'Period'), t('domus', 'Status'), ''], tenancyRows) +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'My reports')) + '</h2>' +
                Domus.UI.buildTable([t('domus', 'Property'), t('domus', 'Year'), ''], reportRows);
        }

        return { render };
    })();

    /**
     * Properties view
     */
    Domus.Properties = (function() {
        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading properties…'));
            Domus.Api.getProperties()
                .then(properties => {
                    const header = '<div class="domus-toolbar">' +
                        '<button id="domus-property-create-btn" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'New property')) + '</button>' +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';
                    const rows = (properties || []).map(p => [
                        Domus.Utils.escapeHtml(p.name || ''),
                        Domus.Utils.escapeHtml([p.street, p.city].filter(Boolean).join(', ')),
                        Domus.Utils.escapeHtml((p.unitCount || 0).toString()),
                        '<button class="domus-link" data-property-id="' + p.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Open')) + '</button>'
                    ]);
                    const table = Domus.UI.buildTable([
                        t('domus', 'Name'), t('domus', 'Address'), t('domus', 'Units'), ''
                    ], rows);
                    Domus.UI.renderContent(header + table);
                    bindListEvents();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindListEvents() {
            const createBtn = document.getElementById('domus-property-create-btn');
            if (createBtn) {
                createBtn.addEventListener('click', openCreateModal);
            }

            document.querySelectorAll('button[data-property-id]').forEach(btn => {
                btn.addEventListener('click', function() {
                    Domus.Router.navigate('propertyDetail', [this.getAttribute('data-property-id')]);
                });
            });
        }

        function openCreateModal() {
            const modal = Domus.UI.openModal({
                title: t('domus', 'New property'),
                content: buildPropertyForm()
            });
            bindPropertyForm(modal, data => Domus.Api.createProperty(data)
                .then(() => {
                    Domus.UI.showNotification(t('domus', 'Property created.'), 'success');
                    modal.close();
                    renderList();
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error')));
        }

        function renderDetail(id) {
            Domus.UI.showLoading(t('domus', 'Loading property…'));
            Domus.Api.getProperty(id)
                .then(property => {
                    const sidebar = '<div class="domus-detail-sidebar">' +
                        '<h3>' + Domus.Utils.escapeHtml(t('domus', 'Property actions')) + '</h3>' +
                        '<button id="domus-property-edit" data-id="' + id + '">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>' +
                        '<button id="domus-property-delete" data-id="' + id + '">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                        '</div>';
                    Domus.UI.renderSidebar(sidebar);

                    const unitsHeader = Domus.UI.buildSectionHeader(t('domus', 'Units'), {
                        id: 'domus-add-unit',
                        title: t('domus', 'Add unit'),
                        dataset: { propertyId: id }
                    });
                    const bookingsHeader = Domus.UI.buildSectionHeader(t('domus', 'Bookings'), {
                        id: 'domus-add-booking',
                        title: t('domus', 'Add booking'),
                        dataset: { propertyId: id }
                    });
                    const reportsHeader = Domus.UI.buildSectionHeader(t('domus', 'Reports'), Domus.Role.isOwnerView() ? {
                        id: 'domus-property-report',
                        title: t('domus', 'Generate report'),
                        dataset: { propertyId: id }
                    } : null);
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), {
                        id: 'domus-property-link-doc',
                        title: t('domus', 'Link file'),
                        dataset: { entityType: 'property', entityId: id }
                    });

                    const content = '<div class="domus-detail">' +
                        Domus.UI.buildBackButton('properties') +
                        '<h2>' + Domus.Utils.escapeHtml(property.name || '') + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml([property.street, property.city].filter(Boolean).join(', ')) + '</p>' +
                        '<div class="domus-section">' + unitsHeader +
                        Domus.Units.renderListInline(property.units || []) + '</div>' +
                        '<div class="domus-section">' + bookingsHeader +
                        Domus.Bookings.renderInline(property.bookings || []) + '</div>' +
                        '<div class="domus-section">' + reportsHeader +
                        Domus.Reports.renderInline(property.reports || [], property.id) + '</div>' +
                        '<div class="domus-section">' + documentsHeader +
                        Domus.Documents.renderList('property', id) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    bindDetailActions(id, property);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id) {
            const editBtn = document.getElementById('domus-property-edit');
            const deleteBtn = document.getElementById('domus-property-delete');
            if (editBtn) {
                editBtn.addEventListener('click', () => openEditModal(id));
            }
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    if (confirm(t('domus', 'Delete property?'))) {
                        Domus.Api.deleteProperty(id)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', 'Property deleted.'), 'success');
                                Domus.UI.renderSidebar('');
                                renderList();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    }
                });
            }

            document.getElementById('domus-add-unit')?.addEventListener('click', () => {
                Domus.Units.openCreateModal({ propertyId: id }, () => renderDetail(id));
            });
            document.getElementById('domus-add-booking')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({ propertyId: id }, () => renderDetail(id));
            });
            document.getElementById('domus-property-report')?.addEventListener('click', () => {
                Domus.Reports.createForProperty(id, () => renderDetail(id));
            });
            document.getElementById('domus-property-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('property', id, () => renderDetail(id));
            });
        }

        function openEditModal(id) {
            Domus.Api.getProperty(id)
                .then(property => {
                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Edit property'),
                        content: buildPropertyForm(property)
                    });
                    bindPropertyForm(modal, data => Domus.Api.updateProperty(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Property updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')));
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindPropertyForm(modalContext, onSubmit) {
            const form = modalContext.modalEl.querySelector('#domus-property-form');
            const cancelBtn = modalContext.modalEl.querySelector('#domus-property-cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', modalContext.close);
            }
            if (form) {
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    const data = formToObject(form);
                    if (!data.name) {
                        Domus.UI.showNotification(t('domus', 'Name is required.'), 'error');
                        return;
                    }
                    onSubmit(data);
                });
            }
        }

        function buildPropertyForm(property) {
            const prop = property || {};
            return '<div class="domus-form">' +
                '<form id="domus-property-form">' +
                buildTextInput('name', t('domus', 'Name'), true, prop.name) +
                buildSelect('usageRole', t('domus', 'Usage role'), [
                    { value: 'manager', label: t('domus', 'Manager') },
                    { value: 'landlord', label: t('domus', 'Landlord') }
                ], prop.usageRole) +
                buildTextInput('street', t('domus', 'Street'), false, prop.street) +
                buildTextInput('zip', t('domus', 'ZIP'), false, prop.zip) +
                buildTextInput('city', t('domus', 'City'), false, prop.city) +
                buildTextInput('country', t('domus', 'Country'), false, prop.country || 'DE') +
                buildTextInput('type', t('domus', 'Type'), false, prop.type) +
                buildTextarea('description', t('domus', 'Description'), prop.description) +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-property-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        function buildTextInput(name, label, required, value) {
            return '<label>' + Domus.Utils.escapeHtml(label) + (required ? ' *' : '') +
                '<input type="text" name="' + name + '" ' + (required ? 'required' : '') + ' value="' +
                (value ? Domus.Utils.escapeHtml(value) : '') + '"></label>';
        }

        function buildSelect(name, label, options, selected) {
            const opts = options.map(opt => '<option value="' + opt.value + '"' + (selected === opt.value ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('');
            return '<label>' + Domus.Utils.escapeHtml(label) + '<select name="' + name + '">' + opts + '</select></label>';
        }

        function buildTextarea(name, label, value) {
            return '<label>' + Domus.Utils.escapeHtml(label) + '<textarea name="' + name + '">' + (value ? Domus.Utils.escapeHtml(value) : '') + '</textarea></label>';
        }

        function formToObject(form) {
            const obj = {};
            Array.prototype.forEach.call(form.elements, function(el) {
                if (!el.name) return;
                if (el.type === 'checkbox') {
                    obj[el.name] = el.checked;
                } else {
                    obj[el.name] = el.value;
                }
            });
            return obj;
        }

        return {
            renderList,
            renderDetail,
            renderListInline: (units) => Domus.Units.renderListInline(units)
        };
    })();

    /**
     * Units view
     */
    Domus.Units = (function() {
        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading units…'));
            Domus.Api.getUnits()
                .then(units => {
                    const header = '<div class="domus-toolbar">' +
                        '<button id="domus-unit-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'New unit')) + '</button>' +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';
                    const rows = (units || []).map(u => [
                        Domus.Utils.escapeHtml(u.label || ''),
                        Domus.Utils.escapeHtml(u.unitNumber || ''),
                        Domus.Utils.escapeHtml(u.unitType || ''),
                        '<button class="domus-link" data-unit-id="' + u.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Open')) + '</button>'
                    ]);
                    Domus.UI.renderContent(header + Domus.UI.buildTable([
                        t('domus', 'Label'), t('domus', 'Number'), t('domus', 'Type'), ''
                    ], rows));
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            const createBtn = document.getElementById('domus-unit-create');
            if (createBtn) createBtn.addEventListener('click', () => openCreateModal());
            document.querySelectorAll('button[data-unit-id]').forEach(btn => {
                btn.addEventListener('click', () => Domus.Router.navigate('unitDetail', [btn.getAttribute('data-unit-id')]));
            });
        }

        function renderListInline(units) {
            const rows = (units || []).map(u => [
                Domus.Utils.escapeHtml(u.label || ''),
                Domus.Utils.escapeHtml(u.unitNumber || ''),
                Domus.Utils.escapeHtml(u.unitType || '')
            ]);
            return Domus.UI.buildTable([t('domus', 'Label'), t('domus', 'Number'), t('domus', 'Type')], rows);
        }

        function openCreateModal(defaults = {}, onCreated) {
            Domus.Api.getProperties()
                .then(properties => {
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const modal = Domus.UI.openModal({
                        title: t('domus', 'New unit'),
                        content: buildUnitForm(propertyOptions, defaults)
                    });
                    bindUnitForm(modal, data => Domus.Api.createUnit(data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Unit created.'), 'success');
                            modal.close();
                            (onCreated || renderList)();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')));
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function renderDetail(id) {
            Domus.UI.showLoading(t('domus', 'Loading unit…'));
            Domus.Api.get('/units/' + id)
                .then(unit => {
                    const sidebar = '<div class="domus-detail-sidebar">' +
                        '<h3>' + Domus.Utils.escapeHtml(t('domus', 'Unit actions')) + '</h3>' +
                        '<button id="domus-unit-edit" data-id="' + id + '">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>' +
                        '<button id="domus-unit-delete" data-id="' + id + '">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                        '</div>';
                    Domus.UI.renderSidebar(sidebar);

                    const allTenancies = (unit.activeTenancies || []).concat(unit.historicTenancies || []);
                    const tenanciesHeader = Domus.UI.buildSectionHeader(t('domus', 'Tenancies'), {
                        id: 'domus-add-tenancy',
                        title: t('domus', 'Add tenancy'),
                        dataset: { unitId: id }
                    });
                    const bookingsHeader = Domus.UI.buildSectionHeader(t('domus', 'Bookings'), {
                        id: 'domus-add-unit-booking',
                        title: t('domus', 'Add booking'),
                        dataset: { propertyId: unit.propertyId, unitId: id }
                    });
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), {
                        id: 'domus-unit-link-doc',
                        title: t('domus', 'Link file'),
                        dataset: { entityType: 'unit', entityId: id }
                    });

                    const content = '<div class="domus-detail">' +
                        Domus.UI.buildBackButton('units') +
                        '<h2>' + Domus.Utils.escapeHtml(unit.label || '') + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml(unit.unitType || '') + '</p>' +
                        '<div class="domus-section">' + tenanciesHeader +
                        Domus.Tenancies.renderInline(allTenancies) + '</div>' +
                        '<div class="domus-section">' + bookingsHeader +
                        Domus.Bookings.renderInline(unit.bookings || []) + '</div>' +
                        '<div class="domus-section">' + documentsHeader +
                        Domus.Documents.renderList('unit', id) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    bindDetailActions(id, unit);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, unit) {
            const editBtn = document.getElementById('domus-unit-edit');
            const deleteBtn = document.getElementById('domus-unit-delete');

            editBtn?.addEventListener('click', () => openEditModal(id));
            deleteBtn?.addEventListener('click', () => {
                if (!confirm(t('domus', 'Delete unit?'))) {
                    return;
                }
                Domus.Api.deleteUnit(id)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Unit deleted.'), 'success');
                        Domus.UI.renderSidebar('');
                        renderList();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });

            document.getElementById('domus-add-tenancy')?.addEventListener('click', () => {
                Domus.Tenancies.openCreateModal({ unitId: id }, () => renderDetail(id));
            });
            document.getElementById('domus-add-unit-booking')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({ propertyId: unit?.propertyId, unitId: id }, () => renderDetail(id));
            });
            document.getElementById('domus-unit-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('unit', id, () => renderDetail(id));
            });
        }

        function openEditModal(id) {
            Promise.all([
                Domus.Api.get('/units/' + id),
                Domus.Api.getProperties()
            ])
                .then(([unit, properties]) => {
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Edit unit'),
                        content: buildUnitForm(propertyOptions, unit)
                    });
                    bindUnitForm(modal, data => Domus.Api.updateUnit(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Unit updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')));
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindUnitForm(modalContext, onSubmit) {
            const form = modalContext.modalEl.querySelector('#domus-unit-form');
            const cancel = modalContext.modalEl.querySelector('#domus-unit-cancel');
            cancel?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = {};
                Array.prototype.forEach.call(form.elements, el => { if (el.name) data[el.name] = el.value; });
                if (!data.propertyId) {
                    Domus.UI.showNotification(t('domus', 'Property is required.'), 'error');
                    return;
                }
                if (!data.label) {
                    Domus.UI.showNotification(t('domus', 'Label is required.'), 'error');
                    return;
                }
                onSubmit(data);
            });
        }

        function buildUnitForm(propertyOptions, unit) {
            const selectedPropertyId = unit?.propertyId ? String(unit.propertyId) : '';
            return '<div class="domus-form">' +
                '<form id="domus-unit-form">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + ' *<select name="propertyId" required>' +
                propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedPropertyId ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Label')) + ' *<input name="label" required value="' + (unit?.label ? Domus.Utils.escapeHtml(unit.label) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit number')) + '<input name="unitNumber" value="' + (unit?.unitNumber ? Domus.Utils.escapeHtml(unit.unitNumber) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit type')) + '<input name="unitType" value="' + (unit?.unitType ? Domus.Utils.escapeHtml(unit.unitType) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Living area')) + '<input name="livingArea" type="number" step="0.01" value="' + (unit?.livingArea ? Domus.Utils.escapeHtml(unit.livingArea) : '') + '"></label>' +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-unit-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        return { renderList, renderDetail, renderListInline, openCreateModal };
    })();

    /**
     * Partners view
     */
    Domus.Partners = (function() {
        function renderInline(partners) {
            const rows = (partners || []).map(partner => [
                Domus.Utils.escapeHtml(partner.name || ''),
                Domus.Utils.escapeHtml(partner.partnerType || ''),
                Domus.Utils.escapeHtml(partner.email || '')
            ]);
            return Domus.UI.buildTable([
                t('domus', 'Name'),
                t('domus', 'Type'),
                t('domus', 'Email')
            ], rows);
        }

        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading partners…'));
            Domus.Api.getPartners()
                .then(partners => {
                    const toolbar = '<div class="domus-toolbar">' +
                        '<button id="domus-partner-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'New partner')) + '</button>' +
                        '<label class="domus-inline-label">' + Domus.Utils.escapeHtml(t('domus', 'Type')) + ' <select id="domus-partner-filter">' +
                        '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All')) + '</option>' +
                        '<option value="tenant">' + Domus.Utils.escapeHtml(t('domus', 'Tenant')) + '</option>' +
                        '<option value="owner">' + Domus.Utils.escapeHtml(t('domus', 'Owner')) + '</option>' +
                        '</select></label>' +
                        '</div>';
                    const rows = (partners || []).map(p => [
                        Domus.Utils.escapeHtml(p.name || ''),
                        Domus.Utils.escapeHtml(p.partnerType || ''),
                        Domus.Utils.escapeHtml(p.email || ''),
                        '<button class="domus-link" data-partner-id="' + p.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Open')) + '</button>'
                    ]);
                    Domus.UI.renderContent(toolbar + Domus.UI.buildTable([
                        t('domus', 'Name'), t('domus', 'Type'), t('domus', 'Email'), ''
                    ], rows));
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            document.getElementById('domus-partner-create')?.addEventListener('click', openCreateModal);
            document.getElementById('domus-partner-filter')?.addEventListener('change', function() {
                Domus.Api.getPartners(this.value).then(renderPartnersTable).catch(err => Domus.UI.showError(err.message));
            });
            bindPartnerLinks();
        }

        function renderPartnersTable(partners) {
            const rows = (partners || []).map(p => [
                Domus.Utils.escapeHtml(p.name || ''),
                Domus.Utils.escapeHtml(p.partnerType || ''),
                Domus.Utils.escapeHtml(p.email || ''),
                '<button class="domus-link" data-partner-id="' + p.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Open')) + '</button>'
            ]);
            const table = Domus.UI.buildTable([
                t('domus', 'Name'), t('domus', 'Type'), t('domus', 'Email'), ''
            ], rows);
            const content = document.getElementById('app-content');
            if (content) {
                const tables = content.querySelectorAll('.domus-table');
                if (tables.length) {
                    tables[0].outerHTML = table;
                }
            }
            bindPartnerLinks();
        }

        function bindPartnerLinks() {
            document.querySelectorAll('button[data-partner-id]').forEach(btn => {
                btn.addEventListener('click', () => Domus.Router.navigate('partnerDetail', [btn.getAttribute('data-partner-id')]));
            });
        }

        function openCreateModal() {
            const modal = Domus.UI.openModal({
                title: t('domus', 'New partner'),
                content: buildPartnerForm()
            });
            bindPartnerForm(modal, data => Domus.Api.createPartner(data)
                .then(() => {
                    Domus.UI.showNotification(t('domus', 'Partner created.'), 'success');
                    modal.close();
                    renderList();
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error')));
        }

        function renderDetail(id) {
            Domus.UI.showLoading(t('domus', 'Loading partner…'));
            Domus.Api.get('/partners/' + id)
                .then(partner => {
                    const sidebar = '<div class="domus-detail-sidebar">' +
                        '<h3>' + Domus.Utils.escapeHtml(t('domus', 'Partner actions')) + '</h3>' +
                        '<button id="domus-partner-edit" data-id="' + id + '">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>' +
                        '<button id="domus-partner-delete" data-id="' + id + '">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                        '</div>';
                    Domus.UI.renderSidebar(sidebar);

                    const tenanciesHeader = Domus.UI.buildSectionHeader(t('domus', 'Tenancies'), {
                        id: 'domus-add-partner-tenancy',
                        title: t('domus', 'Add tenancy'),
                        dataset: { partnerId: id }
                    });
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), {
                        id: 'domus-partner-link-doc',
                        title: t('domus', 'Link file'),
                        dataset: { entityType: 'partner', entityId: id }
                    });

                    const content = '<div class="domus-detail">' +
                        Domus.UI.buildBackButton('partners') +
                        '<h2>' + Domus.Utils.escapeHtml(partner.name || '') + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml(partner.partnerType || '') + '</p>' +
                        '<div class="domus-section">' + tenanciesHeader +
                        Domus.Tenancies.renderInline(partner.tenancies || []) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Reports')) + '</h3>' +
                        Domus.Reports.renderInline(partner.reports || []) + '</div>' +
                        '<div class="domus-section">' + documentsHeader +
                        Domus.Documents.renderList('partner', id) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    bindDetailActions(id);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id) {
            const editBtn = document.getElementById('domus-partner-edit');
            const deleteBtn = document.getElementById('domus-partner-delete');

            editBtn?.addEventListener('click', () => openEditModal(id));
            deleteBtn?.addEventListener('click', () => {
                if (!confirm(t('domus', 'Delete partner?'))) {
                    return;
                }
                Domus.Api.deletePartner(id)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Partner deleted.'), 'success');
                        Domus.UI.renderSidebar('');
                        renderList();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });

            document.getElementById('domus-add-partner-tenancy')?.addEventListener('click', () => {
                Domus.Tenancies.openCreateModal({ partnerId: id }, () => renderDetail(id));
            });
            document.getElementById('domus-partner-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('partner', id, () => renderDetail(id));
            });
        }

        function openEditModal(id) {
            Domus.Api.get('/partners/' + id)
                .then(partner => {
                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Edit partner'),
                        content: buildPartnerForm(partner)
                    });
                    bindPartnerForm(modal, data => Domus.Api.updatePartner(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Partner updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')));
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindPartnerForm(modalContext, onSubmit) {
            const form = modalContext.modalEl.querySelector('#domus-partner-form');
            const cancel = modalContext.modalEl.querySelector('#domus-partner-cancel');
            cancel?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = {};
                Array.prototype.forEach.call(form.elements, el => { if (el.name) data[el.name] = el.value; });
                if (!data.name) {
                    Domus.UI.showNotification(t('domus', 'Name is required.'), 'error');
                    return;
                }
                onSubmit(data);
            });
        }

        function buildPartnerForm(partner) {
            const defaultPartnerType = partner?.partnerType || 'tenant';
            return '<div class="domus-form">' +
                '<form id="domus-partner-form">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Name')) + ' *<input name="name" required value="' + (partner?.name ? Domus.Utils.escapeHtml(partner.name) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Type')) + '<select name="partnerType">' +
                '<option value="tenant"' + (defaultPartnerType === 'tenant' ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(t('domus', 'Tenant')) + '</option>' +
                '<option value="owner"' + (defaultPartnerType === 'owner' ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(t('domus', 'Owner')) + '</option>' +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Email')) + '<input name="email" type="email" value="' + (partner?.email ? Domus.Utils.escapeHtml(partner.email) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Phone')) + '<input name="phone" value="' + (partner?.phone ? Domus.Utils.escapeHtml(partner.phone) : '') + '"></label>' +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-partner-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        return { renderList, renderDetail, renderInline };
    })();

    /**
     * Tenancies view
     */
    Domus.Tenancies = (function() {
        function formatPartnerNames(partners) {
            return (partners || [])
                .map(p => p.name)
                .filter(Boolean)
                .join(', ');
        }

        function formatUnitLabel(tenancy) {
            if (tenancy.unitLabel) {
                return tenancy.unitLabel;
            }
            if (tenancy.unitId) {
                return `${t('domus', 'Unit')} #${tenancy.unitId}`;
            }
            return '';
        }

        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading tenancies…'));
            Domus.Api.getTenancies()
                .then(tenancies => {
                    const toolbar = '<div class="domus-toolbar">' +
                        '<button id="domus-tenancy-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'New tenancy')) + '</button>' +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';
                    const rows = (tenancies || []).map(tn => {
                        const partnerLabel = tn.partnerName || formatPartnerNames(tn.partners);
                        return [
                            Domus.Utils.escapeHtml(formatUnitLabel(tn)),
                            Domus.Utils.escapeHtml(partnerLabel || ''),
                            Domus.Utils.escapeHtml(tn.status || ''),
                            '<button class="domus-link" data-tenancy-id="' + tn.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Open')) + '</button>'
                        ];
                    });
                    Domus.UI.renderContent(toolbar + Domus.UI.buildTable([
                        t('domus', 'Unit'), t('domus', 'Partner'), t('domus', 'Status'), ''
                    ], rows));
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            document.getElementById('domus-tenancy-create')?.addEventListener('click', () => openCreateModal());
            document.querySelectorAll('button[data-tenancy-id]').forEach(btn => {
                btn.addEventListener('click', () => Domus.Router.navigate('tenancyDetail', [btn.getAttribute('data-tenancy-id')]));
            });
        }

        function renderInline(tenancies) {
            const rows = (tenancies || []).map(tn => [
                Domus.Utils.escapeHtml(formatUnitLabel(tn)),
                Domus.Utils.escapeHtml(formatPartnerNames(tn.partners) || tn.partnerName || ''),
                Domus.Utils.escapeHtml(tn.status || ''),
                Domus.Utils.escapeHtml(tn.period || '')
            ]);
            return Domus.UI.buildTable([
                t('domus', 'Unit'), t('domus', 'Partners'), t('domus', 'Status'), t('domus', 'Period')
            ], rows);
        }

        function openCreateModal(prefill = {}, onCreated) {
            Promise.all([
                Domus.Api.getUnits(),
                Domus.Api.getPartners()
            ])
                .then(([units, partners]) => {
                    const unitOptions = (units || []).map(u => ({
                        value: u.id,
                        label: u.label || `${t('domus', 'Unit')} #${u.id}`
                    }));
                    const partnerOptions = (partners || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Partner')} #${p.id}`
                    }));

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'New tenancy'),
                        content: buildTenancyForm(unitOptions, partnerOptions, prefill)
                    });
                    bindTenancyForm(modal, data => Domus.Api.createTenancy(data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Tenancy created.'), 'success');
                            modal.close();
                            (onCreated || renderList)();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')));
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function renderDetail(id) {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading tenancy…'));
            Domus.Api.get('/tenancies/' + id)
                .then(tenancy => {
                    const partnerLabel = formatPartnerNames(tenancy.partners);
                    const detailsTable = Domus.UI.buildTable([
                        t('domus', 'Unit'),
                        t('domus', 'Partners'),
                        t('domus', 'Start date'),
                        t('domus', 'End date'),
                        t('domus', 'Base rent'),
                        t('domus', 'Service charge'),
                        t('domus', 'Prepayment'),
                        t('domus', 'Deposit')
                    ], [[
                        Domus.Utils.escapeHtml(formatUnitLabel(tenancy)),
                        Domus.Utils.escapeHtml(partnerLabel || t('domus', 'None')),
                        Domus.Utils.escapeHtml(tenancy.startDate || ''),
                        Domus.Utils.escapeHtml(tenancy.endDate || ''),
                        Domus.Utils.escapeHtml(tenancy.baseRent || ''),
                        Domus.Utils.escapeHtml(tenancy.serviceCharge || ''),
                        tenancy.serviceChargeAsPrepayment ? t('domus', 'Yes') : t('domus', 'No'),
                        Domus.Utils.escapeHtml(tenancy.deposit || '')
                    ]]);

                    const sidebar = '<div class="domus-detail-sidebar">' +
                        '<h3>' + Domus.Utils.escapeHtml(t('domus', 'Tenancy actions')) + '</h3>' +
                        '<button id="domus-tenancy-edit">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>' +
                        '<button id="domus-tenancy-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                        '</div>';
                    Domus.UI.renderSidebar(sidebar);

                    const bookingsHeader = Domus.UI.buildSectionHeader(t('domus', 'Bookings'), {
                        id: 'domus-add-tenancy-booking',
                        title: t('domus', 'Add booking'),
                        dataset: { tenancyId: id, unitId: tenancy.unitId, propertyId: tenancy.propertyId }
                    });
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), {
                        id: 'domus-tenancy-link-doc',
                        title: t('domus', 'Link file'),
                        dataset: { entityType: 'tenancy', entityId: id }
                    });
                    const reportsHeader = Domus.UI.buildSectionHeader(t('domus', 'Reports'), Domus.Role.isOwnerView() ? {
                        id: 'domus-tenancy-report',
                        title: t('domus', 'Generate report'),
                        dataset: { tenancyId: id }
                    } : null);

                    const content = '<div class="domus-detail">' +
                        Domus.UI.buildBackButton('tenancies') +
                        '<div class="domus-detail-header">' +
                        '<div>' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Tenancy')) + ' #' + Domus.Utils.escapeHtml(id) + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml(tenancy.status || '') + '</p>' +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Details')) + '</h3>' +
                        detailsTable + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Partners')) + '</h3>' +
                        Domus.Partners.renderInline(tenancy.partners || []) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Conditions')) + '</h3>' +
                        '<p>' + Domus.Utils.escapeHtml(tenancy.conditions || t('domus', 'No conditions provided.')) + '</p></div>' +
                        '<div class="domus-section">' + bookingsHeader +
                        Domus.Bookings.renderInline(tenancy.bookings || []) + '</div>' +
                        '<div class="domus-section">' + documentsHeader +
                        Domus.Documents.renderList('tenancy', id) + '</div>' +
                        '<div class="domus-section">' + reportsHeader +
                        Domus.Reports.renderInline(tenancy.reports || [], null, id) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    bindDetailActions(id, tenancy);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, tenancy) {
            document.getElementById('domus-tenancy-edit')?.addEventListener('click', () => openEditModal(id, tenancy));
            document.getElementById('domus-tenancy-delete')?.addEventListener('click', () => {
                if (!confirm(t('domus', 'Delete tenancy?'))) {
                    return;
                }
                Domus.Api.deleteTenancy(id)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Tenancy deleted.'), 'success');
                        Domus.UI.renderSidebar('');
                        renderList();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });

            document.getElementById('domus-add-tenancy-booking')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({ tenancyId: id, unitId: tenancy.unitId, propertyId: tenancy.propertyId }, () => renderDetail(id));
            });
            document.getElementById('domus-tenancy-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('tenancy', id, () => renderDetail(id));
            });
            document.getElementById('domus-tenancy-report')?.addEventListener('click', () => {
                Domus.Reports.createForTenancy(id, () => renderDetail(id));
            });
        }

        function bindTenancyForm(modalContext, onSubmit) {
            const form = modalContext.modalEl.querySelector('#domus-tenancy-form');
            const cancel = modalContext.modalEl.querySelector('#domus-tenancy-cancel');
            cancel?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = {};
                Array.prototype.forEach.call(form.elements, el => {
                    if (!el.name) return;
                    if (el.type === 'checkbox') {
                        data[el.name] = el.checked ? 1 : 0;
                    } else if (el.multiple) {
                        data[el.name] = Array.from(el.selectedOptions).map(opt => opt.value);
                    } else {
                        data[el.name] = el.value;
                    }
                });
                if (!data.unitId || !data.partnerIds || data.partnerIds.length === 0) {
                    Domus.UI.showNotification(t('domus', 'Unit and at least one partner are required.'), 'error');
                    return;
                }
                if (!data.startDate || !data.baseRent) {
                    Domus.UI.showNotification(t('domus', 'Start date and base rent are required.'), 'error');
                    return;
                }
                onSubmit(data);
            });
        }

        function openEditModal(id, tenancy) {
            Promise.all([
                Domus.Api.getUnits(),
                Domus.Api.getPartners()
            ])
                .then(([units, partners]) => {
                    const unitOptions = (units || []).map(u => ({
                        value: u.id,
                        label: u.label || `${t('domus', 'Unit')} #${u.id}`
                    }));
                    const partnerOptions = (partners || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Partner')} #${p.id}`
                    }));

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Edit tenancy'),
                        content: buildTenancyForm(unitOptions, partnerOptions, tenancy)
                    });
                    bindTenancyForm(modal, data => Domus.Api.updateTenancy(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Tenancy updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')));
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function buildTenancyForm(unitOptions, partnerOptions, tenancy) {
            const tn = tenancy || {};
            if (tn.partnerId && !tn.partnerIds) {
                tn.partnerIds = [tn.partnerId];
            }
            const partnerIds = (tn.partnerIds || []).map(String);
            const selectedUnitId = tn.unitId !== undefined && tn.unitId !== null ? String(tn.unitId) : '';
            return '<div class="domus-form">' +
                '<form id="domus-tenancy-form">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + ' *<select name="unitId" required>' +
                unitOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (selectedUnitId === String(opt.value) ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Partners')) + ' *<select name="partnerIds" multiple required size="4">' +
                partnerOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (partnerIds.includes(String(opt.value)) ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Start date')) + ' *<input type="date" name="startDate" required value="' + (tn.startDate ? Domus.Utils.escapeHtml(tn.startDate) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'End date')) + '<input type="date" name="endDate" value="' + (tn.endDate ? Domus.Utils.escapeHtml(tn.endDate) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Base rent')) + ' *<input type="number" step="0.01" name="baseRent" required value="' + (tn.baseRent ? Domus.Utils.escapeHtml(tn.baseRent) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Service charge')) + '<input type="number" step="0.01" name="serviceCharge" value="' + (tn.serviceCharge ? Domus.Utils.escapeHtml(tn.serviceCharge) : '') + '"></label>' +
                '<label class="domus-inline-label"><input type="checkbox" name="serviceChargeAsPrepayment" ' + (tn.serviceChargeAsPrepayment ? 'checked' : '') + '> ' + Domus.Utils.escapeHtml(t('domus', 'Service charge as prepayment')) + '</label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Deposit')) + '<input type="number" step="0.01" name="deposit" value="' + (tn.deposit ? Domus.Utils.escapeHtml(tn.deposit) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Conditions')) + '<textarea name="conditions">' + (tn.conditions ? Domus.Utils.escapeHtml(tn.conditions) : '') + '</textarea></label>' +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-tenancy-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        return { renderList, renderDetail, renderInline, openCreateModal };
    })();

    /**
     * Bookings view
     */
    Domus.Bookings = (function() {
        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading bookings…'));
            Domus.Api.getBookings()
                .then(bookings => {
                    const toolbar = '<div class="domus-toolbar">' +
                        '<button id="domus-booking-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'New booking')) + '</button>' +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';
                    const rows = (bookings || []).map(b => [
                        Domus.Utils.escapeHtml(b.bookingType || ''),
                        Domus.Utils.escapeHtml(b.category || ''),
                        Domus.Utils.escapeHtml((b.amount || 0).toString()),
                        '<button class="domus-link" data-booking-id="' + b.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Open')) + '</button>'
                    ]);
                    Domus.UI.renderContent(toolbar + Domus.UI.buildTable([
                        t('domus', 'Type'), t('domus', 'Category'), t('domus', 'Amount'), ''
                    ], rows));
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            document.getElementById('domus-booking-create')?.addEventListener('click', () => openCreateModal());
            document.querySelectorAll('button[data-booking-id]').forEach(btn => {
                btn.addEventListener('click', () => Domus.Router.navigate('bookingDetail', [btn.getAttribute('data-booking-id')]));
            });
        }

        function renderInline(bookings) {
            const rows = (bookings || []).map(b => [
                Domus.Utils.escapeHtml(b.bookingType || ''),
                Domus.Utils.escapeHtml(b.category || ''),
                Domus.Utils.escapeHtml((b.amount || 0).toString())
            ]);
            return Domus.UI.buildTable([
                t('domus', 'Type'), t('domus', 'Category'), t('domus', 'Amount')
            ], rows);
        }

        function openCreateModal(defaults = {}, onCreated) {
            Promise.all([
                Domus.Api.getProperties(),
                Domus.Api.getUnits(),
                Domus.Api.getTenancies()
            ])
                .then(([properties, units, tenancies]) => {
                    const bookingTypeOptions = [
                        { value: 'income', label: t('domus', 'Income') },
                        { value: 'expense', label: t('domus', 'Expense') }
                    ];
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const unitOptions = [{ value: '', label: t('domus', 'Select unit') }].concat((units || []).map(u => ({
                        value: u.id,
                        label: u.label || `${t('domus', 'Unit')} #${u.id}`
                    })));
                    const tenancyOptions = [{ value: '', label: t('domus', 'Select tenancy') }].concat((tenancies || []).map(tn => ({
                        value: tn.id,
                        label: tn.unitLabel || `${t('domus', 'Tenancy')} #${tn.id}`
                    })));

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'New booking'),
                        content: buildBookingForm({ bookingTypeOptions, propertyOptions, unitOptions, tenancyOptions }, defaults),
                        size: 'large'
                    });
                    bindBookingForm(modal, data => Domus.Api.createBooking(data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Booking created.'), 'success');
                            modal.close();
                            (onCreated || renderList)();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')));
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function renderDetail(id) {
            Domus.UI.showLoading(t('domus', 'Loading booking…'));
            Domus.Api.get('/bookings/' + id)
                .then(booking => {
                    const sidebar = '<div class="domus-detail-sidebar">' +
                        '<h3>' + Domus.Utils.escapeHtml(t('domus', 'Booking actions')) + '</h3>' +
                        '<button id="domus-booking-edit" data-id="' + id + '">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>' +
                        '<button id="domus-booking-delete" data-id="' + id + '">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                        '</div>';
                    Domus.UI.renderSidebar(sidebar);

                    const content = '<div class="domus-detail">' +
                        Domus.UI.buildBackButton('bookings') +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Booking')) + ' #' + Domus.Utils.escapeHtml(id) + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml(booking.bookingType || '') + '</p>' +
                        '<div class="domus-section">' + Domus.UI.buildSectionHeader(t('domus', 'Documents'), {
                            id: 'domus-booking-link-doc',
                            title: t('domus', 'Link file'),
                            dataset: { entityType: 'booking', entityId: id }
                        }) +
                        Domus.Documents.renderList('booking', id) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    bindDetailActions(id);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id) {
            const editBtn = document.getElementById('domus-booking-edit');
            const deleteBtn = document.getElementById('domus-booking-delete');

            editBtn?.addEventListener('click', () => openEditModal(id));
            deleteBtn?.addEventListener('click', () => {
                if (!confirm(t('domus', 'Delete booking?'))) {
                    return;
                }
                Domus.Api.deleteBooking(id)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Booking deleted.'), 'success');
                        Domus.UI.renderSidebar('');
                        renderList();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });

            document.getElementById('domus-booking-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('booking', id, () => renderDetail(id));
            });
        }

        function openEditModal(id) {
            Promise.all([
                Domus.Api.get('/bookings/' + id),
                Domus.Api.getProperties(),
                Domus.Api.getUnits(),
                Domus.Api.getTenancies()
            ])
                .then(([booking, properties, units, tenancies]) => {
                    const bookingTypeOptions = [
                        { value: 'income', label: t('domus', 'Income') },
                        { value: 'expense', label: t('domus', 'Expense') }
                    ];
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const unitOptions = [{ value: '', label: t('domus', 'Select unit') }].concat((units || []).map(u => ({
                        value: u.id,
                        label: u.label || `${t('domus', 'Unit')} #${u.id}`
                    })));
                    const tenancyOptions = [{ value: '', label: t('domus', 'Select tenancy') }].concat((tenancies || []).map(tn => ({
                        value: tn.id,
                        label: tn.unitLabel || `${t('domus', 'Tenancy')} #${tn.id}`
                    })));

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Edit booking'),
                        content: buildBookingForm({ bookingTypeOptions, propertyOptions, unitOptions, tenancyOptions }, booking),
                        size: 'large'
                    });
                    bindBookingForm(modal, data => Domus.Api.updateBooking(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Booking updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')));
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindBookingForm(modalContext, onSubmit) {
            const form = modalContext.modalEl.querySelector('#domus-booking-form');
            const cancel = modalContext.modalEl.querySelector('#domus-booking-cancel');
            cancel?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = {};
                Array.prototype.forEach.call(form.elements, el => { if (el.name) data[el.name] = el.value; });
                Object.keys(data).forEach(key => { if (data[key] === '') delete data[key]; });

                if (!['income', 'expense'].includes(data.bookingType)) {
                    Domus.UI.showNotification(t('domus', 'Booking type must be income or expense.'), 'error');
                    return;
                }
                if (!data.date) {
                    Domus.UI.showNotification(t('domus', 'Date is required.'), 'error');
                    return;
                }
                if (!data.propertyId && !data.unitId && !data.tenancyId) {
                    Domus.UI.showNotification(t('domus', 'Select a related property, unit, or tenancy.'), 'error');
                    return;
                }

                onSubmit(data);
            });
        }

        function buildBookingForm(options, booking) {
            const { bookingTypeOptions, propertyOptions, unitOptions, tenancyOptions } = options;
            const selectedBookingType = booking?.bookingType || 'income';
            const selectedProperty = booking?.propertyId ? String(booking.propertyId) : '';
            const selectedUnit = booking?.unitId ? String(booking.unitId) : '';
            const selectedTenancy = booking?.tenancyId ? String(booking.tenancyId) : '';
            return '<div class="domus-form">' +
                '<form id="domus-booking-form">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Type')) + ' *<select name="bookingType" required>' +
                bookingTypeOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (opt.value === selectedBookingType ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Date')) + ' *<input type="date" name="date" required value="' + (booking?.date ? Domus.Utils.escapeHtml(booking.date) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Category')) + '<input name="category" value="' + (booking?.category ? Domus.Utils.escapeHtml(booking.category) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Amount')) + '<input type="number" step="0.01" name="amount" value="' + (booking?.amount || booking?.amount === 0 ? Domus.Utils.escapeHtml(booking.amount) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + '<select name="propertyId">' +
                propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedProperty ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + '<select name="unitId">' +
                unitOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedUnit ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Tenancy')) + '<select name="tenancyId">' +
                tenancyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedTenancy ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-booking-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        return { renderList, renderDetail, renderInline, openCreateModal };
    })();

    /**
     * Reports view
     */
    Domus.Reports = (function() {
        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading reports…'));
            Domus.Api.getReports()
                .then(reports => {
                    const toolbar = '<div class="domus-toolbar">' + Domus.UI.buildYearFilter(renderList) + '</div>';
                    const rows = (reports || []).map(r => [
                        Domus.Utils.escapeHtml(r.propertyName || ''),
                        Domus.Utils.escapeHtml((r.year || Domus.state.currentYear).toString()),
                        '<a class="domus-link" href="' + Domus.Utils.escapeHtml(r.downloadUrl || '#') + '">' + Domus.Utils.escapeHtml(t('domus', 'Download')) + '</a>'
                    ]);
                    Domus.UI.renderContent(toolbar + Domus.UI.buildTable([
                        t('domus', 'Property'), t('domus', 'Year'), ''
                    ], rows));
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function renderInline(reports, propertyId, tenancyId) {
            const rows = (reports || []).map(r => [
                Domus.Utils.escapeHtml((r.year || Domus.state.currentYear).toString()),
                '<a class="domus-link" href="' + Domus.Utils.escapeHtml(r.downloadUrl || '#') + '">' + Domus.Utils.escapeHtml(t('domus', 'Download')) + '</a>'
            ]);
            return Domus.UI.buildTable([t('domus', 'Year'), ''], rows);
        }

        function createForProperty(propertyId, onComplete) {
            if (!propertyId || !Domus.Role.isOwnerView()) return;
            Domus.Api.createReport(propertyId)
                .then(() => {
                    Domus.UI.showNotification(t('domus', 'Report created.'), 'success');
                    onComplete?.();
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function createForTenancy(tenancyId, onComplete) {
            if (!tenancyId || !Domus.Role.isOwnerView()) return;
            Domus.Api.createTenancyReport(tenancyId)
                .then(() => {
                    Domus.UI.showNotification(t('domus', 'Report created.'), 'success');
                    onComplete?.();
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        return { renderList, renderInline, createForProperty, createForTenancy };
    })();

    /**
     * Documents view
     */
    Domus.Documents = (function() {
        function renderList(entityType, entityId, options) {
            const containerId = `domus-documents-${entityType}-${entityId}`;
            const showLinkAction = options?.showLinkAction;
            Domus.Api.getDocuments(entityType, entityId)
                .then(docs => {
                    const rows = (docs || []).map(doc => [
                        '<a class="domus-link" href="' + Domus.Utils.escapeHtml(doc.fileId ? `/f/${doc.fileId}` : '#') + '">' + Domus.Utils.escapeHtml(doc.fileName || doc.fileId || '') + '</a>',
                        '<button class="domus-link" data-doc-id="' + doc.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Remove')) + '</button>'
                    ]);
                    const html = '<div id="' + containerId + '">' +
                        Domus.UI.buildTable([t('domus', 'File'), ''], rows) +
                        (showLinkAction ? buildLinkAction(entityType, entityId) : '') + '</div>';
                    const section = document.createElement('div');
                    section.innerHTML = html;
                    const placeholder = document.getElementById(containerId);
                    if (placeholder) {
                        placeholder.outerHTML = html;
                    } else {
                        Domus.UI.renderContent(html);
                    }
                    bindDocumentActions(entityType, entityId, containerId, showLinkAction);
                })
                .catch(() => {
                    const html = '<div id="' + containerId + '">' + t('domus', 'No documents found.') + (showLinkAction ? buildLinkAction(entityType, entityId) : '') + '</div>';
                    Domus.UI.renderContent(html);
                });
            return '<div id="' + containerId + '">' + t('domus', 'Loading documents…') + '</div>';
        }

        function buildLinkAction(entityType, entityId) {
            return '<button class="primary" data-doc-link="' + Domus.Utils.escapeHtml(entityType + ':' + entityId) + '">' + Domus.Utils.escapeHtml(t('domus', 'Link file')) + '</button>';
        }

        function buildLinkForm(entityType, entityId) {
            return '<div class="domus-doc-actions">' +
                '<p>' + Domus.Utils.escapeHtml(t('domus', 'Choose how to add your document')) + '</p>' +
                '<div class="domus-doc-action-buttons">' +
                '<button type="button" class="primary" data-doc-picker>' + Domus.Utils.escapeHtml(t('domus', 'Select from Nextcloud')) + '</button>' +
                '<button type="button" data-doc-upload-toggle>' + Domus.Utils.escapeHtml(t('domus', 'Upload new file')) + '</button>' +
                '</div>' +
                '<form class="domus-form domus-doc-upload hidden" data-doc-upload>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Select file')) + '<input type="file" name="file" required></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Year')) + '<input type="number" name="year" value="' + Domus.Utils.escapeHtml(new Date().getFullYear().toString()) + '" min="1900" max="2100"></label>' +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Upload')) + '</button>' +
                '<button type="button" data-doc-cancel>' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        function bindDocumentActions(entityType, entityId, containerId, showLinkAction) {
            document.querySelectorAll('#' + containerId + ' button[data-doc-id]').forEach(btn => {
                btn.addEventListener('click', function() {
                    Domus.Api.unlinkDocument(this.getAttribute('data-doc-id'))
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Document removed.'), 'success');
                            renderList(entityType, entityId);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            });

            if (showLinkAction) {
                document.querySelectorAll('#' + containerId + ' button[data-doc-link]').forEach(btn => {
                    btn.addEventListener('click', function() {
                        openLinkModal(entityType, entityId);
                    });
                });
            }
        }

        function openLinkModal(entityType, entityId, onLinked) {
            const modal = Domus.UI.openModal({
                title: t('domus', 'Link document'),
                content: buildLinkForm(entityType, entityId)
            });

            const pickerBtn = modal.modalEl.querySelector('[data-doc-picker]');
            const uploadToggle = modal.modalEl.querySelector('[data-doc-upload-toggle]');
            const uploadForm = modal.modalEl.querySelector('form[data-doc-upload]');
            const cancelBtn = modal.modalEl.querySelector('[data-doc-cancel]');

            const handleSuccess = () => {
                Domus.UI.showNotification(t('domus', 'Document linked.'), 'success');
                modal.close();
                if (onLinked) {
                    onLinked();
                } else {
                    renderList(entityType, entityId);
                }
            };

            pickerBtn?.addEventListener('click', () => {
                if (!window.OC || !OC.dialogs || typeof OC.dialogs.filepicker !== 'function') {
                    Domus.UI.showNotification(t('domus', 'Nextcloud file picker is not available.'), 'error');
                    return;
                }
                OC.dialogs.filepicker(t('domus', 'Select a file'), function(path, fileInfo) {
                    if (fileInfo?.type === 'dir' || fileInfo?.mimetype === 'httpd/unix-directory') {
                        Domus.UI.showNotification(t('domus', 'Please choose a file instead of a folder.'), 'error');
                        return;
                    }
                    const fileId = fileInfo?.id || fileInfo?.fileid || fileInfo?.fileId;
                    if (!fileId) {
                        Domus.UI.showNotification(t('domus', 'Could not read selected file.'), 'error');
                        return;
                    }
                    Domus.Api.linkDocument(entityType, entityId, { fileId })
                        .then(handleSuccess)
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                }, false, 'file', true, 1);
            });

            uploadToggle?.addEventListener('click', () => {
                uploadForm?.classList.toggle('hidden');
            });

            cancelBtn?.addEventListener('click', modal.close);

            uploadForm?.addEventListener('submit', function(e) {
                e.preventDefault();
                const fileInput = uploadForm.querySelector('input[name="file"]');
                if (!fileInput?.files?.length) {
                    Domus.UI.showNotification(t('domus', 'Please choose a file to upload.'), 'error');
                    return;
                }
                const formData = new FormData();
                formData.append('file', fileInput.files[0]);
                if (uploadForm.year?.value) {
                    formData.append('year', uploadForm.year.value);
                }
                Domus.Api.uploadDocument(entityType, entityId, formData)
                    .then(handleSuccess)
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        return { renderList, openLinkModal };
    })();

    /**
     * App initializer
     */
    Domus.App = (function() {
        function init() {
            // In real-world scenario, fetch role info from backend. Here we default to owner.
            Domus.Role.setRoleInfo({
                role: 'owner',
                hasOwnerRole: true,
                hasTenantOwnerRole: true
            });

            registerRoutes();
            Domus.Navigation.render();
            Domus.Router.navigate('dashboard');
        }

        function registerRoutes() {
            Domus.Router.register('dashboard', Domus.Dashboard.render);
            Domus.Router.register('properties', Domus.Properties.renderList);
            Domus.Router.register('propertyDetail', Domus.Properties.renderDetail);
            Domus.Router.register('units', Domus.Units.renderList);
            Domus.Router.register('unitDetail', Domus.Units.renderDetail);
            Domus.Router.register('partners', Domus.Partners.renderList);
            Domus.Router.register('partnerDetail', Domus.Partners.renderDetail);
            Domus.Router.register('tenancies', Domus.Tenancies.renderList);
            Domus.Router.register('tenancyDetail', Domus.Tenancies.renderDetail);
            Domus.Router.register('bookings', Domus.Bookings.renderList);
            Domus.Router.register('bookingDetail', Domus.Bookings.renderDetail);
            Domus.Router.register('reports', Domus.Reports.renderList);
        }

        return { init };
    })();

    document.addEventListener('DOMContentLoaded', function() {
        Domus.App.init();
    });
})();

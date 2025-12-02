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

        function request(method, path, data) {
            const opts = {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'OCS-APIREQUEST': 'true',
                    requesttoken: OC.requestToken
                }
            };

            if (data) {
                opts.body = JSON.stringify(data);
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
            getDocuments: (entityType, entityId) => request('GET', `/documents/${entityType}/${entityId}`),
            linkDocument: (entityType, entityId, data) => request('POST', `/documents/${entityType}/${entityId}`, data),
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
            }
        }

        function showLoading(message) {
            renderContent('<div class="domus-loading">' + Domus.Utils.escapeHtml(message || t('domus', 'Loading…')) + '</div>');
        }

        function showError(message) {
            renderContent('<div class="domus-error">' + Domus.Utils.escapeHtml(message || t('domus', 'An error occurred')) + '</div>');
        }

        function showNotification(message, type) {
            const container = document.createElement('div');
            container.className = 'domus-notification domus-notification-' + (type || 'info');
            container.textContent = message;
            document.body.appendChild(container);
            setTimeout(() => container.remove(), 4000);
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

        return {
            renderContent,
            renderSidebar,
            showLoading,
            showError,
            showNotification,
            buildTable,
            buildYearFilter
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

        function register(name, handler) {
            routes[name] = handler;
        }

        function navigate(name, args) {
            Domus.state.currentView = name;
            if (routes[name]) {
                routes[name].apply(null, args || []);
            }
            updateHash(name, args);
        }

        function updateHash(name, args) {
            const hash = '#/' + name + (args && args.length ? '/' + args.join('/') : '');
            if (window.location.hash !== hash) {
                window.location.hash = hash;
            }
        }

        function parseHash() {
            const hash = window.location.hash.replace(/^#\//, '');
            if (!hash) return null;
            const parts = hash.split('/');
            return { name: parts[0], args: parts.slice(1) };
        }

        window.addEventListener('hashchange', function() {
            const parsed = parseHash();
            if (parsed && routes[parsed.name]) {
                routes[parsed.name].apply(null, parsed.args);
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
                createBtn.addEventListener('click', renderCreateForm);
            }

            document.querySelectorAll('button[data-property-id]').forEach(btn => {
                btn.addEventListener('click', function() {
                    Domus.Router.navigate('propertyDetail', [this.getAttribute('data-property-id')]);
                });
            });
        }

        function renderCreateForm() {
            const html = '<div class="domus-form">' +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'New property')) + '</h2>' +
                '<form id="domus-property-form">' +
                buildTextInput('name', t('domus', 'Name'), true) +
                buildSelect('usageRole', t('domus', 'Usage role'), [
                    { value: 'manager', label: t('domus', 'Manager') },
                    { value: 'landlord', label: t('domus', 'Landlord') }
                ]) +
                buildTextInput('street', t('domus', 'Street')) +
                buildTextInput('zip', t('domus', 'ZIP')) +
                buildTextInput('city', t('domus', 'City')) +
                buildTextInput('country', t('domus', 'Country'), false, 'DE') +
                buildTextInput('type', t('domus', 'Type')) +
                buildTextarea('description', t('domus', 'Description')) +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-property-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
            Domus.UI.renderContent(html);
            bindCreateForm();
        }

        function bindCreateForm() {
            const form = document.getElementById('domus-property-form');
            const cancelBtn = document.getElementById('domus-property-cancel');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', renderList);
            }
            if (form) {
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    const data = formToObject(form);
                    if (!data.name) {
                        Domus.UI.showNotification(t('domus', 'Name is required.'), 'error');
                        return;
                    }
                    Domus.Api.createProperty(data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Property created.'), 'success');
                            renderList();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            }
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

                    const content = '<div class="domus-detail">' +
                        '<h2>' + Domus.Utils.escapeHtml(property.name || '') + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml([property.street, property.city].filter(Boolean).join(', ')) + '</p>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Units')) + '</h3>' +
                        Domus.Units.renderListInline(property.units || []) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Bookings')) + '</h3>' +
                        Domus.Bookings.renderInline(property.bookings || []) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Reports')) + '</h3>' +
                        Domus.Reports.renderInline(property.reports || [], property.id) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Documents')) + '</h3>' +
                        Domus.Documents.renderList('property', id) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    bindDetailActions(id);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id) {
            const editBtn = document.getElementById('domus-property-edit');
            const deleteBtn = document.getElementById('domus-property-delete');
            if (editBtn) {
                editBtn.addEventListener('click', () => renderEditForm(id));
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
        }

        function renderEditForm(id) {
            Domus.UI.showLoading(t('domus', 'Loading property…'));
            Domus.Api.getProperty(id)
                .then(property => {
                    const html = '<div class="domus-form">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Edit property')) + '</h2>' +
                        '<form id="domus-property-form">' +
                        buildTextInput('name', t('domus', 'Name'), true, property.name) +
                        buildSelect('usageRole', t('domus', 'Usage role'), [
                            { value: 'manager', label: t('domus', 'Manager') },
                            { value: 'landlord', label: t('domus', 'Landlord') }
                        ], property.usageRole) +
                        buildTextInput('street', t('domus', 'Street'), false, property.street) +
                        buildTextInput('zip', t('domus', 'ZIP'), false, property.zip) +
                        buildTextInput('city', t('domus', 'City'), false, property.city) +
                        buildTextInput('country', t('domus', 'Country'), false, property.country) +
                        buildTextInput('type', t('domus', 'Type'), false, property.type) +
                        buildTextarea('description', t('domus', 'Description'), property.description) +
                        '<div class="domus-form-actions">' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                        '<button type="button" id="domus-property-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '</div>' +
                        '</form>' +
                        '</div>';
                    Domus.UI.renderContent(html);
                    const form = document.getElementById('domus-property-form');
                    const cancelBtn = document.getElementById('domus-property-cancel');
                    if (cancelBtn) cancelBtn.addEventListener('click', () => renderDetail(id));
                    if (form) {
                        form.addEventListener('submit', function(e) {
                            e.preventDefault();
                            const data = formToObject(form);
                            Domus.Api.updateProperty(id, data)
                                .then(() => {
                                    Domus.UI.showNotification(t('domus', 'Property updated.'), 'success');
                                    renderDetail(id);
                                })
                                .catch(err => Domus.UI.showNotification(err.message, 'error'));
                        });
                    }
                })
                .catch(err => Domus.UI.showError(err.message));
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
            if (createBtn) createBtn.addEventListener('click', renderCreateForm);
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

        function renderCreateForm() {
            Domus.UI.showLoading(t('domus', 'Loading unit form…'));
            Domus.Api.getProperties()
                .then(properties => {
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const html = '<div class="domus-form">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'New unit')) + '</h2>' +
                        '<form id="domus-unit-form">' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + ' *<select name="propertyId" required>' +
                        propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                        '</select></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Label')) + ' *<input name="label" required></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit number')) + '<input name="unitNumber"></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit type')) + '<input name="unitType"></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Living area')) + '<input name="livingArea" type="number" step="0.01"></label>' +
                        '<div class="domus-form-actions">' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                        '<button type="button" id="domus-unit-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '</div>' +
                        '</form>' +
                        '</div>';
                    Domus.UI.renderContent(html);
                    const form = document.getElementById('domus-unit-form');
                    const cancel = document.getElementById('domus-unit-cancel');
                    if (cancel) cancel.addEventListener('click', renderList);
                    if (form) {
                        form.addEventListener('submit', function(e) {
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
                            Domus.Api.createUnit(data)
                                .then(() => {
                                    Domus.UI.showNotification(t('domus', 'Unit created.'), 'success');
                                    renderList();
                                })
                                .catch(err => Domus.UI.showNotification(err.message, 'error'));
                        });
                    }
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function renderDetail(id) {
            Domus.UI.showLoading(t('domus', 'Loading unit…'));
            Domus.Api.get('/units/' + id)
                .then(unit => {
                    const content = '<div class="domus-detail">' +
                        '<h2>' + Domus.Utils.escapeHtml(unit.label || '') + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml(unit.unitType || '') + '</p>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Tenancies')) + '</h3>' +
                        Domus.Tenancies.renderInline(unit.tenancies || []) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Bookings')) + '</h3>' +
                        Domus.Bookings.renderInline(unit.bookings || []) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Documents')) + '</h3>' +
                        Domus.Documents.renderList('unit', id) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        return { renderList, renderDetail, renderListInline };
    })();

    /**
     * Partners view
     */
    Domus.Partners = (function() {
        function renderList() {
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
            document.getElementById('domus-partner-create')?.addEventListener('click', renderCreateForm);
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

        function renderCreateForm() {
            const html = '<div class="domus-form">' +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'New partner')) + '</h2>' +
                '<form id="domus-partner-form">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Name')) + ' *<input name="name" required></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Type')) + '<select name="partnerType">' +
                '<option value="tenant">' + Domus.Utils.escapeHtml(t('domus', 'Tenant')) + '</option>' +
                '<option value="owner">' + Domus.Utils.escapeHtml(t('domus', 'Owner')) + '</option>' +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Email')) + '<input name="email" type="email"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Phone')) + '<input name="phone"></label>' +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-partner-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
            Domus.UI.renderContent(html);
            const form = document.getElementById('domus-partner-form');
            const cancel = document.getElementById('domus-partner-cancel');
            cancel?.addEventListener('click', renderList);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = {};
                Array.prototype.forEach.call(form.elements, el => { if (el.name) data[el.name] = el.value; });
                Domus.Api.createPartner(data)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Partner created.'), 'success');
                        renderList();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function renderDetail(id) {
            Domus.UI.showLoading(t('domus', 'Loading partner…'));
            Domus.Api.get('/partners/' + id)
                .then(partner => {
                    const content = '<div class="domus-detail">' +
                        '<h2>' + Domus.Utils.escapeHtml(partner.name || '') + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml(partner.partnerType || '') + '</p>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Tenancies')) + '</h3>' +
                        Domus.Tenancies.renderInline(partner.tenancies || []) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Reports')) + '</h3>' +
                        Domus.Reports.renderInline(partner.reports || []) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Documents')) + '</h3>' +
                        Domus.Documents.renderList('partner', id) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        return { renderList, renderDetail };
    })();

    /**
     * Tenancies view
     */
    Domus.Tenancies = (function() {
        function renderList() {
            Domus.UI.showLoading(t('domus', 'Loading tenancies…'));
            Domus.Api.getTenancies()
                .then(tenancies => {
                    const toolbar = '<div class="domus-toolbar">' +
                        '<button id="domus-tenancy-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'New tenancy')) + '</button>' +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';
                    const rows = (tenancies || []).map(tn => [
                        Domus.Utils.escapeHtml(tn.unitLabel || ''),
                        Domus.Utils.escapeHtml(tn.partnerName || ''),
                        Domus.Utils.escapeHtml(tn.status || ''),
                        '<button class="domus-link" data-tenancy-id="' + tn.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Open')) + '</button>'
                    ]);
                    Domus.UI.renderContent(toolbar + Domus.UI.buildTable([
                        t('domus', 'Unit'), t('domus', 'Partner'), t('domus', 'Status'), ''
                    ], rows));
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            document.getElementById('domus-tenancy-create')?.addEventListener('click', renderCreateForm);
            document.querySelectorAll('button[data-tenancy-id]').forEach(btn => {
                btn.addEventListener('click', () => Domus.Router.navigate('tenancyDetail', [btn.getAttribute('data-tenancy-id')]));
            });
        }

        function renderInline(tenancies) {
            const rows = (tenancies || []).map(tn => [
                Domus.Utils.escapeHtml(tn.unitLabel || ''),
                Domus.Utils.escapeHtml(tn.status || ''),
                Domus.Utils.escapeHtml(tn.period || '')
            ]);
            return Domus.UI.buildTable([
                t('domus', 'Unit'), t('domus', 'Status'), t('domus', 'Period')
            ], rows);
        }

        function renderCreateForm() {
            Domus.UI.showLoading(t('domus', 'Loading tenancy form…'));
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

                    const html = '<div class="domus-form">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'New tenancy')) + '</h2>' +
                        '<form id="domus-tenancy-form">' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + ' *<select name="unitId" required>' +
                        unitOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                        '</select></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Partner')) + ' *<select name="partnerId" required>' +
                        partnerOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                        '</select></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Start date')) + ' *<input type="date" name="startDate" required></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'End date')) + '<input type="date" name="endDate"></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Base rent')) + ' *<input type="number" step="0.01" name="baseRent" required></label>' +
                        '<div class="domus-form-actions">' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                        '<button type="button" id="domus-tenancy-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '</div>' +
                        '</form>' +
                        '</div>';
                    Domus.UI.renderContent(html);
                    const form = document.getElementById('domus-tenancy-form');
                    document.getElementById('domus-tenancy-cancel')?.addEventListener('click', renderList);
                    form?.addEventListener('submit', function(e) {
                        e.preventDefault();
                        const data = {};
                        Array.prototype.forEach.call(form.elements, el => { if (el.name) data[el.name] = el.value; });
                        Domus.Api.createTenancy(data)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', 'Tenancy created.'), 'success');
                                renderList();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function renderDetail(id) {
            Domus.UI.showLoading(t('domus', 'Loading tenancy…'));
            Domus.Api.get('/tenancies/' + id)
                .then(tenancy => {
                    const content = '<div class="domus-detail">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Tenancy')) + ' #' + Domus.Utils.escapeHtml(id) + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml(tenancy.status || '') + '</p>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Conditions')) + '</h3>' +
                        '<p>' + Domus.Utils.escapeHtml(tenancy.conditions || t('domus', 'No conditions provided.')) + '</p></div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Bookings')) + '</h3>' +
                        Domus.Bookings.renderInline(tenancy.bookings || []) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Documents')) + '</h3>' +
                        Domus.Documents.renderList('tenancy', id) + '</div>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Reports')) + '</h3>' +
                        Domus.Reports.renderInline(tenancy.reports || []) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        return { renderList, renderDetail, renderInline };
    })();

    /**
     * Bookings view
     */
    Domus.Bookings = (function() {
        function renderList() {
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
            document.getElementById('domus-booking-create')?.addEventListener('click', renderCreateForm);
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

        function renderCreateForm() {
            Domus.UI.showLoading(t('domus', 'Loading booking form…'));
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

                    const html = '<div class="domus-form">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'New booking')) + '</h2>' +
                        '<form id="domus-booking-form">' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Type')) + ' *<select name="bookingType" required>' +
                        bookingTypeOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                        '</select></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Date')) + ' *<input type="date" name="date" required></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Category')) + '<input name="category"></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Amount')) + '<input type="number" step="0.01" name="amount"></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + '<select name="propertyId">' +
                        propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                        '</select></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + '<select name="unitId">' +
                        unitOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                        '</select></label>' +
                        '<label>' + Domus.Utils.escapeHtml(t('domus', 'Tenancy')) + '<select name="tenancyId">' +
                        tenancyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                        '</select></label>' +
                        '<div class="domus-form-actions">' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                        '<button type="button" id="domus-booking-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '</div>' +
                        '</form>' +
                        '</div>';

                    Domus.UI.renderContent(html);
                    const form = document.getElementById('domus-booking-form');
                    document.getElementById('domus-booking-cancel')?.addEventListener('click', renderList);
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

                        Domus.Api.createBooking(data)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', 'Booking created.'), 'success');
                                renderList();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function renderDetail(id) {
            Domus.UI.showLoading(t('domus', 'Loading booking…'));
            Domus.Api.get('/bookings/' + id)
                .then(booking => {
                    const content = '<div class="domus-detail">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Booking')) + ' #' + Domus.Utils.escapeHtml(id) + '</h2>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml(booking.bookingType || '') + '</p>' +
                        '<div class="domus-section"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Documents')) + '</h3>' +
                        Domus.Documents.renderList('booking', id) + '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        return { renderList, renderDetail, renderInline };
    })();

    /**
     * Reports view
     */
    Domus.Reports = (function() {
        function renderList() {
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

        function renderInline(reports, propertyId) {
            const rows = (reports || []).map(r => [
                Domus.Utils.escapeHtml((r.year || Domus.state.currentYear).toString()),
                '<a class="domus-link" href="' + Domus.Utils.escapeHtml(r.downloadUrl || '#') + '">' + Domus.Utils.escapeHtml(t('domus', 'Download')) + '</a>'
            ]);
            let html = Domus.UI.buildTable([t('domus', 'Year'), ''], rows);
            if (propertyId && Domus.Role.isOwnerView()) {
                html += '<button class="primary" data-report-create="' + propertyId + '">' + Domus.Utils.escapeHtml(t('domus', 'Generate report')) + '</button>';
                setTimeout(() => {
                    document.querySelectorAll('button[data-report-create]').forEach(btn => {
                        btn.addEventListener('click', function() {
                            const pid = this.getAttribute('data-report-create');
                            Domus.Api.createReport(pid)
                                .then(() => {
                                    Domus.UI.showNotification(t('domus', 'Report created.'), 'success');
                                    Domus.Properties.renderDetail(pid);
                                })
                                .catch(err => Domus.UI.showNotification(err.message, 'error'));
                        });
                    });
                }, 0);
            }
            return html;
        }

        return { renderList, renderInline };
    })();

    /**
     * Documents view
     */
    Domus.Documents = (function() {
        function renderList(entityType, entityId) {
            const containerId = `domus-documents-${entityType}-${entityId}`;
            Domus.Api.getDocuments(entityType, entityId)
                .then(docs => {
                    const rows = (docs || []).map(doc => [
                        '<a class="domus-link" href="' + Domus.Utils.escapeHtml(doc.filePath || '#') + '">' + Domus.Utils.escapeHtml(doc.name || doc.filePath || '') + '</a>',
                        '<button class="domus-link" data-doc-id="' + doc.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Remove')) + '</button>'
                    ]);
                    const html = '<div id="' + containerId + '">' +
                        Domus.UI.buildTable([t('domus', 'File'), ''], rows) +
                        buildLinkForm(entityType, entityId) + '</div>';
                    const section = document.createElement('div');
                    section.innerHTML = html;
                    const placeholder = document.getElementById(containerId);
                    if (placeholder) {
                        placeholder.outerHTML = html;
                    } else {
                        Domus.UI.renderContent(html);
                    }
                    bindDocumentActions(entityType, entityId, containerId);
                })
                .catch(() => {
                    const html = '<div id="' + containerId + '">' + t('domus', 'No documents found.') + buildLinkForm(entityType, entityId) + '</div>';
                    Domus.UI.renderContent(html);
                });
            return '<div id="' + containerId + '">' + t('domus', 'Loading documents…') + '</div>';
        }

        function buildLinkForm(entityType, entityId) {
            return '<form class="domus-inline-form" data-doc-form>' +
                '<input type="text" name="filePath" placeholder="' + Domus.Utils.escapeHtml(t('domus', 'Path in Nextcloud')) + '">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Link file')) + '</button>' +
                '<input type="hidden" name="entityType" value="' + Domus.Utils.escapeHtml(entityType) + '">' +
                '<input type="hidden" name="entityId" value="' + Domus.Utils.escapeHtml(entityId) + '">' +
                '</form>';
        }

        function bindDocumentActions(entityType, entityId, containerId) {
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

            const form = document.querySelector('#' + containerId + ' form[data-doc-form]');
            if (form) {
                form.addEventListener('submit', function(e) {
                    e.preventDefault();
                    const data = { filePath: form.filePath.value };
                    Domus.Api.linkDocument(entityType, entityId, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Document linked.'), 'success');
                            renderList(entityType, entityId);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            }
        }

        return { renderList };
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

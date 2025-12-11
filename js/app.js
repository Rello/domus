(function() {
    'use strict';

    window.Domus = window.Domus || {};

    /**
     * Global state
     */
    Domus.state = {
        role: 'landlord',
        currentRoleView: 'landlord',
        availableRoles: [],
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

        function formatNumber(value, options = {}) {
            if (value === undefined || value === null) return '';
            const numeric = Number(value);
            if (!Number.isNaN(numeric)) {
                const {
                    minimumFractionDigits = 2,
                    maximumFractionDigits = 2,
                    useGrouping = true
                } = options;
                return numeric.toLocaleString(undefined, { minimumFractionDigits, maximumFractionDigits, useGrouping });
            }
            return String(value);
        }

        function formatCurrency(amount) {
            const formatted = formatNumber(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return formatted ? `€ ${formatted}` : '';
        }

        function formatPercentage(value) {
            if (value === undefined || value === null) return '';
            const numeric = Number(value);
            if (Number.isNaN(numeric)) return String(value);
            return `${formatNumber(numeric * 100, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })}%`;
        }

        function formatYear(value) {
            if (value === undefined || value === null) return '';
            const numeric = Number(value);
            if (Number.isNaN(numeric)) return String(value);
            return Math.trunc(numeric).toString();
        }

        function formatDate(value) {
            if (!value) return '';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) {
                return String(value);
            }
            return date.toLocaleDateString();
        }

        function formatAmount(amount, options = {}) {
            if (amount === undefined || amount === null) return '';
            const numeric = Number(amount);
            if (!Number.isNaN(numeric)) {
                return formatNumber(numeric, options);
            }
            return String(amount);
        }

        return { escapeHtml, formatAmount, formatNumber, formatCurrency, formatPercentage, formatYear, formatDate };
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
            getUnitStatistics: (unitId) => request('GET', `/statistics/units/${unitId}`),
            getUnitsStatisticsOverview: (propertyId) => {
                const params = new URLSearchParams();
                params.append('year', Domus.state.currentYear);
                if (propertyId) {
                    params.append('propertyId', propertyId);
                }
                return request('GET', `/statistics/units-overview?${params.toString()}`);
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
            changeTenancyConditions: (id, data) => request('POST', `/tenancies/${id}/change-conditions`, data),
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
            unlinkDocument: id => request('DELETE', `/documents/${id}`)
        };
    })();

    /**
     * Accounts helper
     */
    Domus.Accounts = (function() {
        function readAccounts() {
            const container = document.getElementById('app-content');
            const raw = container && container.dataset ? container.dataset.accounts : null;
            if (!raw) {
                return {};
            }
            try {
                return JSON.parse(raw);
            } catch (e) {
                console.error('Failed to parse accounts data', e);
                return {};
            }
        }

        const accounts = readAccounts();
        Domus.accounts = accounts;

        function toOptions(includePlaceholder = true) {
            const opts = Object.entries(accounts).map(([nr, data]) => ({
                value: nr,
                label: data && data.label ? `${nr} – ${data.label}` : nr
            }));
            if (includePlaceholder) {
                return [{ value: '', label: t('domus', 'Select account') }].concat(opts);
            }
            return opts;
        }

        function label(accountNr) {
            return (accounts && accounts[accountNr] && accounts[accountNr].label) || '';
        }

        return { toOptions, label };
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

        function normalizeCell(cell) {
            if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
                const content = cell.content !== undefined ? cell.content : (cell.value !== undefined ? cell.value : '');
                const classes = [];
                if (cell.className) classes.push(cell.className);
                if (cell.alignRight) classes.push('domus-cell-number');
                return {
                    content,
                    classAttr: classes.length ? ' class="' + Domus.Utils.escapeHtml(classes.join(' ')) + '"' : ''
                };
            }

            return { content: cell, classAttr: '' };
        }

        function normalizeHeader(header) {
            if (header && typeof header === 'object' && !Array.isArray(header)) {
                const label = header.label !== undefined ? header.label : (header.content !== undefined ? header.content : '');
                const classes = [];
                if (header.className) classes.push(header.className);
                if (header.alignRight) classes.push('domus-cell-number');
                return {
                    label,
                    classAttr: classes.length ? ' class="' + Domus.Utils.escapeHtml(classes.join(' ')) + '"' : ''
                };
            }

            return { label: header, classAttr: '' };
        }

        function buildTable(headers, rows) {
            let html = '<table class="domus-table">';
            html += '<thead><tr>' + headers.map(h => {
                const { label, classAttr } = normalizeHeader(h);
                return '<th' + classAttr + '>' + Domus.Utils.escapeHtml(label) + '</th>';
            }).join('') + '</tr></thead>';
            html += '<tbody>';
            if (!rows || rows.length === 0) {
                html += '<tr><td colspan="' + headers.length + '">' + Domus.Utils.escapeHtml(t('domus', 'No entries found.')) + '</td></tr>';
            } else {
                rows.forEach(row => {
                    const rowData = Array.isArray(row) ? { cells: row } : (row || {});
                    const cells = rowData.cells || [];
                    const classes = rowData.className ? ' class="' + Domus.Utils.escapeHtml(rowData.className) + '"' : '';
                    let dataAttrs = '';
                    if (rowData.dataset) {
                        Object.keys(rowData.dataset).forEach(key => {
                            const value = rowData.dataset[key];
                            if (value === undefined || value === null) return;
                            dataAttrs += ' data-' + Domus.Utils.escapeHtml(key) + '="' + Domus.Utils.escapeHtml(String(value)) + '"';
                        });
                    }
                    html += '<tr' + classes + dataAttrs + '>' + cells.map(cell => {
                        const { content, classAttr } = normalizeCell(cell);
                        return '<td' + classAttr + '>' + content + '</td>';
                    }).join('') + '</tr>';
                });
            }
            html += '</tbody></table>';
            return html;
        }

        function bindRowNavigation() {
            document.querySelectorAll('table.domus-table tr[data-navigate]').forEach(row => {
                const target = row.getAttribute('data-navigate');
                const argsRaw = row.getAttribute('data-args') || '';
                if (!target) return;
                row.addEventListener('click', function(e) {
                    if (e.target.closest('a') || e.target.closest('button')) {
                        return;
                    }
                    const args = argsRaw ? argsRaw.split(',').filter(Boolean) : [];
                    Domus.Router.navigate(target, args);
                });
            });
        }

        function buildCollapsible(content, options = {}) {
            const collapsed = options.collapsed !== false;
            const showLabel = options.showLabel || t('domus', 'Show');
            const hideLabel = options.hideLabel || t('domus', 'Hide');
            const id = options.id || ('domus-collapsible-' + Math.random().toString(36).slice(2));

            return '<div class="domus-collapsible" data-collapsible id="' + Domus.Utils.escapeHtml(id) + '">' +
                '<button type="button" class="domus-collapsible-toggle" data-target="' + Domus.Utils.escapeHtml(id) + '" data-show-label="' + Domus.Utils.escapeHtml(showLabel) + '" data-hide-label="' + Domus.Utils.escapeHtml(hideLabel) + '" aria-expanded="' + (!collapsed) + '">' + Domus.Utils.escapeHtml(collapsed ? showLabel : hideLabel) + '</button>' +
                '<div class="domus-collapsible-body"' + (collapsed ? ' hidden' : '') + '>' + content + '</div>' +
                '</div>';
        }

        function bindCollapsibles() {
            document.querySelectorAll('[data-collapsible] .domus-collapsible-toggle').forEach(btn => {
                btn.addEventListener('click', function() {
                    const targetId = this.getAttribute('data-target');
                    const body = targetId ? document.querySelector('#' + CSS.escape(targetId) + ' .domus-collapsible-body') : null;
                    if (!body) return;
                    const showLabel = this.getAttribute('data-show-label') || t('domus', 'Show');
                    const hideLabel = this.getAttribute('data-hide-label') || t('domus', 'Hide');
                    const isHidden = body.hasAttribute('hidden');
                    if (isHidden) {
                        body.removeAttribute('hidden');
                        this.textContent = hideLabel;
                        this.setAttribute('aria-expanded', 'true');
                    } else {
                        body.setAttribute('hidden', '');
                        this.textContent = showLabel;
                        this.setAttribute('aria-expanded', 'false');
                    }
                });
            });
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

        function buildStatCards(cards) {
            if (!cards || !cards.length) {
                return '';
            }

            const items = cards.map(card => {
                const value = card.value === undefined || card.value === null
                    ? '—'
                    : (card.formatValue === false ? card.value : Domus.Utils.formatAmount(card.value));
                const hint = card.hint ? '<div class="domus-stat-hint">' + Domus.Utils.escapeHtml(card.hint) + '</div>' : '';
                return '<div class="domus-stat-card">' +
                    '<div class="domus-stat-label">' + Domus.Utils.escapeHtml(card.label || '') + '</div>' +
                    '<div class="domus-stat-value">' + Domus.Utils.escapeHtml(String(value)) + '</div>' +
                    hint +
                    '</div>';
            }).join('');

            return '<div class="domus-stat-grid">' + items + '</div>';
        }

        function buildInfoList(items) {
            if (!items || !items.length) {
                return '';
            }

            const rows = items
                .filter(item => item && item.label)
                .map(item => {
                    const value = item.value === undefined || item.value === null || item.value === '' ? '—' : item.value;
                    return '<div class="domus-info-row">' +
                        '<dt>' + Domus.Utils.escapeHtml(item.label) + '</dt>' +
                        '<dd>' + Domus.Utils.escapeHtml(String(value)) + '</dd>' +
                        '</div>';
                }).join('');

            return '<dl class="domus-info-list">' + rows + '</dl>';
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
            bindRowNavigation,
            buildCollapsible,
            bindCollapsibles,
            buildStatCards,
            buildInfoList,
            openModal
        };
    })();

    /**
     * Role helper
     */
    Domus.Role = (function() {
        const roleConfigs = {
            landlord: {
                label: t('domus', 'Landlord'),
                navigation: [
                    { view: 'dashboard', label: t('domus', 'Dashboard') },
                    { view: 'units', label: t('domus', 'Units') },
                    { view: 'partners', label: t('domus', 'Partners') },
                    { view: 'tenancies', label: t('domus', 'Tenancies') },
                    { view: 'bookings', label: t('domus', 'Bookings') },
                    { view: 'reports', label: t('domus', 'Reports') }
                ],
                tenancyLabels: { singular: t('domus', 'Tenancy'), plural: t('domus', 'Tenancies'), action: t('domus', 'Add tenancy') },
                capabilities: { manageTenancies: true, manageBookings: true, manageDocuments: true, manageReports: true },
                unitDetail: { showBookings: true, showTenancyActions: true }
            },
            buildingMgmt: {
                label: t('domus', 'Building Mgmt'),
                navigation: [
                    { view: 'dashboard', label: t('domus', 'Dashboard') },
                    { view: 'properties', label: t('domus', 'Properties') },
                    { view: 'units', label: t('domus', 'Units') },
                    { view: 'bookings', label: t('domus', 'Bookings') },
                    { view: 'reports', label: t('domus', 'Reports') }
                ],
                tenancyLabels: { singular: t('domus', 'Owner'), plural: t('domus', 'Owners'), action: t('domus', 'Add owner') },
                capabilities: { manageTenancies: true, manageBookings: true, manageDocuments: true, manageReports: true },
                unitDetail: { showBookings: true, showTenancyActions: true }
            },
            tenant: {
                label: t('domus', 'Tenant'),
                navigation: [
                    { view: 'dashboard', label: t('domus', 'Dashboard') },
                    { view: 'tenancies', label: t('domus', 'My tenancies') },
                    { view: 'reports', label: t('domus', 'My reports') }
                ],
                tenancyLabels: { singular: t('domus', 'Tenancy'), plural: t('domus', 'My tenancies'), action: null },
                capabilities: { manageTenancies: false, manageBookings: false, manageDocuments: false, manageReports: false },
                unitDetail: { showBookings: false, showTenancyActions: false }
            }
        };

        const defaultRole = 'landlord';

        function setRoleInfo(info) {
            const providedRoles = Array.isArray(info.availableRoles)
                ? info.availableRoles.filter(role => roleConfigs[role])
                : [];
            Domus.state.availableRoles = providedRoles.length ? providedRoles : [defaultRole];
            const requestedRole = info.currentRole && roleConfigs[info.currentRole] ? info.currentRole : Domus.state.availableRoles[0];
            Domus.state.role = requestedRole;
            Domus.state.currentRoleView = requestedRole;
        }

        function setCurrentRoleView(role) {
            if (roleConfigs[role]) {
                Domus.state.currentRoleView = role;
                Domus.state.role = role;
            }
        }

        function getCurrentRole() {
            return Domus.state.currentRoleView;
        }

        function getAvailableRoles() {
            return Domus.state.availableRoles;
        }

        function getRoleConfig(role = getCurrentRole()) {
            return roleConfigs[role] || roleConfigs[defaultRole];
        }

        function getNavigationItems() {
            return (getRoleConfig().navigation || []).map(item => ({
                view: item.view,
                label: typeof item.label === 'function' ? item.label() : item.label,
                args: item.args
            }));
        }

        function getTenancyLabels() {
            const defaults = {
                singular: t('domus', 'Tenancy'),
                plural: t('domus', 'Tenancies'),
                action: t('domus', 'Add tenancy')
            };
            const labels = getRoleConfig().tenancyLabels || {};
            return {
                singular: labels.singular || defaults.singular,
                plural: labels.plural || defaults.plural,
                action: labels.action !== undefined ? labels.action : defaults.action
            };
        }

        function getUnitDetailConfig() {
            const defaults = { showBookings: true, showTenancyActions: true };
            return Object.assign({}, defaults, getRoleConfig().unitDetail || {});
        }

        function getRoleOptions() {
            return getAvailableRoles().map(role => ({
                value: role,
                label: getRoleConfig(role).label || role
            }));
        }

        function hasCapability(capability) {
            return !!getRoleConfig().capabilities?.[capability];
        }

        function isTenantView() {
            return getCurrentRole() === 'tenant';
        }

        function isBuildingMgmtView() {
            return getCurrentRole() === 'buildingMgmt';
        }

        return {
            setRoleInfo,
            setCurrentRoleView,
            getNavigationItems,
            getTenancyLabels,
            getUnitDetailConfig,
            hasCapability,
            isTenantView,
            isBuildingMgmtView,
            getCurrentRole,
            getAvailableRoles,
            getRoleOptions
        };
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

            const roleOptions = Domus.Role.getRoleOptions();
            if (roleOptions.length > 1) {
                const roleSwitcher = document.createElement('div');
                roleSwitcher.className = 'domus-role-switcher';
                const label = document.createElement('label');
                label.textContent = t('domus', 'View as');
                const select = document.createElement('select');
                select.innerHTML = roleOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('');
                select.value = Domus.state.currentRoleView;
                select.addEventListener('change', function() {
                    Domus.Role.setCurrentRoleView(this.value);
                    render();
                    Domus.Router.navigate('dashboard');
                });
                roleSwitcher.appendChild(label);
                roleSwitcher.appendChild(select);
                container.appendChild(roleSwitcher);
            }
        }

        function getMenuItems() {
            return Domus.Role.getNavigationItems();
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
            if (Domus.Role.isTenantView()) {
                return buildTenantDashboard(data);
            }
            if (Domus.Role.isBuildingMgmtView()) {
                return buildBuildingMgmtDashboard(data);
            }
            return buildLandlordDashboard(data);
        }

        function buildLandlordDashboard(data) {
            const tenancyLabels = Domus.Role.getTenancyLabels();
            const cards = [
                { label: t('domus', 'Properties'), value: data.propertyCount || 0 },
                { label: t('domus', 'Units'), value: data.unitCount || 0 },
                { label: tenancyLabels.plural, value: data.tenancyCount || 0 },
                { label: t('domus', 'Open bookings'), value: data.bookingCount || 0 }
            ];

            const cardHtml = cards.map(card => '<div class="domus-card"><div class="domus-card-title">' +
                Domus.Utils.escapeHtml(card.label) + '</div><div class="domus-card-value">' +
                Domus.Utils.escapeHtml(card.value.toString()) + '</div></div>').join('');

            const propertyRows = (data.properties || []).map(p => ({
                cells: [
                    Domus.Utils.escapeHtml(p.name || ''),
                    Domus.Utils.escapeHtml(p.city || ''),
                    Domus.Utils.escapeHtml((p.unitCount || 0).toString())
                ],
                dataset: { navigate: 'propertyDetail', args: p.id }
            }));

            const table = Domus.UI.buildTable([
                t('domus', 'Name'), t('domus', 'City'), t('domus', 'Units')
            ], propertyRows);

            setTimeout(Domus.UI.bindRowNavigation, 0);

            return '<div class="domus-cards">' + cardHtml + '</div>' +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Properties overview')) + '</h2>' + table;
        }

        function buildBuildingMgmtDashboard(data) {
            const cards = [
                { label: t('domus', 'Properties'), value: data.propertyCount || 0 },
                { label: t('domus', 'Units'), value: data.unitCount || 0 }
            ];

            const cardHtml = cards.map(card => '<div class="domus-card"><div class="domus-card-title">' +
                Domus.Utils.escapeHtml(card.label) + '</div><div class="domus-card-value">' +
                Domus.Utils.escapeHtml(card.value.toString()) + '</div></div>').join('');

            const propertyRows = (data.properties || []).map(p => ({
                cells: [
                    Domus.Utils.escapeHtml(p.name || ''),
                    Domus.Utils.escapeHtml(p.city || ''),
                    Domus.Utils.escapeHtml((p.unitCount || 0).toString())
                ],
                dataset: { navigate: 'propertyDetail', args: p.id }
            }));

            const table = Domus.UI.buildTable([
                t('domus', 'Name'), t('domus', 'City'), t('domus', 'Units')
            ], propertyRows);

            setTimeout(Domus.UI.bindRowNavigation, 0);

            return '<div class="domus-cards">' + cardHtml + '</div>' +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Properties overview')) + '</h2>' + table;
        }

        function buildTenantDashboard(data) {
            const tenancyRows = (data.tenancies || []).map(tn => ({
                cells: [
                    Domus.Utils.escapeHtml(tn.unitLabel || ''),
                    Domus.Utils.escapeHtml(tn.period || ''),
                    Domus.Utils.escapeHtml(tn.status || '')
                ],
                dataset: { navigate: 'tenancyDetail', args: tn.id }
            }));
            const reportRows = (data.reports || []).map(rp => [
                Domus.Utils.escapeHtml(rp.propertyName || ''),
                Domus.Utils.escapeHtml((rp.year || Domus.state.currentYear).toString()),
                '<a class="domus-link" href="' + Domus.Utils.escapeHtml(rp.downloadUrl || '#') + '">' + Domus.Utils.escapeHtml(t('domus', 'Download')) + '</a>'
            ]);

            setTimeout(Domus.UI.bindRowNavigation, 0);

            return '<h2>' + Domus.Utils.escapeHtml(t('domus', 'My tenancies')) + '</h2>' +
                Domus.UI.buildTable([t('domus', 'Unit'), t('domus', 'Period'), t('domus', 'Status')], tenancyRows) +
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
                    const rows = (properties || []).map(p => ({
                        cells: [
                            Domus.Utils.escapeHtml(p.name || ''),
                            Domus.Utils.escapeHtml([p.street, p.city].filter(Boolean).join(', ')),
                            Domus.Utils.escapeHtml((p.unitCount || 0).toString())
                        ],
                        dataset: { navigate: 'propertyDetail', args: p.id }
                    }));
                    const table = Domus.UI.buildTable([
                        t('domus', 'Name'), t('domus', 'Address'), t('domus', 'Units')
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

            Domus.UI.bindRowNavigation();
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
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading property…'));
            Domus.Api.getProperty(id)
                .then(property => {

                    const address = [property.street, property.city].filter(Boolean).join(', ');
                    const showBookingFeatures = Domus.Role.hasCapability('manageBookings');
                    const showReportActions = Domus.Role.hasCapability('manageReports');
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const stats = Domus.UI.buildStatCards([
                        { label: t('domus', 'Units'), value: (property.units || []).length, hint: t('domus', 'Total units in this property'), formatValue: false },
                        { label: t('domus', 'Bookings'), value: (property.bookings || []).length, hint: t('domus', 'Entries for the selected year'), formatValue: false },
                        { label: t('domus', 'Reports'), value: (property.reports || []).length, hint: t('domus', 'Available report downloads'), formatValue: false },
                        { label: t('domus', 'Year'), value: Domus.state.currentYear, hint: t('domus', 'Reporting context'), formatValue: false }
                    ]);

                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(property.type || t('domus', 'Property')) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(property.name || '') + '</h2>' +
                        '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(address) + '</p>' +
                        '<div class="domus-hero-tags">' +
                        (property.usageRole ? '<span class="domus-badge">' + Domus.Utils.escapeHtml(property.usageRole) + '</span>' : '') +
                        (property.city ? '<span class="domus-badge domus-badge-muted">' + Domus.Utils.escapeHtml(property.city) + '</span>' : '') +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        [
                            '<button id="domus-add-unit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Add unit')) + '</button>',
                            showBookingFeatures ? '<button id="domus-add-booking">' + Domus.Utils.escapeHtml(t('domus', 'Add booking')) + '</button>' : '',
                            showReportActions ? '<button id="domus-property-report">' + Domus.Utils.escapeHtml(t('domus', 'Generate report')) + '</button>' : '',
                            '<button id="domus-property-edit">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>',
                            '<button id="domus-property-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>'
                        ].filter(Boolean).join('') +
                        '</div>' +
                        '</div>';

                    const unitsHeader = Domus.UI.buildSectionHeader(t('domus', 'Units'));
                    const bookingsHeader = showBookingFeatures ? Domus.UI.buildSectionHeader(t('domus', 'Bookings')) : '';
                    const reportsHeader = showReportActions ? Domus.UI.buildSectionHeader(t('domus', 'Reports')) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-property-link-doc',
                        title: t('domus', 'Link file'),
                        label: t('domus', 'Link file'),
                        dataset: { entityType: 'property', entityId: id }
                    } : null);

                    const infoList = Domus.UI.buildInfoList([
                        { label: t('domus', 'Usage role'), value: property.usageRole },
                        { label: t('domus', 'Type'), value: property.type },
                        { label: t('domus', 'ZIP'), value: property.zip },
                        { label: t('domus', 'Country'), value: property.country },
                        { label: t('domus', 'Description'), value: property.description }
                    ]);

                    const content = '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('properties') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid">' +
                        '<div class="domus-dashboard-main">' +
                        '<div class="domus-panel">' + unitsHeader + '<div class="domus-panel-body">' +
                        Domus.Units.renderListInline(property.units || []) + '</div></div>' +
                        (showBookingFeatures ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(property.bookings || []) + '</div></div>' : '') +
                        (showReportActions ? '<div class="domus-panel">' + reportsHeader + '<div class="domus-panel-body">' +
                        Domus.Reports.renderInline(property.reports || [], property.id) + '</div></div>' : '') +
                        '</div>' +
                        '<div class="domus-dashboard-side">' +
                        '<div class="domus-panel">' + '<div class="domus-panel-header"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Property details')) + '</h3></div>' +
                        '<div class="domus-panel-body">' + infoList + '</div></div>' +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('property', id, { showLinkAction: documentActionsEnabled }) + '</div></div>' +
                        '</div>' +
                        '</div>' +
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
            Domus.Api.getUnitsStatisticsOverview()
                .then(statistics => {
                    const header = '<div class="domus-toolbar">' +
                        '<button id="domus-unit-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'New unit')) + '</button>' +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';

                    const table = renderStatisticsTable(statistics, {
                        buildRowDataset: (row) => row.unitId ? { navigate: 'unitDetail', args: row.unitId } : null
                    });

                    Domus.UI.renderContent(header + table);
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            const createBtn = document.getElementById('domus-unit-create');
            if (createBtn) createBtn.addEventListener('click', () => openCreateModal());
            Domus.UI.bindRowNavigation();
        }

        function renderListInline(units) {
            const rows = (units || []).map(u => [
                Domus.Utils.escapeHtml(u.label || ''),
                Domus.Utils.escapeHtml(u.unitNumber || ''),
                Domus.Utils.escapeHtml(u.unitType || '')
            ]);
            return Domus.UI.buildTable([t('domus', 'Label'), t('domus', 'Number'), t('domus', 'Type')], rows);
        }

        function renderStatisticsTable(statistics, options = {}) {
            if (!statistics) {
                return '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'No statistics available.')) + '</div>';
            }

            const columns = statistics.columns || [];
            const rowsData = statistics.rows || [];
            const yearColumn = columns.find(col => (col.key || '').toLowerCase() === 'year' || (col.label || '').toLowerCase() === 'year');

            function shouldAlignRight(format, hasNumericValues) {
                if (!format && !hasNumericValues) return false;
                return ['currency', 'percentage', 'ratio', 'number', 'year'].includes(format || (hasNumericValues ? 'currency' : ''));
            }

            const columnMeta = columns.map(col => {
                const columnFormat = col.format || (yearColumn && yearColumn.key === col.key ? 'year' : null);
                const hasNumericValues = rowsData.some(row => {
                    const value = row[col.key];
                    return value !== undefined && value !== null && !Number.isNaN(Number(value));
                });
                return Object.assign({}, col, {
                    format: columnFormat,
                    alignRight: shouldAlignRight(columnFormat, hasNumericValues)
                });
            });

            const headers = columnMeta.map(col => ({ label: col.label || col.key || '', alignRight: col.alignRight }));
            const sortedRows = [...rowsData];
            if (yearColumn) {
                sortedRows.sort((a, b) => (parseInt(b[yearColumn.key], 10) || 0) - (parseInt(a[yearColumn.key], 10) || 0));
            }

            const rows = sortedRows.map(row => {
                const cells = columnMeta.map((col, index) => {
                    const value = row[col.key];
                    const formatted = formatStatValue(value, col.format, col.unit);
                    if (formatted && formatted.alignRight && headers[index]) {
                        headers[index].alignRight = true;
                    }
                    return {
                        content: Domus.Utils.escapeHtml(formatted.content),
                        alignRight: formatted.alignRight
                    };
                });

                if (typeof options.buildRowDataset === 'function') {
                    const dataset = options.buildRowDataset(row) || null;
                    if (dataset) {
                        return { cells, dataset };
                    }
                }

                return cells;
            });

            return Domus.UI.buildTable(headers, rows);
        }

        function formatStatValue(value, format, unit) {
            if (value === undefined || value === null) {
                return { content: '', alignRight: false };
            }

            const numeric = Number(value);
            const isNumeric = !Number.isNaN(numeric);

            const resolvedFormat = format || (isNumeric ? 'currency' : null);
            const resolvedUnit = unit || (resolvedFormat === 'currency' ? '€' : null);

            const withUnit = (content) => {
                if (content === undefined || content === null || content === '') {
                    return content;
                }
                return resolvedUnit ? `${content} ${resolvedUnit}` : content;
            };

            if ((resolvedFormat === 'percentage' || resolvedFormat === 'ratio') && isNumeric) {
                return { content: withUnit(Domus.Utils.formatPercentage(numeric)), alignRight: true };
            }

            if (resolvedFormat === 'currency' && isNumeric) {
                const formatted = Domus.Utils.formatNumber(numeric, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return { content: withUnit(formatted), alignRight: true };
            }

            if (resolvedFormat === 'year' && isNumeric) {
                return { content: withUnit(Domus.Utils.formatYear(numeric)), alignRight: true };
            }

            if (isNumeric) {
                return { content: withUnit(Domus.Utils.formatNumber(numeric)), alignRight: true };
            }

            return { content: withUnit(String(value)), alignRight: false };
        }

        function openCreateModal(defaults = {}, onCreated) {
            Domus.Api.getProperties()
                .then(properties => {
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const availableProperties = propertyOptions.slice(1);
                    const firstPropertyId = availableProperties[0]?.value;

                    if (!availableProperties.length) {
                        Domus.UI.showNotification(t('domus', 'Create a property first before adding units.'), 'error');
                        return;
                    }

                    const showPropertySelect = Domus.Role.isBuildingMgmtView() || availableProperties.length > 1;
                    const requireProperty = true;
                    const effectiveDefaults = Object.assign({ propertyId: firstPropertyId }, defaults);
                    const defaultPropertyId = effectiveDefaults.propertyId;

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'New unit'),
                        content: buildUnitForm(propertyOptions, effectiveDefaults, { showPropertySelect, requireProperty, defaultPropertyId })
                    });
                    bindUnitForm(modal, data => Domus.Api.createUnit(data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Unit created.'), 'success');
                            modal.close();
                            (onCreated || renderList)();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { requireProperty });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function renderDetail(id) {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading unit…'));
            Promise.all([
                Domus.Api.get('/units/' + id),
                Domus.Api.getUnitStatistics(id).catch(() => null),
                Domus.Api.getBookings({ unitId: id }).catch(() => [])
            ])
                .then(([unit, statistics, bookings]) => {

                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const unitDetailConfig = Domus.Role.getUnitDetailConfig();
                    const canManageTenancies = Domus.Role.hasCapability('manageTenancies');
                    const canManageBookings = Domus.Role.hasCapability('manageBookings') && unitDetailConfig.showBookings;
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const allTenancies = (unit.activeTenancies || []).concat(unit.historicTenancies || []);
                    const subtitleParts = [unit.propertyName || '', unit.unitNumber].filter(Boolean);
                    const stats = Domus.UI.buildStatCards([
                        { label: tenancyLabels.plural, value: allTenancies.length, hint: t('domus', 'Active and historic'), formatValue: false },
                        { label: t('domus', 'Bookings'), value: (bookings || []).length, hint: t('domus', 'Entries for the selected year'), formatValue: false },
                        { label: t('domus', 'Living area'), value: unit.livingArea ? `${Domus.Utils.formatAmount(unit.livingArea)} m²` : '—', hint: t('domus', 'Reported size') },
                        { label: t('domus', 'Year'), value: Domus.Utils.formatYear(Domus.state.currentYear), hint: t('domus', 'Reporting context'), formatValue: false }
                    ]);

                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(unit.unitType || t('domus', 'Unit')) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(unit.label || '') + '</h2>' +
                        '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(subtitleParts.join(' • ')) + '</p>' +
                        '<div class="domus-hero-tags">' +
                        (unit.propertyName ? '<span class="domus-badge">' + Domus.Utils.escapeHtml(unit.propertyName) + '</span>' : '') +
                        (unit.unitNumber ? '<span class="domus-badge domus-badge-muted">' + Domus.Utils.escapeHtml(unit.unitNumber) + '</span>' : '') +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        [
                            (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action ? '<button id="domus-add-tenancy" class="primary" data-unit-id="' + id + '">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : ''),
                            (canManageBookings ? '<button id="domus-add-unit-booking">' + Domus.Utils.escapeHtml(t('domus', 'Add booking')) + '</button>' : ''),
                            '<button id="domus-unit-edit">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>',
                            '<button id="domus-unit-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>'
                        ].filter(Boolean).join('') +
                        '</div>' +
                        '</div>';

                    const tenanciesHeader = Domus.UI.buildSectionHeader(tenancyLabels.plural);
                    const bookingsHeader = canManageBookings ? Domus.UI.buildSectionHeader(t('domus', 'Bookings')) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-unit-link-doc',
                        title: t('domus', 'Link file'),
                        dataset: { entityType: 'unit', entityId: id }
                    } : null);

                    const statisticsHeader = Domus.UI.buildSectionHeader(t('domus', 'Statistics'));
                    const isBuildingMgmt = Domus.Role.isBuildingMgmtView();
                    const infoItems = [
                        { label: t('domus', 'Property'), value: unit.propertyName || unit.propertyId },
                        { label: t('domus', 'Unit number'), value: unit.unitNumber },
                        { label: t('domus', 'Unit type'), value: unit.unitType },
                        { label: t('domus', 'Living area'), value: unit.livingArea ? `${Domus.Utils.formatAmount(unit.livingArea)} m²` : '' },
                        { label: t('domus', 'Description'), value: unit.notes }
                    ];

                    if (!isBuildingMgmt) {
                        infoItems.splice(3, 0, { label: t('domus', 'Land register'), value: unit.landRegister });
                        infoItems.splice(5, 0, { label: t('domus', 'Usable area'), value: unit.usableArea ? `${Domus.Utils.formatAmount(unit.usableArea)} m²` : '' });
                        infoItems.push(
                            { label: t('domus', 'Buy date'), value: Domus.Utils.formatDate(unit.buyDate) },
                            { label: t('domus', 'Total costs'), value: unit.totalCosts ? Domus.Utils.formatCurrency(unit.totalCosts) : '' },
                            { label: t('domus', 'Official ID'), value: unit.officialId },
                            { label: t('domus', 'IBAN'), value: unit.iban },
                            { label: t('domus', 'BIC'), value: unit.bic }
                        );
                    }

                    const infoList = Domus.UI.buildInfoList(infoItems);

                    const content = '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid">' +
                        '<div class="domus-dashboard-main">' +
                        '<div class="domus-panel">' + tenanciesHeader + '<div class="domus-panel-body">' +
                        Domus.Tenancies.renderInline(allTenancies) + '</div></div>' +
                        '<div class="domus-panel">' + statisticsHeader + '<div class="domus-panel-body">' +
                        renderStatisticsTable(statistics) + '</div></div>' +
                        (canManageBookings ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(bookings || []) + '</div></div>' : '') +
                        '</div>' +
                        '<div class="domus-dashboard-side">' +
                        '<div class="domus-panel">' + '<div class="domus-panel-header"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Unit details')) + '</h3></div>' +
                        '<div class="domus-panel-body">' + infoList + '</div></div>' +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('unit', id, { showLinkAction: documentActionsEnabled }) + '</div></div>' +
                        '</div>' +
                        '</div>' +
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
                    const availableProperties = propertyOptions.slice(1);
                    const showPropertySelect = Domus.Role.isBuildingMgmtView() || availableProperties.length > 1;
                    const requireProperty = true;
                    const defaultPropertyId = unit.propertyId || availableProperties[0]?.value;

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Edit unit'),
                        content: buildUnitForm(propertyOptions, unit, { showPropertySelect, requireProperty, defaultPropertyId })
                    });
                    bindUnitForm(modal, data => Domus.Api.updateUnit(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Unit updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { requireProperty });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindUnitForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-unit-form');
            const cancel = modalContext.modalEl.querySelector('#domus-unit-cancel');
            cancel?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = {};
                Array.prototype.forEach.call(form.elements, el => { if (el.name) data[el.name] = el.value; });
                if (options.requireProperty && !data.propertyId) {
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


        function buildUnitForm(propertyOptions, unit, options = {}) {
            const selectedPropertyId = unit?.propertyId
                ? String(unit.propertyId)
                : (options.defaultPropertyId ? String(options.defaultPropertyId) : '');
            const showPropertySelect = options.showPropertySelect !== false && propertyOptions.length;
            const includeManagementExcludedFields = !Domus.Role.isBuildingMgmtView();
            const propertyInput = showPropertySelect
                ? '<label>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + (options.requireProperty ? ' *' : '') + '<select name="propertyId"' + (options.requireProperty ? ' required' : '') + '>' +
                propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) ===selectedPropertyId ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>'
                : (selectedPropertyId ? '<input type="hidden" name="propertyId" value="' + Domus.Utils.escapeHtml(selectedPropertyId) + '">' : '');

            const fields = [
                propertyInput,
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Label')) + ' *<input name="label" required value="' + (unit?.label ? Domus.Utils.escapeHtml(unit.label) : '') + '"></label>',
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit number')) + '<input name="unitNumber" value="' + (unit?.unitNumber ? Domus.Utils.escapeHtml(unit.unitNumber) : '') + '"></label>',
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit type')) + '<input name="unitType" value="' + (unit?.unitType ? Domus.Utils.escapeHtml(unit.unitType) : '') + '"></label>',
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Living area')) + '<input name="livingArea" type="number" step="0.01" value="' + (unit?.livingArea ? Domus.Utils.escapeHtml(unit.livingArea) : '') + '"></label>',
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Description')) + '<textarea name="notes">' + (unit?.notes ? Domus.Utils.escapeHtml(unit.notes) : '') + '</textarea></label>'
            ];

            if (includeManagementExcludedFields) {
                fields.splice(3, 0, '<label>' + Domus.Utils.escapeHtml(t('domus', 'Land register')) + '<input name="landRegister" value="' + (unit?.landRegister ? Domus.Utils.escapeHtml(unit.landRegister) : '') + '"></label>');
                fields.splice(6, 0, '<label>' + Domus.Utils.escapeHtml(t('domus', 'Usable area')) + '<input name="usableArea" type="number" step="0.01" value="' + (unit?.usableArea ? Domus.Utils.escapeHtml(unit.usableArea) : '') + '"></label>');
                fields.push(
                    '<label>' + Domus.Utils.escapeHtml(t('domus', 'Buy date')) + '<input name="buyDate" type="date" value="' + (unit?.buyDate ? Domus.Utils.escapeHtml(unit.buyDate) : '') + '"></label>',
                    '<label>' + Domus.Utils.escapeHtml(t('domus', 'Total costs')) + '<input name="totalCosts" type="number" step="0.01" value="' + (unit?.totalCosts || unit?.totalCosts === 0 ? Domus.Utils.escapeHtml(unit.totalCosts) : '') + '"></label>',
                    '<label>' + Domus.Utils.escapeHtml(t('domus', 'Official ID')) + '<input name="officialId" value="' + (unit?.officialId ? Domus.Utils.escapeHtml(unit.officialId) : '') + '"></label>',
                    '<label>' + Domus.Utils.escapeHtml(t('domus', 'IBAN')) + '<input name="iban" value="' + (unit?.iban ? Domus.Utils.escapeHtml(unit.iban) : '') + '"></label>',
                    '<label>' + Domus.Utils.escapeHtml(t('domus', 'BIC')) + '<input name="bic" value="' + (unit?.bic ? Domus.Utils.escapeHtml(unit.bic) : '') + '"></label>'
                );
            }

            return '<div class="domus-form">' +
                '<form id="domus-unit-form">' +
                fields.filter(Boolean).join('') +
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
                    const rows = (partners || []).map(p => ({
                        cells: [
                            Domus.Utils.escapeHtml(p.name || ''),
                            Domus.Utils.escapeHtml(p.partnerType || ''),
                            Domus.Utils.escapeHtml(p.email || '')
                        ],
                        dataset: { navigate: 'partnerDetail', args: p.id }
                    }));
                    Domus.UI.renderContent(toolbar + Domus.UI.buildTable([
                        t('domus', 'Name'), t('domus', 'Type'), t('domus', 'Email')
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
            Domus.UI.bindRowNavigation();
        }

        function renderPartnersTable(partners) {
            const rows = (partners || []).map(p => ({
                cells: [
                    Domus.Utils.escapeHtml(p.name || ''),
                    Domus.Utils.escapeHtml(p.partnerType || ''),
                    Domus.Utils.escapeHtml(p.email || '')
                ],
                dataset: { navigate: 'partnerDetail', args: p.id }
            }));
            const table = Domus.UI.buildTable([
                t('domus', 'Name'), t('domus', 'Type'), t('domus', 'Email')
            ], rows);
            const content = document.getElementById('app-content');
            if (content) {
                const tables = content.querySelectorAll('.domus-table');
                if (tables.length) {
                    tables[0].outerHTML = table;
                }
            }
            Domus.UI.bindRowNavigation();
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
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading partner…'));
            Domus.Api.get('/partners/' + id)
                .then(partner => {
                    const tenancies = partner.tenancies || [];
                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const canManageTenancies = Domus.Role.hasCapability('manageTenancies');
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const stats = Domus.UI.buildStatCards([
                        { label: tenancyLabels.plural, value: tenancies.length, hint: t('domus', 'Linked contracts'), formatValue: false },
                        { label: t('domus', 'Reports'), value: (partner.reports || []).length, hint: t('domus', 'Available downloads'), formatValue: false },
                        { label: t('domus', 'Type'), value: partner.partnerType || '—', hint: t('domus', 'Partner category') }
                    ]);

                    const contactMeta = [partner.email, partner.phone].filter(Boolean).join(' • ');
                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(partner.partnerType || t('domus', 'Partner')) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(partner.name || '') + '</h2>' +
                        (contactMeta ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(contactMeta) + '</p>' : '') +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        (canManageTenancies && tenancyLabels.action ? '<button id="domus-add-partner-tenancy" class="primary" data-partner-id="' + id + '">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : '') +
                        '<button id="domus-partner-edit">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>' +
                        '<button id="domus-partner-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                        '</div>' +
                        '</div>';

                    const tenanciesHeader = Domus.UI.buildSectionHeader(tenancyLabels.plural);
                    const reportsHeader = Domus.UI.buildSectionHeader(t('domus', 'Reports'));
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-partner-link-doc',
                        title: t('domus', 'Link file'),
                        dataset: { entityType: 'partner', entityId: id }
                    } : null);
                    const infoList = Domus.UI.buildInfoList([
                        { label: t('domus', 'Type'), value: partner.partnerType },
                        { label: t('domus', 'Email'), value: partner.email },
                        { label: t('domus', 'Phone'), value: partner.phone }
                    ]);

                    const content = '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('partners') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid">' +
                        '<div class="domus-dashboard-main">' +
                        '<div class="domus-panel">' + tenanciesHeader + '<div class="domus-panel-body">' +
                        Domus.Tenancies.renderInline(tenancies) + '</div></div>' +
                        '<div class="domus-panel">' + reportsHeader + '<div class="domus-panel-body">' +
                        Domus.Reports.renderInline(partner.reports || []) + '</div></div>' +
                        '</div>' +
                        '<div class="domus-dashboard-side">' +
                        '<div class="domus-panel">' + '<div class="domus-panel-header"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Partner details')) + '</h3></div>' +
                        '<div class="domus-panel-body">' + infoList + '</div></div>' +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('partner', id, { showLinkAction: documentActionsEnabled }) + '</div></div>' +
                        '</div>' +
                        '</div>' +
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
                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const canManageTenancies = Domus.Role.hasCapability('manageTenancies');
                    const toolbar = '<div class="domus-toolbar">' +
                        (canManageTenancies && tenancyLabels.action ? '<button id="domus-tenancy-create" class="primary">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : '') +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';
                    const rows = (tenancies || []).map(tn => {
                        const partnerLabel = tn.partnerName || formatPartnerNames(tn.partners);
                        return {
                            cells: [
                                Domus.Utils.escapeHtml(formatUnitLabel(tn)),
                                Domus.Utils.escapeHtml(partnerLabel || ''),
                                Domus.Utils.escapeHtml(tn.status || '')
                            ],
                            dataset: { navigate: 'tenancyDetail', args: tn.id }
                        };
                    });
                    Domus.UI.renderContent(toolbar + Domus.UI.buildTable([
                        t('domus', 'Unit'), t('domus', 'Partner'), t('domus', 'Status')
                    ], rows));
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            document.getElementById('domus-tenancy-create')?.addEventListener('click', () => openCreateModal());
            Domus.UI.bindRowNavigation();
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

        function openCreateModal(prefill = {}, onCreated, submitFn = Domus.Api.createTenancy, title, successMessage) {
            const tenancyLabels = Domus.Role.getTenancyLabels();
            const effectiveTitle = title || `${t('domus', 'New')} ${tenancyLabels.singular}`;
            const effectiveSuccessMessage = successMessage || `${tenancyLabels.singular} created.`;
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
                        title: effectiveTitle,
                        content: buildTenancyForm(unitOptions, partnerOptions, prefill)
                    });
                    bindTenancyForm(modal, data => submitFn(data)
                        .then(created => {
                            Domus.UI.showNotification(effectiveSuccessMessage, 'success');
                            modal.close();
                            (onCreated || renderList)(created);
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
                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const canManageBookings = Domus.Role.hasCapability('manageBookings');
                    const canManageReports = Domus.Role.hasCapability('manageReports');
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const partnerLabel = formatPartnerNames(tenancy.partners);
                    const stats = Domus.UI.buildStatCards([
                        { label: t('domus', 'Base rent'), value: Domus.Utils.formatCurrency(tenancy.baseRent), hint: t('domus', 'Monthly base rent') },
                        { label: t('domus', 'Service charge'), value: Domus.Utils.formatCurrency(tenancy.serviceCharge), hint: tenancy.serviceChargeAsPrepayment ? t('domus', 'As prepayment') : t('domus', 'Billed separately') },
                        { label: t('domus', 'Deposit'), value: Domus.Utils.formatCurrency(tenancy.deposit), hint: t('domus', 'Security deposit') },
                        { label: t('domus', 'Bookings'), value: (tenancy.bookings || []).length, hint: t('domus', 'Entries for the selected year'), formatValue: false }
                    ]);

                    const statusTag = tenancy.status ? '<span class="domus-badge">' + Domus.Utils.escapeHtml(tenancy.status) + '</span>' : '';
                    const heroMeta = [Domus.Utils.formatDate(tenancy.startDate), Domus.Utils.formatDate(tenancy.endDate)].filter(Boolean).join(' • ');
                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(tenancy.unitLabel || `${tenancyLabels.singular} #${id}`) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(tenancyLabels.singular) + ' #' + Domus.Utils.escapeHtml(id) + '</h2>' +
                        (heroMeta ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(heroMeta) + '</p>' : '') +
                        '<div class="domus-hero-tags">' + statusTag + '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        [
                            (canManageBookings ? '<button id="domus-add-tenancy-booking" class="primary" data-tenancy-id="' + id + '" data-unit-id="' + Domus.Utils.escapeHtml(tenancy.unitId) + '" data-property-id="' + Domus.Utils.escapeHtml(tenancy.propertyId) + '">' + Domus.Utils.escapeHtml(t('domus', 'Add booking')) + '</button>' : ''),
                            (canManageReports ? '<button id="domus-tenancy-report">' + Domus.Utils.escapeHtml(t('domus', 'Generate report')) + '</button>' : ''),
                            '<button id="domus-tenancy-change">' + Domus.Utils.escapeHtml(t('domus', 'Change conditions')) + '</button>',
                            '<button id="domus-tenancy-edit">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>',
                            '<button id="domus-tenancy-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>'
                        ].filter(Boolean).join('') +
                        '</div>' +
                        '</div>';

                    const bookingsHeader = canManageBookings ? Domus.UI.buildSectionHeader(t('domus', 'Bookings')) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-tenancy-link-doc',
                        title: t('domus', 'Link file'),
                        dataset: { entityType: 'tenancy', entityId: id }
                    } : null);
                    const reportsHeader = Domus.UI.buildSectionHeader(t('domus', 'Reports'));
                    const detailsHeader = Domus.UI.buildSectionHeader(t('domus', 'Details'));
                    const partnersHeader = Domus.UI.buildSectionHeader(t('domus', 'Partners'));
                    const conditionsHeader = Domus.UI.buildSectionHeader(t('domus', 'Conditions'));

                    const infoList = Domus.UI.buildInfoList([
                        { label: t('domus', 'Unit'), value: formatUnitLabel(tenancy) },
                        { label: t('domus', 'Partners'), value: partnerLabel || t('domus', 'None') },
                        { label: t('domus', 'Start date'), value: Domus.Utils.formatDate(tenancy.startDate) },
                        { label: t('domus', 'End date'), value: Domus.Utils.formatDate(tenancy.endDate) },
                        { label: t('domus', 'Prepayment'), value: tenancy.serviceChargeAsPrepayment ? t('domus', 'Yes') : t('domus', 'No') }
                    ]);

                    const content = '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('tenancies') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid">' +
                        '<div class="domus-dashboard-main">' +
                        '<div class="domus-panel">' + detailsHeader + '<div class="domus-panel-body">' + infoList + '</div></div>' +
                        '<div class="domus-panel">' + partnersHeader + '<div class="domus-panel-body">' +
                        Domus.Partners.renderInline(tenancy.partners || []) + '</div></div>' +
                        '<div class="domus-panel">' + conditionsHeader + '<div class="domus-panel-body">' +
                        '<p>' + Domus.Utils.escapeHtml(tenancy.conditions || t('domus', 'No conditions provided.')) + '</p></div></div>' +
                        (canManageBookings ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(tenancy.bookings || []) + '</div></div>' : '') +
                        '</div>' +
                        '<div class="domus-dashboard-side">' +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('tenancy', id, { showLinkAction: documentActionsEnabled }) + '</div></div>' +
                        '<div class="domus-panel">' + reportsHeader + '<div class="domus-panel-body">' +
                        Domus.Reports.renderInline(tenancy.reports || [], null, id) + '</div></div>' +
                        '</div>' +
                        '</div>' +
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
            document.getElementById('domus-tenancy-change')?.addEventListener('click', () => openChangeConditionsModal(tenancy));
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

        function openChangeConditionsModal(tenancy) {
            const today = new Date().toISOString().split('T')[0];
            const prefill = Object.assign({}, tenancy, { startDate: today, endDate: '' });

            openCreateModal(prefill, created => {
                const targetId = created?.id || tenancy.id;
                renderDetail(targetId);
            }, data => Domus.Api.changeTenancyConditions(tenancy.id, data), t('domus', 'Change conditions'), t('domus', 'Conditions changed.'));
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
        function formatAccount(booking) {
            const nr = booking.account || '';
            const label = Domus.Accounts.label(nr);
            if (!nr) {
                return '';
            }
            return label ? `${nr} – ${label}` : nr;
        }

        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading bookings…'));
            Domus.Api.getBookings()
                .then(bookings => {
                    const toolbar = '<div class="domus-toolbar">' +
                        '<button id="domus-booking-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'New booking')) + '</button>' +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';
                    const rows = (bookings || []).map(b => ({
                        cells: [
                            Domus.Utils.escapeHtml(Domus.Utils.formatDate(b.date)),
                            Domus.Utils.escapeHtml(formatAccount(b)),
                            { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(b.amount)), alignRight: true }
                        ],
                        dataset: { navigate: 'bookingDetail', args: b.id }
                    }));
                    Domus.UI.renderContent(toolbar + Domus.UI.buildTable([
                        t('domus', 'Date'), t('domus', 'Account'), t('domus', 'Amount')
                    ], rows));
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            document.getElementById('domus-booking-create')?.addEventListener('click', () => openCreateModal());
            Domus.UI.bindRowNavigation();
        }

        function renderInline(bookings) {
            const rows = (bookings || []).map(b => [
                Domus.Utils.escapeHtml(Domus.Utils.formatDate(b.date)),
                Domus.Utils.escapeHtml(formatAccount(b)),
                { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(b.amount)), alignRight: true }
            ]);
            return Domus.UI.buildTable([
                t('domus', 'Date'), t('domus', 'Account'), t('domus', 'Amount')
            ], rows);
        }

        function openCreateModal(defaults = {}, onCreated) {
            Promise.all([
                Domus.Api.getProperties(),
                Domus.Api.getUnits(),
                Domus.Api.getTenancies()
            ])
                .then(([properties, units, tenancies]) => {
                    const accountOptions = Domus.Accounts.toOptions();
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
                        content: buildBookingForm({ accountOptions, propertyOptions, unitOptions, tenancyOptions }, defaults),
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
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading booking…'));
            Domus.Api.get('/bookings/' + id)
                .then(booking => {
                    const accountDisplay = formatAccount(booking);
                    const stats = Domus.UI.buildStatCards([
                        { label: t('domus', 'Amount'), value: Domus.Utils.formatCurrency(booking.amount), hint: t('domus', 'Recorded amount') },
                        { label: t('domus', 'Date'), value: Domus.Utils.formatDate(booking.date) || '—', hint: t('domus', 'Booking date') },
                        { label: t('domus', 'Account'), value: accountDisplay || '—', hint: t('domus', 'Ledger reference') },
                        { label: t('domus', 'Tenancy'), value: booking.tenancyId ? `#${booking.tenancyId}` : t('domus', 'Unassigned'), hint: t('domus', 'Linked tenancy') }
                    ]);

                    const heroMeta = [booking.propertyName || booking.propertyId, booking.unitLabel || booking.unitId].filter(Boolean).join(' • ');
                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(t('domus', 'Booking')) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Booking')) + ' #' + Domus.Utils.escapeHtml(id) + '</h2>' +
                        (heroMeta ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(heroMeta) + '</p>' : '') +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        '<button id="domus-booking-edit">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>' +
                        '<button id="domus-booking-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                        '</div>' +
                        '</div>';

                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), {
                        id: 'domus-booking-link-doc',
                        title: t('domus', 'Link file'),
                        dataset: { entityType: 'booking', entityId: id }
                    });
                    const detailsHeader = Domus.UI.buildSectionHeader(t('domus', 'Details'));
                    const infoList = Domus.UI.buildInfoList([
                        { label: t('domus', 'Date'), value: Domus.Utils.formatDate(booking.date) },
                        { label: t('domus', 'Amount'), value: Domus.Utils.formatCurrency(booking.amount) },
                        { label: t('domus', 'Account'), value: accountDisplay },
                        { label: t('domus', 'Property'), value: booking.propertyName || booking.propertyId },
                        { label: t('domus', 'Unit'), value: booking.unitLabel || booking.unitId },
                        { label: t('domus', 'Tenancy'), value: booking.tenancyId ? `#${booking.tenancyId}` : '' },
                        { label: t('domus', 'Description'), value: booking.description }
                    ]);

                    const content = '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('bookings') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid">' +
                        '<div class="domus-dashboard-main">' +
                        '<div class="domus-panel">' + detailsHeader + '<div class="domus-panel-body">' + infoList + '</div></div>' +
                        '</div>' +
                        '<div class="domus-dashboard-side">' +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('booking', id, { showLinkAction: false }) + '</div></div>' +
                        '</div>' +
                        '</div>' +
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
                    const accountOptions = Domus.Accounts.toOptions();
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
                        content: buildBookingForm({ accountOptions, propertyOptions, unitOptions, tenancyOptions }, booking),
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

                if (!data.date) {
                    Domus.UI.showNotification(t('domus', 'Date is required.'), 'error');
                    return;
                }
                if (!data.account) {
                    Domus.UI.showNotification(t('domus', 'Select an account.'), 'error');
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
            const { accountOptions, propertyOptions, unitOptions, tenancyOptions } = options;
            const selectedAccount = booking?.account ? String(booking.account) : '';
            const selectedProperty = booking?.propertyId ? String(booking.propertyId) : '';
            const selectedUnit = booking?.unitId ? String(booking.unitId) : '';
            const selectedTenancy = booking?.tenancyId ? String(booking.tenancyId) : '';
            const tenancyLabel = Domus.Role.getTenancyLabels().singular;
            return '<div class="domus-form">' +
                '<form id="domus-booking-form">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Date')) + ' *<input type="date" name="date" required value="' + (booking?.date ? Domus.Utils.escapeHtml(booking.date) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Account')) + ' *<select name="account" required>' +
                accountOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedAccount ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Amount')) + '<input type="number" step="0.01" name="amount" value="' + (booking?.amount || booking?.amount === 0 ? Domus.Utils.escapeHtml(booking.amount) : '') + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + '<select name="propertyId">' +
                propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedProperty ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + '<select name="unitId">' +
                unitOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedUnit ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '<label>' + Domus.Utils.escapeHtml(tenancyLabel) + '<select name="tenancyId">' +
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
            if (!propertyId || !Domus.Role.hasCapability('manageReports')) return;
            Domus.Api.createReport(propertyId)
                .then(() => {
                    Domus.UI.showNotification(t('domus', 'Report created.'), 'success');
                    onComplete?.();
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function createForTenancy(tenancyId, onComplete) {
            if (!tenancyId || !Domus.Role.hasCapability('manageReports')) return;
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
            const allowManage = Domus.Role.hasCapability('manageDocuments');
            const showLinkAction = allowManage && options?.showLinkAction;
            Domus.Api.getDocuments(entityType, entityId)
                .then(docs => {
                    const rows = (docs || []).map(doc => [
                        '<a class="domus-link" href="' + Domus.Utils.escapeHtml(doc.filePath || '#') + '">' + Domus.Utils.escapeHtml(doc.name || doc.filePath || '') + '</a>',
                        allowManage ? '<button class="domus-link" data-doc-id="' + doc.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Remove')) + '</button>' : ''
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
            return '<form class="domus-form" data-doc-form>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Path in Nextcloud')) + '<input type="text" name="filePath" required></label>' +
                '<input type="hidden" name="entityType" value="' + Domus.Utils.escapeHtml(entityType) + '">' +
                '<input type="hidden" name="entityId" value="' + Domus.Utils.escapeHtml(entityId) + '">' +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Link file')) + '</button>' +
                '<button type="button" data-doc-cancel>' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>';
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

            const form = modal.modalEl.querySelector('form[data-doc-form]');
            const cancelBtn = modal.modalEl.querySelector('[data-doc-cancel]');
            cancelBtn?.addEventListener('click', modal.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = { filePath: form.filePath.value };
                if (!data.filePath) {
                    Domus.UI.showNotification(t('domus', 'File path is required.'), 'error');
                    return;
                }
                Domus.Api.linkDocument(entityType, entityId, data)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Document linked.'), 'success');
                        modal.close();
                        if (onLinked) {
                            onLinked();
                        } else {
                            renderList(entityType, entityId);
                        }
                    })
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
            // In real-world scenario, fetch role info from backend. Here we seed demo roles.
            Domus.Role.setRoleInfo({
                currentRole: 'landlord',
                availableRoles: ['landlord', 'buildingMgmt', 'tenant']
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

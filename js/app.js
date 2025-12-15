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
        const baseJsonHeaders = {
            'Content-Type': 'application/json',
            'OCS-APIREQUEST': 'true',
            requesttoken: OC.requestToken
        };

        function buildUrl(path, searchParams) {
            if (!searchParams || searchParams.toString() === '') {
                return path;
            }
            return `${path}?${searchParams.toString()}`;
        }

        function withYear(params = new URLSearchParams()) {
            const next = new URLSearchParams(params);
            next.set('year', Domus.state.currentYear);
            return next;
        }

        function appendFilters(params, filters = {}) {
            const next = new URLSearchParams(params);
            Object.entries(filters).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') {
                    next.append(key, value);
                }
            });
            return next;
        }

        function request(method, path, data) {
            const opts = {
                method,
                headers: Object.assign({}, baseJsonHeaders, { 'X-Domus-Role': Domus.Role?.getCurrentRole?.() || Domus.state.role })
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

        function buildYearUrl(path, params = new URLSearchParams()) {
            return buildUrl(path, withYear(params));
        }

        return {
            get: path => request('GET', path),
            post: (path, data) => request('POST', path, data),
            put: (path, data) => request('PUT', path, data),
            delete: path => request('DELETE', path),
            getDashboardSummary: () => request('GET', buildYearUrl('/dashboard/summary')),
            getProperties: () => request('GET', buildYearUrl('/properties')),
            createProperty: data => request('POST', '/properties', data),
            updateProperty: (id, data) => request('PUT', `/properties/${id}`, data),
            deleteProperty: id => request('DELETE', `/properties/${id}`),
            getProperty: id => request('GET', `/properties/${id}`),
            getUnits: (propertyId) => {
                const path = propertyId ? `/properties/${propertyId}/units` : '/units';
                return request('GET', buildYearUrl(path));
            },
            getUnitSettlements: (unitId, year) => {
                const params = new URLSearchParams();
                if (year !== undefined && year !== null) {
                    params.set('year', year);
                }
                return request('GET', buildUrl(`/units/${unitId}/settlements`, params));
            },
            createUnitSettlementReport: (unitId, payload) => request('POST', `/units/${unitId}/settlements`, payload),
            getUnitStatistics: (unitId) => request('GET', `/statistics/units/${unitId}`),
            getUnitsStatisticsOverview: (propertyId) => {
                const params = propertyId ? appendFilters(new URLSearchParams(), { propertyId }) : new URLSearchParams();
                return request('GET', buildYearUrl('/statistics/units-overview', params));
            },
            createUnit: data => request('POST', '/units', data),
            updateUnit: (id, data) => request('PUT', `/units/${id}`, data),
            deleteUnit: id => request('DELETE', `/units/${id}`),
            getPartners: (type) => {
                const resolvedType = type && String(type).trim() !== ''
                    ? type
                    : Domus.Permission.getPartnerListFilter();
                const params = resolvedType ? appendFilters(new URLSearchParams(), { partnerType: resolvedType }) : null;
                return request('GET', buildUrl('/partners', params));
            },
            createPartner: data => request('POST', '/partners', data),
            updatePartner: (id, data) => request('PUT', `/partners/${id}`, data),
            deletePartner: id => request('DELETE', `/partners/${id}`),
            getTenancies: filters => {
                const params = appendFilters(withYear(), filters || {});
                return request('GET', buildUrl('/tenancies', params));
            },
            createTenancy: data => request('POST', '/tenancies', data),
            changeTenancyConditions: (id, data) => request('POST', `/tenancies/${id}/change-conditions`, data),
            updateTenancy: (id, data) => request('PUT', `/tenancies/${id}`, data),
            deleteTenancy: id => request('DELETE', `/tenancies/${id}`),
            getBookings: filters => {
                const params = appendFilters(withYear(), filters || {});
                return request('GET', buildUrl('/bookings', params));
            },
            createBooking: data => request('POST', '/bookings', data),
            updateBooking: (id, data) => request('PUT', `/bookings/${id}`, data),
            deleteBooking: id => request('DELETE', `/bookings/${id}`),
            getReports: (propertyId) => {
                if (propertyId) {
                    return request('GET', `/properties/${propertyId}/reports/${Domus.state.currentYear}`);
                }
                return request('GET', '/reports');
            },
            createReport: (propertyId) => request('POST', `/properties/${propertyId}/reports/${Domus.state.currentYear}`),
            createTenancyReport: (tenancyId) => request('POST', `/tenancies/${tenancyId}/reports/${Domus.state.currentYear}`),
            getDocuments: (entityType, entityId) => request('GET', `/documents/${entityType}/${entityId}`),
            getDocumentDetail: (id) => request('GET', `/documents/${id}`),
            linkDocument: (entityType, entityId, data) => request('POST', `/documents/${entityType}/${entityId}`, data),
            attachDocumentToTargets: (payload) => {
                const formData = new FormData();
                formData.append('targets', JSON.stringify(payload.targets || []));
                if (payload.year !== undefined) {
                    formData.append('year', payload.year);
                }
                if (payload.title) {
                    formData.append('title', payload.title);
                }
                if (payload.type === 'upload' && payload.file) {
                    formData.append('file', payload.file);
                }
                if (payload.type === 'link' && payload.filePath) {
                    formData.append('filePath', payload.filePath);
                }
                const opts = {
                    method: 'POST',
                    headers: {
                        'OCS-APIREQUEST': 'true',
                        requesttoken: OC.requestToken
                    },
                    body: formData
                };
                return fetch(baseUrl + '/documents/attach', opts).then(handleResponse);
            },
            uploadDocument: (entityType, entityId, file, year, title) => {
                const formData = new FormData();
                formData.append('file', file);
                if (year !== undefined && year !== null) {
                    formData.append('year', year);
                }
                if (title) {
                    formData.append('title', title);
                }
                const opts = {
                    method: 'POST',
                    headers: {
                        'OCS-APIREQUEST': 'true',
                        requesttoken: OC.requestToken
                    },
                    body: formData
                };
                return fetch(baseUrl + `/documents/${entityType}/${entityId}/upload`, opts).then(handleResponse);
            },
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

        function toOptions(includePlaceholder = true, filterFn = null) {
            let entries = Object.entries(accounts);
            if (typeof filterFn === 'function') {
                entries = entries.filter(([nr, data]) => filterFn(nr, data));
            }

            const opts = entries.map(([nr, data]) => ({
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
            const { title, content, size, headerActions = [] } = options || {};
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
            const actionsEl = document.createElement('div');
            actionsEl.className = 'domus-modal-header-actions';
            (headerActions || []).forEach(action => {
                if (!action) return;
                if (typeof action === 'string') {
                    const wrapper = document.createElement('div');
                    wrapper.innerHTML = action;
                    actionsEl.appendChild(wrapper);
                    return;
                }
                if (action instanceof Node) {
                    actionsEl.appendChild(action);
                }
            });
            const closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'domus-modal-close';
            closeBtn.setAttribute('aria-label', t('domus', 'Close modal'));
            closeBtn.innerHTML = '&times;';
            header.appendChild(heading);
            header.appendChild(actionsEl);
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

        function buildModalAction(label, onClick) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label || '';
            btn.className = 'domus-modal-action';
            if (typeof onClick === 'function') {
                btn.addEventListener('click', onClick);
            }
            return btn;
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

        function createFileDropZone(options = {}) {
            const container = document.createElement('div');
            container.className = 'domus-dropzone';
            container.tabIndex = 0;
            container.setAttribute('role', 'button');
            container.setAttribute('aria-label', options.label || t('domus', 'Select a file'));

            const input = document.createElement('input');
            input.type = 'file';
            input.name = options.name || 'file';
            input.required = options.required === true;
            input.accept = options.accept || '';
            input.style.display = 'none';

            const area = document.createElement('div');
            area.className = 'domus-dropzone-area';
            area.setAttribute('role', 'button');
            area.setAttribute('tabindex', '0');
            area.innerHTML = '<strong>' + Domus.Utils.escapeHtml(options.label || t('domus', 'Drop a file here or click to select one')) + '</strong>';

            const fileName = document.createElement('div');
            fileName.className = 'domus-dropzone-filename muted';
            fileName.textContent = options.placeholder || t('domus', 'No file selected');

            container.appendChild(input);
            container.appendChild(area);
            container.appendChild(fileName);

            function updateFileName(file) {
                fileName.textContent = file ? file.name : (options.placeholder || t('domus', 'No file selected'));
            }

            function handleFiles(files) {
                if (!files || !files.length) {
                    updateFileName(null);
                    if (typeof options.onFileSelected === 'function') {
                        options.onFileSelected(null);
                    }
                    return;
                }
                const dt = new DataTransfer();
                dt.items.add(files[0]);
                input.files = dt.files;
                updateFileName(files[0]);
                if (typeof options.onFileSelected === 'function') {
                    options.onFileSelected(files[0]);
                }
            }

            let isChoosing = false;
            const triggerSelect = (e) => {
                e?.preventDefault();
                e?.stopPropagation();
                if (isChoosing) return;
                isChoosing = true;
                input.click();
                setTimeout(() => { isChoosing = false; }, 300);
            };
            container.addEventListener('click', triggerSelect);
            container.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    triggerSelect(e);
                }
            });

            const preventAndHighlight = (e) => {
                e.preventDefault();
                e.stopPropagation();
                container.classList.add('domus-dropzone-hover');
            };
            const clearHighlight = (e) => {
                e.preventDefault();
                e.stopPropagation();
                container.classList.remove('domus-dropzone-hover');
            };

            ['dragover', 'dragenter'].forEach(evt => {
                area.addEventListener(evt, preventAndHighlight);
                container.addEventListener(evt, preventAndHighlight);
            });
            ['dragleave', 'dragend'].forEach(evt => {
                area.addEventListener(evt, clearHighlight);
                container.addEventListener(evt, clearHighlight);
            });
            ['drop'].forEach(evt => {
                area.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    container.classList.remove('domus-dropzone-hover');
                    handleFiles(e.dataTransfer.files);
                });
                container.addEventListener(evt, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    container.classList.remove('domus-dropzone-hover');
                    handleFiles(e.dataTransfer.files);
                });
            });
            input.addEventListener('change', () => handleFiles(input.files));

            return {
                element: container,
                input,
                setFile: handleFiles,
                reset: () => handleFiles(null),
                focus: () => container.focus && container.focus(),
            };
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

        function buildFormSection(title) {
            if (!title) {
                return '';
            }
            return '<div class="domus-form-section">' + Domus.Utils.escapeHtml(title) + '</div>';
        }

        function buildFormRow(row) {
            if (!row) {
                return '';
            }

            const labelText = row.label ? Domus.Utils.escapeHtml(row.label) + (row.required ? ' *' : '') : '';
            const helpText = row.helpText ? '<div class="domus-form-help">' + Domus.Utils.escapeHtml(row.helpText) + '</div>' : '';
            const label = '<div class="domus-form-label">' + labelText + helpText + '</div>';
            const value = '<div class="domus-form-value">' + (row.content || '') + '</div>';
            const classes = ['domus-form-row'];
            if (row.fullWidth) {
                classes.push('domus-form-row-full');
            }

            return '<div class="' + classes.join(' ') + '">' + label + value + '</div>';
        }

        function buildFormTable(rows) {
            const content = (rows || []).filter(Boolean).join('');
            if (!content) {
                return '';
            }
            return '<div class="domus-form-table">' + content + '</div>';
        }

        function bindBackButtons() {
            document.querySelectorAll('button[data-back]').forEach(btn => {
                btn.addEventListener('click', function() {
                    const target = this.getAttribute('data-back');
                    const argsRaw = this.getAttribute('data-back-args') || '';
                    const args = argsRaw ? argsRaw.split(',').filter(Boolean) : [];
                    if (window.history.length > 1) {
                        window.history.back();
                        return;
                    }
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
            buildFormSection,
            buildFormRow,
            buildFormTable,
            openModal,
            buildModalAction,
            createFileDropZone
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
                    { view: 'partners', label: t('domus', 'Partners') },
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
     * Permission helper
     */
    Domus.Permission = (function() {
        function getRole() {
            return Domus.Role.getCurrentRole();
        }

        function isBuildingManagement() {
            return Domus.Role.isBuildingMgmtView();
        }

        function getPartnerTypeForCreation() {
            return isBuildingManagement() ? 'owner' : 'tenant';
        }

        function getPartnerTypeConfig() {
            return {
                defaultType: getPartnerTypeForCreation(),
                hideField: true,
                disabled: true
            };
        }

        function shouldRequireProperty() {
            return isBuildingManagement();
        }

        function shouldHidePropertyField(defaults = {}) {
            if (isBuildingManagement()) {
                return Boolean(defaults.lockProperty);
            }
            return true;
        }

        function getTenancyPartnerFilter() {
            return isBuildingManagement() ? 'owner' : 'tenant';
        }

        function hideTenancyFinancialFields() {
            return isBuildingManagement();
        }

        function getPartnerListFilter() {
            return getPartnerTypeForCreation();
        }

        return {
            getRole,
            isBuildingManagement,
            getPartnerTypeConfig,
            getPartnerTypeForCreation,
            shouldRequireProperty,
            shouldHidePropertyField,
            getTenancyPartnerFilter,
            hideTenancyFinancialFields,
            getPartnerListFilter
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

        function navigateFromHash() {
            const parsed = parseHash();
            if (parsed && routes[parsed.name]) {
                Domus.state.currentView = parsed.name;
                routes[parsed.name].apply(null, parsed.args);
                Domus.Navigation.render();
                return true;
            }
            return false;
        }

        return { register, navigate, navigateFromHash };
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

                    const cityLine = [property.zip, property.city].filter(Boolean).join(' ');
                    const addressParts = [property.street, cityLine, property.country].filter(Boolean);
                    const address = addressParts.length ? addressParts.join(', ') : (property.address || '');
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
                        (property.description ? '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(property.description) + '</div>' : '') +
                        '<h2>' + Domus.Utils.escapeHtml(property.name || '') + '</h2>' +
                        '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(address) + '</p>' +
                        (property.type ? '<div class="domus-hero-tags"><span class="domus-badge">' + Domus.Utils.escapeHtml(property.type) + '</span></div>' : '') +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        [
                            '<button id="domus-add-unit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Add unit')) + '</button>',
                            showBookingFeatures ? '<button id="domus-add-booking">' + Domus.Utils.escapeHtml(t('domus', 'Add booking')) + '</button>' : '',
                            showReportActions ? '<button id="domus-property-report">' + Domus.Utils.escapeHtml(t('domus', 'Generate report')) + '</button>' : '',
                            '<button id="domus-property-details">' + Domus.Utils.escapeHtml(t('domus', 'Details')) + '</button>',
                            '<button id="domus-property-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>'
                        ].filter(Boolean).join('') +
                        '</div>' +
                        '</div>';

                    const unitsHeader = Domus.UI.buildSectionHeader(t('domus', 'Units'));
                    const bookingsHeader = showBookingFeatures ? Domus.UI.buildSectionHeader(t('domus', 'Bookings')) : '';
                    const reportsHeader = showReportActions ? Domus.UI.buildSectionHeader(t('domus', 'Reports')) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-property-link-doc',
                        title: t('domus', 'Add document'),
                        label: t('domus', 'Add document'),
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
                    Domus.UI.bindRowNavigation();
                    bindDetailActions(id, property);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id) {
            const detailsBtn = document.getElementById('domus-property-details');
            const deleteBtn = document.getElementById('domus-property-delete');
            detailsBtn?.addEventListener('click', () => openPropertyModal(id, 'view'));
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
                Domus.Units.openCreateModal({ propertyId: id, lockProperty: true }, () => renderDetail(id));
            });
            document.getElementById('domus-add-booking')?.addEventListener('click', () => {
                const bookingFormConfig = Domus.Role.isBuildingMgmtView() ? { restrictUnitsToProperty: true } : {};
                Domus.Bookings.openCreateModal({ propertyId: id }, () => renderDetail(id), bookingFormConfig);
            });
            document.getElementById('domus-property-report')?.addEventListener('click', () => {
                Domus.Reports.createForProperty(id, () => renderDetail(id));
            });
            document.getElementById('domus-property-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('property', id, () => renderDetail(id));
            });
        }

        function openEditModal(id) {
            openPropertyModal(id, 'edit');
        }

        function openPropertyModal(id, mode = 'edit') {
            Domus.Api.getProperty(id)
                .then(property => {
                    let modal;
                    const headerActions = [];
                    if (mode === 'view') {
                        headerActions.push(Domus.UI.buildModalAction(t('domus', 'Edit'), () => {
                            modal?.close();
                            openPropertyModal(id, 'edit');
                        }));
                    }

                    modal = Domus.UI.openModal({
                        title: mode === 'view' ? t('domus', 'Property details') : t('domus', 'Edit property'),
                        content: buildPropertyForm(property, { mode }),
                        headerActions
                    });
                    bindPropertyForm(modal, data => Domus.Api.updateProperty(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Property updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { mode });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }


        function bindPropertyForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-property-form');
            const mode = options.mode || 'edit';
            const cancelBtn = modalContext.modalEl.querySelector('#domus-property-cancel');
            const closeBtn = modalContext.modalEl.querySelector('#domus-property-close');

            if (mode === 'view') {
                closeBtn?.addEventListener('click', modalContext.close);
                form?.addEventListener('submit', function(e) {
                    e.preventDefault();
                    modalContext.close();
                });
                return;
            }

            cancelBtn?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = formToObject(form);
                if (!data.name) {
                    Domus.UI.showNotification(t('domus', 'Name is required.'), 'error');
                    return;
                }
                onSubmit(data);
            });
        }

        function buildPropertyForm(property, options = {}) {
            const prop = property || {};
            const mode = options.mode || 'edit';
            const isView = mode === 'view';

            function renderDisplay(value) {
                const safeValue = value || value === 0 ? String(value) : '';
                return '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(safeValue) + '</div>';
            }

            function inputField(name, label, value, opts = {}) {
                const required = opts.required && !isView;
                const attrs = [`name="${Domus.Utils.escapeHtml(name)}"`];
                if (opts.type) attrs.push(`type="${Domus.Utils.escapeHtml(opts.type)}"`);
                if (required) attrs.push('required');
                if (isView) attrs.push('disabled');
                const content = opts.isTextarea
                    ? `<textarea ${attrs.join(' ')}>${value ? Domus.Utils.escapeHtml(String(value)) : ''}</textarea>`
                    : `<input ${attrs.join(' ')} value="${value ? Domus.Utils.escapeHtml(String(value)) : ''}">`;
                return Domus.UI.buildFormRow({
                    label,
                    required,
                    content: isView ? renderDisplay(value) : content
                });
            }

            function selectField(name, label, options, selected) {
                const current = selected || options[0]?.value;
                const content = isView
                    ? renderDisplay(options.find(opt => opt.value === current)?.label || current)
                    : '<select name="' + Domus.Utils.escapeHtml(name) + '">' +
                    options.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (opt.value === current ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                    '</select>';
                return Domus.UI.buildFormRow({ label, content: content });
            }

            const rows = [
                inputField('name', t('domus', 'Name'), prop.name || '', { required: true }),
                selectField('usageRole', t('domus', 'Usage role'), [
                    { value: 'manager', label: t('domus', 'Manager') },
                    { value: 'landlord', label: t('domus', 'Landlord') }
                ], prop.usageRole),
                inputField('street', t('domus', 'Street'), prop.street || ''),
                inputField('zip', t('domus', 'ZIP'), prop.zip || ''),
                inputField('city', t('domus', 'City'), prop.city || ''),
                inputField('country', t('domus', 'Country'), prop.country || 'DE'),
                inputField('type', t('domus', 'Type'), prop.type || ''),
                inputField('description', t('domus', 'Description'), prop.description || '', { isTextarea: true, fullWidth: true })
            ];

            const actions = isView
                ? '<div class="domus-form-actions"><button type="button" id="domus-property-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button></div>'
                : '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-property-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-property-form" data-mode="' + Domus.Utils.escapeHtml(mode) + '">' +
                Domus.UI.buildFormTable(rows) +
                actions +
                '</form>' +
                '</div>';
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
        function formatPartnerNames(partners) {
            return (partners || [])
                .map(p => p.name)
                .filter(Boolean)
                .join(', ');
        }

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
            const rows = (units || []).map(u => ({
                cells: [
                    Domus.Utils.escapeHtml(u.label || ''),
                    Domus.Utils.escapeHtml(u.unitNumber || ''),
                    Domus.Utils.escapeHtml(u.unitType || '')
                ],
                dataset: u.id ? { navigate: 'unitDetail', args: u.id } : null
            }));
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
                    const requireProperty = Domus.Permission.shouldRequireProperty();
                    const firstPropertyId = availableProperties[0]?.value;

                    if (requireProperty && !availableProperties.length) {
                        Domus.UI.showNotification(t('domus', 'Create a property first before adding units.'), 'error');
                        return;
                    }

                    const effectiveDefaults = Object.assign({ propertyId: requireProperty ? firstPropertyId : '' }, defaults);
                    const showPropertySelect = !Domus.Permission.shouldHidePropertyField(effectiveDefaults)
                        && (requireProperty || availableProperties.length > 1);
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
                    const currentTenancy = (unit.activeTenancies || [])
                        .slice()
                        .sort((a, b) => {
                            const aDate = new Date(a?.startDate || 0);
                            const bDate = new Date(b?.startDate || 0);
                            return (bDate.getTime() || 0) - (aDate.getTime() || 0);
                        })[0];
                    const currentTenantName = currentTenancy ?
                        (formatPartnerNames(currentTenancy.partners) || currentTenancy.partnerName || '') : '';
                    const currentBaseRent = currentTenancy?.baseRent;
                    const previousYear = Domus.state.currentYear - 1;
                    const rentabilityRow = (statistics?.revenue?.rows || [])
                        .find(row => Number(row.year) === previousYear);
                    const rentabilityValue = rentabilityRow?.netRentab;
                    const livingAreaLabel = unit.livingArea ? `${Domus.Utils.formatAmount(unit.livingArea)} m²` : '';
                    const kickerParts = [livingAreaLabel, unit.notes].filter(Boolean);
                    const kicker = kickerParts.length ? kickerParts.join(' | ') : '';
                    const street = unit.street || unit.propertyStreet;
                    const zip = unit.zip || unit.propertyZip;
                    const city = unit.city || unit.propertyCity;
                    const country = unit.country || unit.propertyCountry;
                    const addressParts = [];
                    if (unit.address) {
                        addressParts.push(unit.address);
                    }
                    const cityLine = [zip, city].filter(Boolean).join(' ');
                    if (street || cityLine || country) {
                        if (street) addressParts.push(street);
                        if (cityLine) addressParts.push(cityLine);
                        if (country) addressParts.push(country);
                    } else if (unit.address) {
                        addressParts.push(unit.address);
                    }
                    const addressLine = addressParts.join(', ');
                    const stats = Domus.UI.buildStatCards([
                        {
                            label: t('domus', 'Current Tenancy'),
                            value: `Kaltmiete: ${Domus.Utils.formatCurrency(currentBaseRent) || '—'}`,
                            hint: currentTenantName || '—',
                            formatValue: false
                        },
                        {
                            label: t('domus', 'Rentability'),
                            value: Domus.Utils.formatPercentage(rentabilityValue) || '—',
                            hint: '',
                            formatValue: false
                        },
                        { label: t('domus', 'Living area'), value: unit.livingArea ? `${Domus.Utils.formatAmount(unit.livingArea)} m²` : '—', hint: t('domus', 'Reported size') },
                        { label: t('domus', 'Year'), value: Domus.Utils.formatYear(Domus.state.currentYear), hint: t('domus', 'Reporting context'), formatValue: false }
                    ]);

                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-main">' +
                        (kicker ? '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(kicker) + '</div>' : '') +
                        '<h2>' + Domus.Utils.escapeHtml(unit.label || '') + '</h2>' +
                        (addressLine ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(addressLine) + '</p>' : '') +
                        (unit.unitType ? '<div class="domus-hero-tags"><span class="domus-badge">' + Domus.Utils.escapeHtml(unit.unitType) + '</span></div>' : '') +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        [
                            (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action ? '<button id="domus-add-tenancy" class="primary" data-unit-id="' + id + '">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : ''),
                            (canManageBookings ? '<button id="domus-add-unit-booking">' + Domus.Utils.escapeHtml(t('domus', 'Add booking')) + '</button>' : ''),
                            '<button id="domus-unit-service-charge">' + Domus.Utils.escapeHtml(t('domus', 'Nebenkostenabrechnung')) + '</button>',
                            '<button id="domus-unit-details">' + Domus.Utils.escapeHtml(t('domus', 'Details')) + '</button>',
                            '<button id="domus-unit-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>'
                        ].filter(Boolean).join('') +
                        '</div>' +
                        '</div>';

                    const tenanciesHeader = Domus.UI.buildSectionHeader(tenancyLabels.plural);
                    const bookingsHeader = canManageBookings ? Domus.UI.buildSectionHeader(t('domus', 'Bookings')) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-unit-link-doc',
                        title: t('domus', 'Add document'),
                        label: t('domus', 'Add document'),
                        dataset: { entityType: 'unit', entityId: id }
                    } : null);

                    const statisticsHeader = Domus.UI.buildSectionHeader(t('domus', 'Revenue'));
                    const revenueTable = renderStatisticsTable(statistics ? statistics.revenue : null);
                    const costTable = statistics && statistics.cost
                        ? '<div class="domus-section">' + Domus.UI.buildSectionHeader(t('domus', 'Costs')) + renderStatisticsTable(statistics.cost) + '</div>'
                        : '';

                    const content = '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid">' +
                        '<div class="domus-dashboard-main">' +
                        '<div class="domus-panel">' + tenanciesHeader + '<div class="domus-panel-body">' +
                        Domus.Tenancies.renderInline(allTenancies) + '</div></div>' +
                        '<div class="domus-panel">' + statisticsHeader + '<div class="domus-panel-body">' +
                        revenueTable + costTable + '</div></div>' +
                        (canManageBookings ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(bookings || []) + '</div></div>' : '') +
                        '</div>' +
                        '<div class="domus-dashboard-side">' +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('unit', id, { showLinkAction: documentActionsEnabled }) + '</div></div>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    Domus.UI.bindRowNavigation();
                    bindDetailActions(id, unit);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, unit) {
            const detailsBtn = document.getElementById('domus-unit-details');
            const deleteBtn = document.getElementById('domus-unit-delete');

            detailsBtn?.addEventListener('click', () => openUnitModal(id, 'view'));
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
                Domus.Bookings.openCreateModal({ propertyId: unit?.propertyId, unitId: id }, () => renderDetail(id), {
                    accountFilter: (nr) => String(nr).startsWith('2'),
                    hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                });
            });
            document.getElementById('domus-add-unit-buying-price')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({ propertyId: unit?.propertyId, unitId: id }, () => renderDetail(id), {
                    accountFilter: (nr) => String(nr).startsWith('3'),
                    title: t('domus', 'Add buying price'),
                    hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                });
            });
            document.getElementById('domus-unit-service-charge')?.addEventListener('click', () => {
                Domus.UnitSettlements.openModal(id, () => renderDetail(id));
            });
            document.getElementById('domus-unit-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('unit', id, () => renderDetail(id));
            });
        }

        function openEditModal(id) {
            openUnitModal(id, 'edit');
        }

        function openUnitModal(id, mode = 'edit') {
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
                    const showPropertySelect = !Domus.Permission.shouldHidePropertyField(unit || {})
                        && (Domus.Role.isBuildingMgmtView() || availableProperties.length > 1);
                    const requireProperty = true;
                    const defaultPropertyId = unit.propertyId || availableProperties[0]?.value;

                    let modal;
                    const headerActions = [];
                    if (mode === 'view') {
                        headerActions.push(Domus.UI.buildModalAction(t('domus', 'Edit'), () => {
                            modal?.close();
                            openUnitModal(id, 'edit');
                        }));
                    }

                    modal = Domus.UI.openModal({
                        title: mode === 'view' ? t('domus', 'Unit details') : t('domus', 'Edit unit'),
                        content: buildUnitForm(propertyOptions, unit, { showPropertySelect, requireProperty, defaultPropertyId, mode }),
                        headerActions
                    });
                    bindUnitForm(modal, data => Domus.Api.updateUnit(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Unit updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { requireProperty, mode });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindUnitForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-unit-form');
            const mode = options.mode || 'edit';
            const cancel = modalContext.modalEl.querySelector('#domus-unit-cancel');
            const closeBtn = modalContext.modalEl.querySelector('#domus-unit-close');

            if (mode === 'view') {
                closeBtn?.addEventListener('click', modalContext.close);
                form?.addEventListener('submit', function(e) {
                    e.preventDefault();
                    modalContext.close();
                });
                return;
            }

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
                onSubmit?.(data);
            });
        }


        function buildUnitForm(propertyOptions, unit, options = {}) {
            const mode = options.mode || 'edit';
            const isView = mode === 'view';
            const selectedPropertyId = unit?.propertyId
                ? String(unit.propertyId)
                : (options.defaultPropertyId ? String(options.defaultPropertyId) : '');
            const showPropertySelect = options.showPropertySelect !== false && propertyOptions.length;
            const includeManagementExcludedFields = !Domus.Role.isBuildingMgmtView();
            const hiddenFields = [];

            const propertyMap = propertyOptions.reduce((map, opt) => {
                if (opt && opt.value !== undefined) {
                    map[String(opt.value)] = opt.label;
                }
                return map;
            }, {});

            function displayValue(value, formatter) {
                if (value === undefined || value === null || value === '') {
                    return '';
                }
                const resolved = typeof formatter === 'function' ? formatter(value) : value;
                return resolved === undefined || resolved === null ? '' : resolved;
            }

            function renderDisplay(value, formatter) {
                const resolved = displayValue(value, formatter);
                const text = typeof resolved === 'string' ? resolved : (resolved || resolved === 0 ? String(resolved) : '');
                const escaped = Domus.Utils.escapeHtml(text).replace(/\n/g, '<br>');
                return '<div class="domus-form-value-text">' + escaped + '</div>';
            }

            function inputField(name, label, value, options = {}) {
                const id = `domus-unit-${name}`;
                const required = options.required && !isView;
                const attrs = [
                    `name="${Domus.Utils.escapeHtml(name)}"`,
                    `id="${Domus.Utils.escapeHtml(id)}"`
                ];
                if (options.type) attrs.push(`type="${Domus.Utils.escapeHtml(options.type)}"`);
                if (options.step) attrs.push(`step="${Domus.Utils.escapeHtml(options.step)}"`);
                if (required) attrs.push('required');
                if (isView) attrs.push('disabled');
                const escapedValue = value || value === 0 ? Domus.Utils.escapeHtml(String(value)) : '';
                const content = options.isTextarea
                    ? `<textarea ${attrs.join(' ')}>${escapedValue}</textarea>`
                    : `<input ${attrs.join(' ')} value="${escapedValue}">`;

                const viewContent = renderDisplay(value, options.viewFormatter);
                return Domus.UI.buildFormRow({
                    label,
                    required: required,
                    content: isView ? viewContent : content
                });
            }

            const rows = [];

            if (showPropertySelect) {
                const propertyLabel = propertyMap[selectedPropertyId] || unit?.propertyName || selectedPropertyId;
                const content = isView
                    ? renderDisplay(propertyLabel)
                    : '<select name="propertyId" id="domus-unit-property"' + (options.requireProperty ? ' required' : '') + (isView ? ' disabled' : '') + '>' +
                    propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedPropertyId ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                    '</select>';
                rows.push(Domus.UI.buildFormRow({
                    label: t('domus', 'Property'),
                    required: options.requireProperty && !isView,
                    content
                }));
            } else if (selectedPropertyId) {
                hiddenFields.push('<input type="hidden" name="propertyId" value="' + Domus.Utils.escapeHtml(selectedPropertyId) + '">');
            }

            rows.push(
                inputField('label', t('domus', 'Label'), unit?.label || '', { required: true }),
                inputField('unitNumber', t('domus', 'Unit number'), unit?.unitNumber || ''),
                inputField('unitType', t('domus', 'Unit type'), unit?.unitType || '')
            );

            if (includeManagementExcludedFields) {
                rows.push(inputField('landRegister', t('domus', 'Land register'), unit?.landRegister || ''));
            }

            rows.push(
                inputField('livingArea', t('domus', 'Living area'), unit?.livingArea || '', {
                    type: 'number',
                    step: '0.01',
                    viewFormatter: (val) => `${Domus.Utils.formatAmount(val)} m²`
                })
            );

            rows.push(
                inputField('notes', t('domus', 'Description'), unit?.notes || '', {
                    isTextarea: true
                })
            );

            if (includeManagementExcludedFields) {
                rows.push(
                    inputField('buyDate', t('domus', 'Buy date'), unit?.buyDate || '', {
                        type: 'date',
                        viewFormatter: Domus.Utils.formatDate
                    }),
                    inputField('totalCosts', t('domus', 'Total costs'), unit?.totalCosts || '', {
                        type: 'number',
                        step: '0.01',
                        viewFormatter: Domus.Utils.formatCurrency
                    }),
                    inputField('officialId', t('domus', 'Tax ID'), unit?.officialId || ''),
                    inputField('iban', t('domus', 'IBAN'), unit?.iban || ''),
                    inputField('bic', t('domus', 'BIC'), unit?.bic || '')
                );
            }

            const actions = isView
                ? '<div class="domus-form-actions"><button type="button" id="domus-unit-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button></div>'
                : '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-unit-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-unit-form" data-mode="' + Domus.Utils.escapeHtml(mode) + '">' +
                hiddenFields.join('') +
                Domus.UI.buildFormTable(rows) +
                actions +
                '</form>' +
                '</div>';
        }

        return { renderList, renderDetail, renderListInline, openCreateModal };
    })();

    Domus.UnitSettlements = (function() {
        function openModal(unitId, onComplete) {
            const defaultYear = (new Date()).getFullYear() - 1;
            let selectedYear = defaultYear;
            let selectedGroup = null;
            let settlements = [];

            const container = document.createElement('div');
            container.innerHTML = '<div class="domus-form">'
                + '<label>' + Domus.Utils.escapeHtml(t('domus', 'Year')) + ' '
                + '<select id="domus-settlement-year"></select>'
                + '</label>'
                + '</div>'
                + '<div class="domus-table" id="domus-settlement-table"></div>'
                + '<div class="domus-modal-footer">'
                + '<button id="domus-create-settlement" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Abrechnung erstellen')) + '</button>'
                + '</div>';

            const modal = Domus.UI.openModal({
                title: t('domus', 'Nebenkostenabrechnung'),
                content: container,
                size: 'large'
            });

            const yearSelect = container.querySelector('#domus-settlement-year');
            const tableContainer = container.querySelector('#domus-settlement-table');
            const createBtn = container.querySelector('#domus-create-settlement');

            yearSelect.innerHTML = buildYearOptions(defaultYear).map(y => '<option value="' + y + '">' + Domus.Utils.escapeHtml(y) + '</option>').join('');
            yearSelect.value = String(defaultYear);

            yearSelect.addEventListener('change', () => {
                selectedYear = parseInt(yearSelect.value, 10);
                loadSettlements();
            });

            createBtn.addEventListener('click', () => {
                if (!selectedGroup) {
                    Domus.UI.showNotification(t('domus', 'Select a partner first.'), 'error');
                    return;
                }
                const selected = settlements.find(item => item.groupId === selectedGroup);
                if (!selected) {
                    Domus.UI.showNotification(t('domus', 'Select a partner first.'), 'error');
                    return;
                }
                createBtn.disabled = true;
                Domus.Api.createUnitSettlementReport(unitId, { year: selectedYear, partnerId: selected.partnerId })
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Settlement report created.'), 'success');
                        modal.close();
                        onComplete?.();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'))
                    .finally(() => { createBtn.disabled = false; });
            });

            function buildYearOptions(defaultYear) {
                const current = (new Date()).getFullYear();
                const years = [];
                for (let i = 0; i < 6; i++) {
                    years.push(current - i);
                }
                if (!years.includes(defaultYear)) {
                    years.push(defaultYear);
                }
                return years.sort((a, b) => b - a);
            }

            function renderTable() {
                if (!settlements.length) {
                    tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'No settlements for the selected year.')) + '</div>';
                    return;
                }

                const rows = settlements.map((entry, idx) => {
                    const radio = '<input type="radio" name="domus-settlement-select" value="' + Domus.Utils.escapeHtml(entry.groupId) + '" ' + (selectedGroup === entry.groupId || (!selectedGroup && idx === 0) ? 'checked' : '') + '>';
                    return [
                        radio,
                        Domus.Utils.escapeHtml(entry.partnerName || ''),
                        Domus.Utils.formatCurrency(entry.serviceCharge),
                        Domus.Utils.formatCurrency(entry.houseFee),
                        Domus.Utils.formatCurrency(entry.propertyTax),
                        Domus.Utils.formatCurrency(entry.saldo)
                    ];
                });

                tableContainer.innerHTML = Domus.UI.buildTable([
                    '',
                    t('domus', 'Partner'),
                    t('domus', 'Nebenkosten (1001)'),
                    t('domus', 'Hausgeld (2000)'),
                    t('domus', 'Grundsteuer (2005)'),
                    t('domus', 'Saldo')
                ], rows);

                const radios = tableContainer.querySelectorAll('input[name="domus-settlement-select"]');
                radios.forEach(radio => {
                    radio.addEventListener('change', () => {
                        selectedGroup = radio.value;
                    });
                });
                if (!selectedGroup && settlements[0]) {
                    selectedGroup = settlements[0].groupId;
                }
            }

            function loadSettlements() {
                tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'Loading…')) + '</div>';
                Domus.Api.getUnitSettlements(unitId, selectedYear)
                    .then(data => {
                        settlements = (data || []).map(item => Object.assign({ groupId: item.groupId || String(item.partnerId) }, item));
                        selectedGroup = settlements[0]?.groupId || null;
                        renderTable();
                    })
                    .catch(err => {
                        tableContainer.innerHTML = '<div class="domus-error">' + Domus.Utils.escapeHtml(err.message || t('domus', 'An error occurred')) + '</div>';
                    });
            }

            loadSettlements();
        }

        return { openModal };
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
            const allowedType = Domus.Permission.getPartnerListFilter();
            const allowedLabel = allowedType === 'owner' ? t('domus', 'Owner') : t('domus', 'Tenant');
            Domus.Api.getPartners(allowedType)
                .then(partners => {
                    const toolbar = '<div class="domus-toolbar">' +
                        '<button id="domus-partner-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'New partner')) + '</button>' +
                        '<label class="domus-inline-label">' + Domus.Utils.escapeHtml(t('domus', 'Type')) + ' <select id="domus-partner-filter">' +
                        '<option value="' + Domus.Utils.escapeHtml(allowedType) + '">' + Domus.Utils.escapeHtml(allowedLabel) + '</option>' +
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

                    const contactMeta = [partner.phone, partner.email].filter(Boolean).join(' • ');
                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(partner.partnerType || t('domus', 'Partner')) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(partner.name || '') + '</h2>' +
                        (contactMeta ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(contactMeta) + '</p>' : '') +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        (canManageTenancies && tenancyLabels.action ? '<button id="domus-add-partner-tenancy" class="primary" data-partner-id="' + id + '">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : '') +
                        '<button id="domus-partner-details">' + Domus.Utils.escapeHtml(t('domus', 'Details')) + '</button>' +
                        '<button id="domus-partner-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                        '</div>' +
                        '</div>';

                    const tenanciesHeader = Domus.UI.buildSectionHeader(tenancyLabels.plural);
                    const reportsHeader = Domus.UI.buildSectionHeader(t('domus', 'Reports'));
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-partner-link-doc',
                        title: t('domus', 'Add document'),
                        label: t('domus', 'Add document'),
                        dataset: { entityType: 'partner', entityId: id }
                    } : null);
                    const infoList = Domus.UI.buildInfoList([
                        { label: t('domus', 'Type'), value: partner.partnerType },
                        { label: t('domus', 'Street'), value: partner.street },
                        { label: t('domus', 'ZIP'), value: partner.zip },
                        { label: t('domus', 'City'), value: partner.city },
                        { label: t('domus', 'Country'), value: partner.country },
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
            const detailsBtn = document.getElementById('domus-partner-details');
            const deleteBtn = document.getElementById('domus-partner-delete');

            detailsBtn?.addEventListener('click', () => openPartnerModal(id, 'view'));
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
            openPartnerModal(id, 'edit');
        }

        function openPartnerModal(id, mode = 'edit') {
            Domus.Api.get('/partners/' + id)
                .then(partner => {
                    let modal;
                    const headerActions = [];
                    if (mode === 'view') {
                        headerActions.push(Domus.UI.buildModalAction(t('domus', 'Edit'), () => {
                            modal?.close();
                            openPartnerModal(id, 'edit');
                        }));
                    }

                    modal = Domus.UI.openModal({
                        title: mode === 'view' ? t('domus', 'Partner details') : t('domus', 'Edit partner'),
                        content: buildPartnerForm(partner, { mode }),
                        headerActions
                    });
                    bindPartnerForm(modal, data => Domus.Api.updatePartner(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Partner updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { mode });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindPartnerForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-partner-form');
            const mode = options.mode || 'edit';
            const cancel = modalContext.modalEl.querySelector('#domus-partner-cancel');
            const closeBtn = modalContext.modalEl.querySelector('#domus-partner-close');

            if (mode === 'view') {
                closeBtn?.addEventListener('click', modalContext.close);
                form?.addEventListener('submit', function(e) {
                    e.preventDefault();
                    modalContext.close();
                });
                return;
            }

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

        function buildPartnerForm(partner, options = {}) {
            const mode = options.mode || 'edit';
            const isView = mode === 'view';
            const partnerTypeConfig = Domus.Permission.getPartnerTypeConfig();
            const defaultPartnerType = partner?.partnerType || partnerTypeConfig.defaultType;
            const hiddenFields = [];

            function renderDisplay(value) {
                const safeValue = value || value === 0 ? String(value) : '';
                return '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(safeValue) + '</div>';
            }

            function inputField(name, label, value, opts = {}) {
                const required = opts.required && !isView;
                const attrs = [`name="${Domus.Utils.escapeHtml(name)}"`];
                if (opts.type) attrs.push(`type="${Domus.Utils.escapeHtml(opts.type)}"`);
                if (required) attrs.push('required');
                if (isView) attrs.push('disabled');
                const content = opts.isTextarea
                    ? `<textarea ${attrs.join(' ')}>${value ? Domus.Utils.escapeHtml(String(value)) : ''}</textarea>`
                    : `<input ${attrs.join(' ')} value="${value ? Domus.Utils.escapeHtml(String(value)) : ''}">`;
                return Domus.UI.buildFormRow({ label, required, content: isView ? renderDisplay(value) : content });
            }

            function selectField(name, label, options, selected, opts = {}) {
                const current = selected || options[0]?.value;
                const content = isView
                    ? renderDisplay(options.find(opt => opt.value === current)?.label || current)
                    : '<select name="' + Domus.Utils.escapeHtml(name) + '"' + (opts.disabled ? ' disabled' : '') + '>' +
                    options.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (opt.value === current ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                    '</select>';
                return Domus.UI.buildFormRow({ label, content });
            }

            if (partnerTypeConfig.hideField && defaultPartnerType) {
                hiddenFields.push('<input type="hidden" name="partnerType" value="' + Domus.Utils.escapeHtml(defaultPartnerType) + '">');
            }

            const rows = [
                inputField('name', t('domus', 'Name'), partner?.name || '', { required: true }),
                ...(partnerTypeConfig.hideField ? [] : [selectField('partnerType', t('domus', 'Type'), [
                    { value: 'tenant', label: t('domus', 'Tenant') },
                    { value: 'owner', label: t('domus', 'Owner') }
                ], defaultPartnerType, { disabled: partnerTypeConfig.disabled })]),
                inputField('street', t('domus', 'Street'), partner?.street || ''),
                inputField('zip', t('domus', 'ZIP'), partner?.zip || ''),
                inputField('city', t('domus', 'City'), partner?.city || ''),
                inputField('country', t('domus', 'Country'), partner?.country || ''),
                inputField('email', t('domus', 'Email'), partner?.email || '', { type: 'email' }),
                inputField('phone', t('domus', 'Phone'), partner?.phone || '')
            ];

            const actions = isView
                ? '<div class="domus-form-actions"><button type="button" id="domus-partner-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button></div>'
                : '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-partner-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-partner-form" data-mode="' + Domus.Utils.escapeHtml(mode) + '">' +
                hiddenFields.join('') +
                Domus.UI.buildFormTable(rows) +
                actions +
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
            const rows = (tenancies || []).map(tn => ({
                cells: [
                    Domus.Utils.escapeHtml(formatUnitLabel(tn)),
                    Domus.Utils.escapeHtml(formatPartnerNames(tn.partners) || tn.partnerName || ''),
                    Domus.Utils.escapeHtml(tn.status || ''),
                    Domus.Utils.escapeHtml(tn.period || '')
                ],
                dataset: tn.id ? { navigate: 'tenancyDetail', args: tn.id } : null
            }));
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
                Domus.Api.getPartners(Domus.Permission.getTenancyPartnerFilter())
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
                        content: buildTenancyForm(unitOptions, partnerOptions, prefill, { hideFinancialFields: Domus.Permission.hideTenancyFinancialFields() })
                    });
                    bindTenancyForm(modal, data => submitFn(data)
                        .then(created => {
                            Domus.UI.showNotification(effectiveSuccessMessage, 'success');
                            modal.close();
                            (onCreated || renderList)(created);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { requireFinancialFields: !Domus.Permission.hideTenancyFinancialFields() });
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
                            '<button id="domus-tenancy-details">' + Domus.Utils.escapeHtml(t('domus', 'Details')) + '</button>',
                            '<button id="domus-tenancy-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>'
                        ].filter(Boolean).join('') +
                        '</div>' +
                        '</div>';

                    const bookingsHeader = canManageBookings ? Domus.UI.buildSectionHeader(t('domus', 'Bookings')) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-tenancy-link-doc',
                        title: t('domus', 'Add document'),
                        label: t('domus', 'Add document'),
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
                    Domus.UI.bindRowNavigation();
                    bindDetailActions(id, tenancy);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, tenancy) {
            document.getElementById('domus-tenancy-details')?.addEventListener('click', () => openTenancyModal(id, tenancy, 'view'));
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
                Domus.Bookings.openCreateModal({ unitId: tenancy.unitId, propertyId: tenancy.propertyId }, () => renderDetail(id));
            });
            document.getElementById('domus-tenancy-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('tenancy', id, () => renderDetail(id));
            });
            document.getElementById('domus-tenancy-report')?.addEventListener('click', () => {
                Domus.Reports.createForTenancy(id, () => renderDetail(id));
            });
            document.getElementById('domus-tenancy-change')?.addEventListener('click', () => openChangeConditionsModal(tenancy));
        }

        function bindTenancyForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-tenancy-form');
            const cancel = modalContext.modalEl.querySelector('#domus-tenancy-cancel');
            const closeBtn = modalContext.modalEl.querySelector('#domus-tenancy-close');
            const mode = (form?.getAttribute('data-mode')) || 'edit';
            const requireFinancialFields = options.requireFinancialFields !== false;
            if (mode === 'view') {
                closeBtn?.addEventListener('click', modalContext.close);
                form?.addEventListener('submit', function(e) {
                    e.preventDefault();
                    modalContext.close();
                });
                return;
            }
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
                if (!requireFinancialFields) {
                    delete data.baseRent;
                    delete data.serviceCharge;
                    delete data.serviceChargeAsPrepayment;
                    delete data.deposit;
                }
                const missingStartDate = !data.startDate;
                const missingBaseRent = requireFinancialFields && !data.baseRent;
                if (missingStartDate || missingBaseRent) {
                    const message = missingBaseRent
                        ? t('domus', 'Start date and base rent are required.')
                        : t('domus', 'Start date is required.');
                    Domus.UI.showNotification(message, 'error');
                    return;
                }
                onSubmit(data);
            });
        }

        function openEditModal(id, tenancy) {
            openTenancyModal(id, tenancy, 'edit');
        }

        function openTenancyModal(id, tenancy, mode = 'edit') {
            Promise.all([
                Domus.Api.getUnits(),
                Domus.Api.getPartners(Domus.Permission.getTenancyPartnerFilter())
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

                    let modal;
                    const headerActions = [];
                    if (mode === 'view') {
                        headerActions.push(Domus.UI.buildModalAction(t('domus', 'Edit'), () => {
                            modal?.close();
                            openTenancyModal(id, tenancy, 'edit');
                        }));
                    }

                    modal = Domus.UI.openModal({
                        title: mode === 'view' ? t('domus', 'Tenancy details') : t('domus', 'Edit tenancy'),
                        content: buildTenancyForm(unitOptions, partnerOptions, tenancy, { mode, hideFinancialFields: Domus.Permission.hideTenancyFinancialFields() }),
                        headerActions
                    });
                    bindTenancyForm(modal, data => Domus.Api.updateTenancy(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Tenancy updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { mode, requireFinancialFields: !Domus.Permission.hideTenancyFinancialFields() });
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

        function buildTenancyForm(unitOptions, partnerOptions, tenancy, options = {}) {
            const tn = tenancy || {};
            const mode = options.mode || 'edit';
            const isView = mode === 'view';
            const hideFinancialFields = options.hideFinancialFields || false;
            if (tn.partnerId && !tn.partnerIds) {
                tn.partnerIds = [tn.partnerId];
            }
            const partnerIds = (tn.partnerIds || []).map(String);
            const selectedUnitId = tn.unitId !== undefined && tn.unitId !== null ? String(tn.unitId) : '';
            const startDate = tn.startDate ? Domus.Utils.escapeHtml(tn.startDate) : new Date().toISOString().split('T')[0];
            const unitLocked = Boolean(selectedUnitId);

            function renderDisplay(value) {
                const safeValue = value || value === 0 ? String(value) : '';
                return '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(safeValue) + '</div>';
            }

            function selectDisplay(options, selected) {
                const found = options.find(opt => String(opt.value) === String(selected));
                return renderDisplay(found?.label || selected);
            }

            function inputField(name, label, value, opts = {}) {
                const required = opts.required && !isView;
                const attrs = [`name="${Domus.Utils.escapeHtml(name)}"`];
                if (opts.type) attrs.push(`type="${Domus.Utils.escapeHtml(opts.type)}"`);
                if (opts.step) attrs.push(`step="${Domus.Utils.escapeHtml(opts.step)}"`);
                if (required) attrs.push('required');
                if (isView || opts.disabled) attrs.push('disabled');
                const content = opts.isTextarea
                    ? `<textarea ${attrs.join(' ')}>${value ? Domus.Utils.escapeHtml(String(value)) : ''}</textarea>`
                    : `<input ${attrs.join(' ')} value="${value ? Domus.Utils.escapeHtml(String(value)) : ''}">`;
                return Domus.UI.buildFormRow({ label, required, content: isView ? renderDisplay(value) : content });
            }

            const unitSelect = isView
                ? selectDisplay(unitOptions, selectedUnitId)
                : '<select name="unitId"' + (unitLocked ? ' disabled' : '') + ' required>' +
                unitOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (selectedUnitId === String(opt.value) ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select>' + (unitLocked ? '<input type="hidden" name="unitId" value="' + Domus.Utils.escapeHtml(selectedUnitId) + '">' : '');

            const partnerSelect = isView
                ? renderDisplay(partnerOptions.filter(opt => partnerIds.includes(String(opt.value))).map(opt => opt.label).join(', '))
                : '<select name="partnerIds" multiple required size="4">' +
                partnerOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (partnerIds.includes(String(opt.value)) ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select>';

            const rows = [
                Domus.UI.buildFormRow({ label: t('domus', 'Unit'), required: !isView, content: unitSelect }),
                Domus.UI.buildFormRow({ label: t('domus', 'Partners'), required: !isView, content: partnerSelect }),
                inputField('startDate', t('domus', 'Start date'), startDate, { type: 'date', required: true }),
                inputField('endDate', t('domus', 'End date'), tn.endDate || '', { type: 'date' })
            ];

            if (!hideFinancialFields) {
                rows.push(
                    inputField('baseRent', t('domus', 'Base rent'), tn.baseRent || '', { type: 'number', step: '0.01', required: true, viewFormatter: Domus.Utils.formatCurrency }),
                    inputField('serviceCharge', t('domus', 'Service charge'), tn.serviceCharge || '', { type: 'number', step: '0.01' }),
                    Domus.UI.buildFormRow({
                        label: t('domus', 'Service charge as prepayment'),
                        content: isView
                            ? renderDisplay(tn.serviceChargeAsPrepayment ? t('domus', 'Yes') : t('domus', 'No'))
                            : '<label class="domus-inline-label"><input type="checkbox" name="serviceChargeAsPrepayment" ' + (tn.serviceChargeAsPrepayment ? 'checked' : '') + '> ' + Domus.Utils.escapeHtml(t('domus', 'Service charge as prepayment')) + '</label>'
                    }),
                    inputField('deposit', t('domus', 'Deposit'), tn.deposit || '', { type: 'number', step: '0.01' })
                );
            }

            rows.push(
                inputField('conditions', t('domus', 'Conditions'), tn.conditions || '', { isTextarea: true, fullWidth: true })
            );

            const actions = isView
                ? '<div class="domus-form-actions"><button type="button" id="domus-tenancy-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button></div>'
                : '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-tenancy-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-tenancy-form" data-mode="' + Domus.Utils.escapeHtml(mode) + '">' +
                Domus.UI.buildFormTable(rows) +
                actions +
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
            Domus.UI.bindRowNavigation();
        }

        function renderInline(bookings) {
            const rows = (bookings || []).map(b => ({
                cells: [
                    Domus.Utils.escapeHtml(Domus.Utils.formatDate(b.date)),
                    Domus.Utils.escapeHtml(formatAccount(b)),
                    { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(b.amount)), alignRight: true }
                ],
                dataset: b.id ? { navigate: 'bookingDetail', args: b.id } : null
            }));
            return Domus.UI.buildTable([
                t('domus', 'Date'), t('domus', 'Account'), t('domus', 'Amount')
            ], rows);
        }

        function dedupeTargets(targets) {
            const seen = new Set();
            return targets.filter(target => {
                if (!target || target.entityId === undefined || target.entityId === null) {
                    return false;
                }
                const key = `${target.entityType}:${target.entityId}`;
                if (seen.has(key)) {
                    return false;
                }
                seen.add(key);
                return true;
            });
        }

        function attachDocumentsToEntities(bookingIds, metadata, selection) {
            if (!selection) {
                return Promise.resolve();
            }

            const targets = [];
            (bookingIds || []).forEach(id => targets.push({ entityType: 'booking', entityId: id }));
            if (metadata?.unitId) targets.push({ entityType: 'unit', entityId: metadata.unitId });
            if (metadata?.propertyId) targets.push({ entityType: 'property', entityId: metadata.propertyId });

            const uniqueTargets = dedupeTargets(targets);
            if (!uniqueTargets.length) {
                return Promise.resolve();
            }

            const derivedYear = (() => {
                if (selection.year !== undefined && selection.year !== null) return selection.year;
                if (metadata?.date) {
                    const d = new Date(metadata.date);
                    if (!Number.isNaN(d.getTime())) return d.getFullYear();
                }
                return Domus.state.currentYear;
            })();

            return Domus.Api.attachDocumentToTargets({
                type: selection.type,
                file: selection.file,
                filePath: selection.filePath,
                title: selection.title,
                year: derivedYear,
                targets: uniqueTargets
            });
        }

        function mountBookingDocumentWidget(modalEl) {
            const placeholder = modalEl.querySelector('#domus-booking-documents .domus-doc-attachment-placeholder');
            if (!placeholder) {
                return null;
            }
            const widget = Domus.Documents.createAttachmentWidget({
                defaultYear: Domus.state.currentYear,
                showActions: false,
                includeYearInput: false,
                title: t('domus', 'Document'),
                subtitle: t('domus', 'Attach one file for all booking entries.')
            });
            placeholder.appendChild(widget.root);

            if (widget.pickerButton && typeof OC !== 'undefined' && OC.dialogs?.filepicker) {
                widget.pickerButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    OC.dialogs.filepicker(t('domus', 'Select file'), function(path) {
                        widget.setPath(path);
                    }, false, '', true, 1);
                });
            }

            return widget;
        }

        function openCreateModal(defaults = {}, onCreated, formConfig = {}) {
            const accountFilter = formConfig.accountFilter !== undefined
                ? formConfig.accountFilter
                : (Domus.Role.isBuildingMgmtView()
                    ? (nr) => String(nr).startsWith('4')
                    : (Domus.Role.getCurrentRole() === 'landlord'
                        ? (nr) => String(nr).startsWith('2')
                        : null));
            const title = formConfig.title || t('domus', 'New booking');
            const successMessage = formConfig.successMessage || t('domus', 'Booking created.');

            Promise.all([
                Domus.Api.getProperties(),
                Domus.Api.getUnits()
            ])
                .then(([properties, units]) => {
                    const accountOptions = Domus.Accounts.toOptions(true, accountFilter);
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const effectiveUnits = (formConfig.restrictUnitsToProperty && defaults.propertyId)
                        ? (units || []).filter(u => String(u.propertyId) === String(defaults.propertyId))
                        : (units || []);
                    const unitOptions = [{ value: '', label: t('domus', 'Select unit') }].concat(effectiveUnits.map(u => ({
                        value: u.id,
                        label: u.label || `${t('domus', 'Unit')} #${u.id}`
                    })));

                    const modal = Domus.UI.openModal({
                        title,
                        content: buildBookingForm({ accountOptions, propertyOptions, unitOptions }, defaults, { multiEntry: true, hidePropertyField: formConfig.hidePropertyField }),
                        size: 'large'
                    });
                    const docWidget = mountBookingDocumentWidget(modal.modalEl);
                    bindBookingForm(modal, data => {
                        const payloads = data.entries.map(entry => Object.assign({}, data.metadata, entry));
                        const requests = payloads.map(payload => Domus.Api.createBooking(payload));
                        return Promise.all(requests)
                            .then(created => {
                                const bookingIds = (created || []).map(item => item && item.id).filter(Boolean);
                                return attachDocumentsToEntities(bookingIds, data.metadata, data.document);
                            })
                            .then(() => {
                                Domus.UI.showNotification(successMessage, 'success');
                                modal.close();
                                (onCreated || renderList)();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    }, {
                        multiEntry: true,
                        accountOptions,
                        initialEntries: defaults && (defaults.account || defaults.amount) ? [{ account: defaults.account, amount: defaults.amount }] : [{}],
                        docWidget
                    });
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
                        { label: t('domus', 'Account'), value: accountDisplay || '—', hint: t('domus', 'Ledger reference') }
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
                        title: t('domus', 'Add document'),
                        label: t('domus', 'Add document'),
                        dataset: { entityType: 'booking', entityId: id }
                    });
                    const detailsHeader = Domus.UI.buildSectionHeader(t('domus', 'Details'));
                    const infoList = Domus.UI.buildInfoList([
                        { label: t('domus', 'Date'), value: Domus.Utils.formatDate(booking.date) },
                        { label: t('domus', 'Amount'), value: Domus.Utils.formatCurrency(booking.amount) },
                        { label: t('domus', 'Account'), value: accountDisplay },
                        { label: t('domus', 'Property'), value: booking.propertyName || booking.propertyId },
                        { label: t('domus', 'Unit'), value: booking.unitLabel || booking.unitId },
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
                Domus.Api.getUnits()
            ])
                .then(([booking, properties, units]) => {
                    const accountOptions = Domus.Accounts.toOptions();
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const unitOptions = [{ value: '', label: t('domus', 'Select unit') }].concat((units || []).map(u => ({
                        value: u.id,
                        label: u.label || `${t('domus', 'Unit')} #${u.id}`
                    })));

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Edit booking'),
                        content: buildBookingForm({ accountOptions, propertyOptions, unitOptions }, booking, { multiEntry: false }),
                        size: 'large'
                    });
                    const docWidget = mountBookingDocumentWidget(modal.modalEl);
                    bindBookingForm(modal, data => Domus.Api.updateBooking(id, Object.assign({}, data.metadata, data.entries[0] || {}))
                        .then(() => attachDocumentsToEntities([id], data.metadata, data.document))
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Booking updated.'), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    {
                        multiEntry: false,
                        accountOptions,
                        initialEntries: [{ account: booking.account, amount: booking.amount }],
                        docWidget
                    });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindBookingForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-booking-form');
            const cancel = modalContext.modalEl.querySelector('#domus-booking-cancel');
            const entriesContainer = modalContext.modalEl.querySelector('#domus-booking-entries');
            const multiEntry = options.multiEntry !== false;
            const docWidget = options.docWidget;

            initializeBookingEntries(entriesContainer, options.accountOptions || [], options.initialEntries || [{}], multiEntry);

            if (multiEntry) {
                entriesContainer?.addEventListener('input', (e) => {
                    if (e.target && e.target.dataset && e.target.dataset.role === 'amount') {
                        addTrailingBookingEntryIfNeeded(entriesContainer, options.accountOptions || []);
                    }
                });

                entriesContainer?.addEventListener('click', (e) => {
                    if (e.target && e.target.dataset && e.target.dataset.role === 'remove-entry') {
                        const row = e.target.closest('.domus-booking-entry');
                        if (row && entriesContainer) {
                            row.remove();
                            ensureAtLeastOneBookingEntry(entriesContainer, options.accountOptions || []);
                            updateRemoveButtons(entriesContainer);
                        }
                    }
                });
            }

            cancel?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const formData = {};
                Array.prototype.forEach.call(form.elements, el => {
                    if (el.name && !el.closest('.domus-booking-entry') && !el.closest('#domus-booking-documents')) {
                        formData[el.name] = el.value;
                    }
                });
                Object.keys(formData).forEach(key => { if (formData[key] === '') delete formData[key]; });

                const { entries, error } = collectBookingEntries(entriesContainer, multiEntry);
                if (error) {
                    Domus.UI.showNotification(error, 'error');
                    return;
                }

                if (!formData.date) {
                    Domus.UI.showNotification(t('domus', 'Date is required.'), 'error');
                    return;
                }
                if (!formData.propertyId && !formData.unitId) {
                    Domus.UI.showNotification(t('domus', 'Select a related property or unit.'), 'error');
                    return;
                }

                const payload = { metadata: formData, entries, document: docWidget?.getSelection ? docWidget.getSelection() : null };
                onSubmit(payload);
            });
        }

        function buildBookingForm(options, booking, formOptions = {}) {
            const { accountOptions, propertyOptions, unitOptions } = options;
            const multiEntry = formOptions.multiEntry !== undefined ? formOptions.multiEntry : !booking;
            const bookingDate = booking?.date ? Domus.Utils.escapeHtml(booking.date) : '';
            const propertyLocked = Boolean(booking?.propertyId) || Boolean(formOptions.lockProperty);
            const unitLocked = Boolean(booking?.unitId) || Boolean(formOptions.lockUnit);
            const selectedProperty = booking?.propertyId ? String(booking.propertyId) : '';
            const selectedUnit = booking?.unitId ? String(booking.unitId) : '';
            const hideProperty = formOptions.hidePropertyField || (!booking && Domus.Role.getCurrentRole() === 'landlord');
            return '<div class="domus-form">' +
                '<form id="domus-booking-form">' +
                '<div class="domus-booking-layout">' +
                '<div class="domus-booking-main">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Date')) + ' *<input type="date" name="date" required value="' + bookingDate + '"></label>' +
                '<div class="domus-booking-entries-wrapper">' +
                '<div class="domus-booking-entries-header">' + Domus.Utils.escapeHtml(t('domus', 'Amounts')) + '</div>' +
                '<div id="domus-booking-entries" class="domus-booking-entries" data-multi="' + (multiEntry ? '1' : '0') + '"></div>' +
                '<div class="domus-booking-hint">' + Domus.Utils.escapeHtml(t('domus', 'Add multiple booking lines. A new row appears automatically when you enter an amount.')) + '</div>' +
                '</div>' +
                (hideProperty ? (selectedProperty ? '<input type="hidden" name="propertyId" value="' + Domus.Utils.escapeHtml(selectedProperty) + '">' : '')
                    : ('<label>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + '<select name="propertyId"' + (propertyLocked ? ' disabled' : '') + '>' +
                    propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedProperty ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                    '</select>' + (propertyLocked ? '<input type="hidden" name="propertyId" value="' + Domus.Utils.escapeHtml(selectedProperty) + '">' : '') + '</label>')) +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + '<select name="unitId"' + (unitLocked ? ' disabled' : '') + '>' +
                unitOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedUnit ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '</div>' +
                '<div class="domus-booking-documents" id="domus-booking-documents">' +
                '<div class="domus-doc-attachment-placeholder domus-doc-attachment-shell"></div>' +
                '</div>' +
                '</div>' +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-booking-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        function initializeBookingEntries(container, accountOptions, initialEntries, multiEntry) {
            if (!container) {
                return;
            }
            container.innerHTML = '';
            const entries = initialEntries && initialEntries.length ? initialEntries : [{}];
            entries.forEach(entry => {
                container.appendChild(buildBookingEntryRow(accountOptions, entry, multiEntry));
            });
            if (multiEntry) {
                addTrailingBookingEntryIfNeeded(container, accountOptions);
            }
            updateRemoveButtons(container);
        }

        function buildBookingEntryRow(accountOptions, entry = {}, multiEntry = true) {
            const row = document.createElement('div');
            row.className = 'domus-booking-entry';

            const accountSelect = document.createElement('select');
            accountSelect.name = 'account[]';
            accountSelect.dataset.role = 'account';
            accountOptions.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                if (String(opt.value) === String(entry.account || '')) {
                    option.selected = true;
                }
                accountSelect.appendChild(option);
            });

            const amountInput = document.createElement('input');
            amountInput.type = 'number';
            amountInput.step = '0.01';
            amountInput.name = 'amount[]';
            amountInput.dataset.role = 'amount';
            if (entry.amount || entry.amount === 0) {
                amountInput.value = entry.amount;
            }

            row.appendChild(accountSelect);
            row.appendChild(amountInput);

            if (multiEntry) {
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'domus-booking-remove';
                removeBtn.dataset.role = 'remove-entry';
                removeBtn.setAttribute('aria-label', t('domus', 'Remove booking line'));
                removeBtn.textContent = '×';
                row.appendChild(removeBtn);
            }

            return row;
        }

        function addTrailingBookingEntryIfNeeded(container, accountOptions) {
            if (!container || !container.childElementCount) {
                container?.appendChild(buildBookingEntryRow(accountOptions, {}, true));
                return;
            }
            const rows = container.querySelectorAll('.domus-booking-entry');
            const lastRow = rows[rows.length - 1];
            const amountInput = lastRow?.querySelector('[data-role="amount"]');
            if (amountInput && amountInput.value !== '') {
                container.appendChild(buildBookingEntryRow(accountOptions, {}, true));
                updateRemoveButtons(container);
            }
        }

        function ensureAtLeastOneBookingEntry(container, accountOptions) {
            if (!container) {
                return;
            }
            if (!container.childElementCount) {
                container.appendChild(buildBookingEntryRow(accountOptions, {}, true));
            }
            addTrailingBookingEntryIfNeeded(container, accountOptions);
        }

        function updateRemoveButtons(container) {
            if (!container) {
                return;
            }
            const rows = Array.from(container.querySelectorAll('.domus-booking-entry'));
            const buttons = container.querySelectorAll('.domus-booking-remove');
            const disableRemoval = rows.length <= 1;
            buttons.forEach(btn => {
                btn.style.display = disableRemoval ? 'none' : '';
            });
        }

        function collectBookingEntries(container, multiEntry) {
            const entries = [];
            let error = null;
            if (!container) {
                return { entries: [], error: t('domus', 'No booking lines available.') };
            }

            const rows = Array.from(container.querySelectorAll('.domus-booking-entry'));
            rows.forEach(row => {
                const account = row.querySelector('[data-role="account"]')?.value || '';
                const amountValue = (row.querySelector('[data-role="amount"]')?.value || '').trim();
                const hasAmount = amountValue !== '';
                const hasAccount = account !== '';

                if (!hasAmount && !hasAccount) {
                    return;
                }
                if (!hasAmount) {
                    error = t('domus', 'Enter an amount for each booking line.');
                    return;
                }
                if (!hasAccount) {
                    error = t('domus', 'Select an account for each amount.');
                    return;
                }
                const amount = parseFloat(amountValue);
                if (Number.isNaN(amount)) {
                    error = t('domus', 'Enter a valid amount.');
                    return;
                }
                entries.push({ account, amount: amountValue });
            });

            if (!error && !entries.length) {
                error = t('domus', 'Enter at least one amount.');
            }

            if (!multiEntry && entries.length > 1) {
                entries.splice(1);
            }

            return { entries, error };
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
            const showActions = options?.showLinkAction;

            function updateContainer(html) {
                const placeholder = document.getElementById(containerId);
                if (placeholder) {
                    placeholder.outerHTML = html;
                }
            }

            Domus.Api.getDocuments(entityType, entityId)
                .then(docs => {
                    const rows = (docs || []).map(doc => [
                        '<a class="domus-link" href="' + Domus.Utils.escapeHtml(doc.fileUrl || '#') + '">' + Domus.Utils.escapeHtml(doc.fileName || doc.fileUrl || doc.fileId || '') + '</a>',
                        '<button class="domus-icon-button" data-doc-info="' + doc.id + '" title="' + Domus.Utils.escapeHtml(t('domus', 'Show linked objects')) + '">ℹ️</button>',
                        '<button class="domus-link" data-doc-id="' + doc.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Remove')) + '</button>'
                    ]);
                    const actions = showActions ? buildDocumentActions(entityType, entityId) : '';
                    const html = '<div id="' + containerId + '">' +
                        Domus.UI.buildTable([t('domus', 'File'), t('domus', 'Info'), ''], rows) + actions + '</div>';
                    updateContainer(html);
                    bindDocumentActions(entityType, entityId, containerId, showActions);
                })
                .catch(() => {
                    const html = '<div id="' + containerId + '">' + t('domus', 'No documents found.') + (showActions ? buildDocumentActions(entityType, entityId) : '') + '</div>';
                    updateContainer(html);
                });
            return '<div id="' + containerId + '">' + t('domus', 'Loading documents…') + '</div>';
        }

        function buildDocumentActions(entityType, entityId) {
            return '<div class="domus-doc-actions">' +
                '<button class="primary" data-doc-upload="' + Domus.Utils.escapeHtml(entityType + ':' + entityId) + '">' + Domus.Utils.escapeHtml(t('domus', 'Upload file')) + '</button>' +
                '<button data-doc-link="' + Domus.Utils.escapeHtml(entityType + ':' + entityId) + '">' + Domus.Utils.escapeHtml(t('domus', 'Link existing')) + '</button>' +
                '</div>';
        }

        function createAttachmentWidget(options = {}) {
            const defaultYear = options.defaultYear ?? Domus.state.currentYear;
            const showActions = options.showActions !== false;
            const includeYearInput = options.includeYearInput !== false;

            const root = document.createElement('div');
            root.className = 'domus-doc-attachment domus-doc-attachment-modern';

            const card = document.createElement('div');
            card.className = 'domus-doc-card';

            const header = document.createElement('div');
            header.className = 'domus-doc-header';
            const heading = document.createElement('h4');
            heading.textContent = options.title || t('domus', 'Document');
            const subtitle = document.createElement('p');
            subtitle.className = 'muted';
            subtitle.textContent = options.subtitle || t('domus', 'Drop or select a file, or reuse one from Nextcloud.');
            header.appendChild(heading);
            header.appendChild(subtitle);

            const syncUploadTitle = (file) => {
                if (!uploadNameInput) return;
                if (!file) {
                    if (uploadNameInput.dataset.autoTitle === '1') {
                        uploadNameInput.value = '';
                        uploadNameInput.dataset.autoTitle = '';
                    }
                    return;
                }
                const originalName = file.name || '';
                const dotIndex = originalName.lastIndexOf('.');
                const baseName = dotIndex > 0 ? originalName.substring(0, dotIndex) : originalName;
                if (!uploadNameInput.value || uploadNameInput.dataset.autoTitle === '1') {
                    uploadNameInput.value = baseName;
                    uploadNameInput.dataset.autoTitle = '1';
                }
            };

            const dropZone = Domus.UI.createFileDropZone({
                placeholder: t('domus', 'No file selected'),
                label: t('domus', 'Drop file here or click to select one'),
                onFileSelected: syncUploadTitle
            });
            dropZone.element.classList.add('domus-dropzone-large');

            const pickerRow = document.createElement('div');
            pickerRow.className = 'domus-doc-picker-row';
            const pickerButton = document.createElement('button');
            pickerButton.type = 'button';
            pickerButton.textContent = t('domus', 'Select existing file');
            pickerButton.className = 'domus-ghost';
            const pickerDisplay = document.createElement('div');
            pickerDisplay.className = 'domus-doc-picker-display muted';
            pickerDisplay.textContent = t('domus', 'No existing file selected');
            pickerRow.appendChild(pickerButton);
            pickerRow.appendChild(pickerDisplay);

            const uploadNameLabel = document.createElement('label');
            uploadNameLabel.textContent = t('domus', 'Title');
            const uploadNameInput = document.createElement('input');
            uploadNameInput.type = 'text';
            uploadNameInput.name = 'title';
            uploadNameInput.placeholder = t('domus', 'Defaults to file name');
            uploadNameInput.addEventListener('input', () => { uploadNameInput.dataset.autoTitle = ''; });
            uploadNameLabel.appendChild(uploadNameInput);

            let uploadYearInput = null;
            let uploadYearLabel = null;
            if (includeYearInput) {
                uploadYearLabel = document.createElement('label');
                uploadYearLabel.textContent = t('domus', 'Year');
                uploadYearInput = document.createElement('input');
                uploadYearInput.type = 'number';
                uploadYearInput.name = 'year';
                uploadYearInput.value = defaultYear;
                uploadYearLabel.appendChild(uploadYearInput);
            }

            card.appendChild(header);
            card.appendChild(dropZone.element);
            card.appendChild(pickerRow);
            card.appendChild(uploadNameLabel);
            if (uploadYearLabel) {
                card.appendChild(uploadYearLabel);
            }

            let cancelButton = null;
            let linkButton = null;
            let uploadButton = null;
            if (showActions) {
                const actions = document.createElement('div');
                actions.className = 'domus-form-actions domus-doc-footer';
                linkButton = document.createElement('button');
                linkButton.type = 'button';
                linkButton.textContent = t('domus', 'Link existing');
                uploadButton = document.createElement('button');
                uploadButton.type = 'button';
                uploadButton.className = 'primary';
                uploadButton.textContent = t('domus', 'Upload');
                cancelButton = document.createElement('button');
                cancelButton.type = 'button';
                cancelButton.textContent = t('domus', 'Close');
                actions.appendChild(linkButton);
                actions.appendChild(uploadButton);
                actions.appendChild(cancelButton);
                card.appendChild(actions);
            }

            root.appendChild(card);

            let selectedPath = '';
            function updatePickerDisplay(path) {
                selectedPath = path || '';
                pickerDisplay.textContent = selectedPath || t('domus', 'No existing file selected');
            }

            function getSelection(preferredType) {
                const uploadedFile = dropZone.input.files[0];
                const uploadTitleValue = uploadNameInput.value.trim();
                const yearValue = includeYearInput && uploadYearInput ? (Number(uploadYearInput.value) || defaultYear) : undefined;

                if (!preferredType || preferredType === 'upload') {
                    if (uploadedFile) {
                        return {
                            type: 'upload',
                            file: uploadedFile,
                            year: yearValue,
                            title: uploadTitleValue || undefined
                        };
                    }
                    if (preferredType === 'upload') {
                        return null;
                    }
                }

                if (!preferredType || preferredType === 'link') {
                    if (selectedPath) {
                        return {
                            type: 'link',
                            filePath: selectedPath,
                            year: yearValue
                        };
                    }
                }

                return null;
            }

            return {
                root,
                pickerButton,
                pickerDisplay,
                linkButton,
                uploadButton,
                cancelButton,
                dropZone,
                uploadNameInput,
                uploadYearInput,
                getSelection,
                setPath: updatePickerDisplay,
                reset: () => {
                    updatePickerDisplay('');
                    dropZone.reset();
                    uploadNameInput.value = '';
                    uploadNameInput.dataset.autoTitle = '';
                    if (uploadYearInput) uploadYearInput.value = defaultYear;
                }
            };
        }

        function bindDocumentActions(entityType, entityId, containerId, showActions) {
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

            document.querySelectorAll('#' + containerId + ' button[data-doc-info]').forEach(btn => {
                btn.addEventListener('click', function() {
                    openDetailModal(Number(this.getAttribute('data-doc-info')));
                });
            });

            if (showActions) {
                document.querySelectorAll('#' + containerId + ' button[data-doc-link]').forEach(btn => {
                    btn.addEventListener('click', function() {
                        openLinkModal(entityType, entityId);
                    });
                });
                document.querySelectorAll('#' + containerId + ' button[data-doc-upload]').forEach(btn => {
                    btn.addEventListener('click', function() {
                        openLinkModal(entityType, entityId, null, 'upload');
                    });
                });
            }
        }

        function openLinkModal(entityType, entityId, onLinked, focus = 'link') {
            const attachment = createAttachmentWidget({ defaultYear: Domus.state.currentYear, showActions: true });
            const modal = Domus.UI.openModal({
                title: t('domus', 'Link document'),
                content: attachment.root
            });

            const handleSuccess = () => {
                modal.close();
                if (onLinked) {
                    onLinked();
                } else {
                    renderList(entityType, entityId);
                }
            };

            attachment.cancelButton?.addEventListener('click', modal.close);

            if (attachment.pickerButton && typeof OC !== 'undefined' && OC.dialogs?.filepicker) {
                attachment.pickerButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    OC.dialogs.filepicker(t('domus', 'Select file'), function(path) {
                        attachment.setPath(path);
                    }, false, '', true, 1);
                });
            }

            const syncUploadTitle = () => {
                const file = attachment.dropZone.input.files?.[0];
                if (attachment.uploadNameInput && file && !attachment.uploadNameInput.value) {
                    const originalName = file.name || '';
                    const dotIndex = originalName.lastIndexOf('.');
                    attachment.uploadNameInput.value = dotIndex > 0 ? originalName.substring(0, dotIndex) : originalName;
                }
            };
            attachment.dropZone.input.addEventListener('change', syncUploadTitle);

            if (focus === 'upload') {
                attachment.dropZone.focus();
            } else {
                attachment.pickerButton?.focus();
            }

            attachment.linkButton?.addEventListener('click', function(e) {
                e.preventDefault();
                const selection = attachment.getSelection('link');
                if (!selection) {
                    Domus.UI.showNotification(t('domus', 'Please select a file to link.'), 'error');
                    return;
                }
                Domus.Api.linkDocument(entityType, entityId, { filePath: selection.filePath, year: selection.year })
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Document linked.'), 'success');
                        handleSuccess();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });

            attachment.uploadButton?.addEventListener('click', function(e) {
                e.preventDefault();
                const selection = attachment.getSelection('upload');
                if (!selection || !selection.file) {
                    Domus.UI.showNotification(t('domus', 'Please choose a file to upload.'), 'error');
                    return;
                }
                Domus.Api.uploadDocument(entityType, entityId, selection.file, selection.year, selection.title)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Document uploaded.'), 'success');
                        handleSuccess();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function openDetailModal(documentId) {
            Domus.Api.getDocumentDetail(documentId)
                .then(detail => {
                    const fileLink = detail.document?.fileUrl ? '<a class="domus-link" href="' + Domus.Utils.escapeHtml(detail.document.fileUrl) + '">' + Domus.Utils.escapeHtml(detail.document.fileName || detail.document.fileUrl || '') + '</a>' : Domus.Utils.escapeHtml(detail.document?.fileName || '');
                    const linked = detail.linkedEntities || [];
                    const typeLabels = {
                        property: t('domus', 'Property'),
                        unit: t('domus', 'Unit'),
                        partner: t('domus', 'Partner'),
                        tenancy: t('domus', 'Tenancy'),
                        booking: t('domus', 'Booking'),
                        report: t('domus', 'Report')
                    };
                    const list = linked.length ? linked.map(link => {
                        const type = typeLabels[link.entityType] || link.entityType;
                        let name = link.label || `${type} #${link.entityId}`;

                        if (link.entityType === 'booking' && link.booking) {
                            const date = Domus.Utils.formatDate(link.booking.date);
                            const accountNumber = link.booking.account !== undefined && link.booking.account !== null
                                ? String(link.booking.account)
                                : '';
                            const account = [accountNumber, link.booking.accountLabel].filter(Boolean).join(' — ');
                            const amount = Domus.Utils.formatCurrency(link.booking.amount);
                            const parts = [date, account, amount].filter(Boolean).join(' | ');
                            if (parts) {
                                name = parts;
                            }
                        }

                        return '<li><strong>' + Domus.Utils.escapeHtml(type) + ':</strong> ' + Domus.Utils.escapeHtml(name) + '</li>';
                    }).join('') : '<li>' + Domus.Utils.escapeHtml(t('domus', 'No linked objects found.')) + '</li>';

                    Domus.UI.openModal({
                        title: t('domus', 'Document links'),
                        content: '<div class="domus-doc-detail">' +
                            '<p><strong>' + Domus.Utils.escapeHtml(t('domus', 'File')) + ':</strong> ' + fileLink + '</p>' +
                            '<ul>' + list + '</ul>' +
                            '</div>'
                    });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        return { renderList, openLinkModal, createAttachmentWidget };
    })();

    /**
     * App initializer
     */
    Domus.App = (function() {
        function init() {
            // In real-world scenario, fetch role info from backend. Here we seed demo roles.
            Domus.Role.setRoleInfo({
                currentRole: 'landlord',
                availableRoles: ['landlord', 'buildingMgmt']
            });

            registerRoutes();
            if (!Domus.Router.navigateFromHash()) {
                Domus.Router.navigate('dashboard');
            }
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

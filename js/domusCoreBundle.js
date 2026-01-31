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
            return `${formatNumber(numeric * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })} %`;
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
            getSettings: () => request('GET', '/settings'),
            updateSettings: data => request('PUT', '/settings', data),
            createDemoContent: data => request('POST', '/settings/demo-content', data),
            getProperties: () => request('GET', buildYearUrl('/properties')),
            createProperty: data => request('POST', '/properties', data),
            updateProperty: (id, data) => request('PUT', `/properties/${id}`, data),
            deleteProperty: id => request('DELETE', `/properties/${id}`),
            getProperty: id => request('GET', `/properties/${id}`),
            getTaskTemplates: (activeOnly = true) => request('GET', buildUrl('/api/task-templates', appendFilters(new URLSearchParams(), { activeOnly: activeOnly ? 1 : 0 }))),
            getTaskTemplate: id => request('GET', `/api/task-templates/${id}`),
            createTaskTemplate: data => request('POST', '/api/task-templates', data),
            updateTaskTemplate: (id, data) => request('PUT', `/api/task-templates/${id}`, data),
            deleteTaskTemplate: id => request('DELETE', `/api/task-templates/${id}`),
            reorderTaskTemplateSteps: (id, orderedStepIds) => request('POST', `/api/task-templates/${id}/reorder-steps`, { orderedStepIds }),
            addTaskTemplateStep: (id, data) => request('POST', `/api/task-templates/${id}/steps`, data),
            updateTaskTemplateStep: (stepId, data) => request('PUT', `/api/task-template-steps/${stepId}`, data),
            deleteTaskTemplateStep: stepId => request('DELETE', `/api/task-template-steps/${stepId}`),
            startWorkflowRun: (unitId, data) => request('POST', `/api/units/${unitId}/workflow-runs`, data),
            getWorkflowRunsByUnit: unitId => request('GET', `/api/units/${unitId}/workflow-runs`),
            getWorkflowRun: runId => request('GET', `/api/workflow-runs/${runId}`),
            deleteWorkflowRun: runId => request('DELETE', `/api/workflow-runs/${runId}`),
            closeTaskStep: stepId => request('POST', `/api/task-steps/${stepId}/close`),
            reopenTaskStep: stepId => request('POST', `/api/task-steps/${stepId}/reopen`),
            createTask: (unitId, data) => request('POST', `/api/units/${unitId}/tasks`, data),
            getTasksByUnit: (unitId, status) => request('GET', buildUrl(`/api/units/${unitId}/tasks`, appendFilters(new URLSearchParams(), { status }))),
            getOpenTasks: status => request('GET', buildUrl('/api/tasks', appendFilters(new URLSearchParams(), { status }))),
            closeTask: taskId => request('POST', `/api/tasks/${taskId}/close`),
            reopenTask: taskId => request('POST', `/api/tasks/${taskId}/reopen`),
            deleteTask: taskId => request('DELETE', `/api/tasks/${taskId}`),
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
            closeBookingYear: (year, data) => request('POST', `/booking-years/${year}/close`, data),
            reopenBookingYear: (year, data) => request('POST', `/booking-years/${year}/reopen`, data),
            createUnit: data => request('POST', '/units', data),
            updateUnit: (id, data) => request('PUT', `/units/${id}`, data),
            deleteUnit: id => request('DELETE', `/units/${id}`),
            exportUnitDataset: unitId => request('GET', `/units/${unitId}/export`),
            importUnitDataset: (payload, propertyId) => request('POST', '/units/import', { payload, propertyId }),
            getDistributions: (propertyId, options = {}) => {
                const params = appendFilters(new URLSearchParams(), { unitId: options.unitId });
                return request('GET', buildUrl(`/properties/${propertyId}/distributions`, params));
            },
            getUnitDistributions: (unitId) => request('GET', `/units/${unitId}/distributions`),
            getDistributionReport: (propertyId, unitId, year) => {
                const params = appendFilters(new URLSearchParams(), { propertyId, unitId, year });
                return request('GET', buildUrl('/distribution-report', params));
            },
            createDistribution: (propertyId, data) => request('POST', `/properties/${propertyId}/distributions`, data),
            updateDistribution: (propertyId, distributionId, data) => request('PUT', `/properties/${propertyId}/distributions/${distributionId}`, data),
            createUnitDistribution: (unitId, data) => request('POST', `/units/${unitId}/distributions`, data),
            getPartners: (type) => {
                const resolvedType = type && String(type).trim() !== ''
                    ? type
                    : null;
                const params = resolvedType ? appendFilters(new URLSearchParams(), { partnerType: resolvedType }) : null;
                return request('GET', buildUrl('/partners', params));
            },
            getUnitPartners: unitId => request('GET', `/units/${unitId}/partners`),
            getPropertyPartners: propertyId => request('GET', `/properties/${propertyId}/partners`),
            createUnitPartner: (unitId, data) => request('POST', `/units/${unitId}/partners`, data),
            createPropertyPartner: (propertyId, data) => request('POST', `/properties/${propertyId}/partners`, data),
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
                const params = withYear();
                const sanitizedFilters = Object.assign({}, filters || {});
                if (sanitizedFilters.year !== undefined && sanitizedFilters.year !== null && sanitizedFilters.year !== '') {
                    params.set('year', sanitizedFilters.year);
                    delete sanitizedFilters.year;
                }
                return request('GET', buildUrl('/bookings', appendFilters(params, sanitizedFilters)));
            },
            createBooking: data => request('POST', '/bookings', data),
            updateBooking: (id, data) => request('PUT', `/bookings/${id}`, data),
            deleteBooking: id => request('DELETE', `/bookings/${id}`),
            getAccounts: () => request('GET', '/accounts'),
            createAccount: data => request('POST', '/accounts', data),
            updateAccount: (id, data) => request('PUT', `/accounts/${id}`, data),
            disableAccount: id => request('POST', `/accounts/${id}/disable`),
            enableAccount: id => request('POST', `/accounts/${id}/enable`),
            deleteAccount: id => request('DELETE', `/accounts/${id}`),
            getAccountTotals: (accounts = [], filters = {}) => {
                const params = new URLSearchParams();
                const list = (accounts || []).filter(account => account !== undefined && account !== null && account !== '');
                if (list.length) {
                    params.set('accounts', list.join(','));
                }
                if (filters.propertyId) {
                    params.set('propertyId', filters.propertyId);
                }
                if (filters.unitId) {
                    params.set('unitId', filters.unitId);
                }
                return request('GET', buildUrl('/statistics/accounts', params));
            },
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
    Domus.UI = (function() {
        function renderContent(html) {
            const appContent = document.getElementById('app-content');
            if (appContent) {
                appContent.classList.add('app-domus');
                const contentTarget = document.getElementById('domus-content') || appContent;
                contentTarget.innerHTML = html;
                relocateToolbar(contentTarget);
            }
        }

        function relocateToolbar(contentTarget) {
            const toolbarHost = document.getElementById('domus-top-nav-secondary');
            if (!toolbarHost) {
                return;
            }
            toolbarHost.innerHTML = '';
            if (!contentTarget) {
                return;
            }
            const toolbar = contentTarget.querySelector('.domus-toolbar');
            if (toolbar) {
                toolbarHost.appendChild(toolbar);
            }
            const backButton = contentTarget.querySelector('.domus-back-button');
            if (backButton) {
                toolbarHost.appendChild(backButton);
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
            const { title, content, size, headerActions = [], onClose } = options || {};
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

            let closed = false;

            function closeModal() {
                if (closed) {
                    return;
                }
                closed = true;
                document.removeEventListener('keydown', onEsc);
                backdrop.remove();
                if (typeof onClose === 'function') {
                    onClose();
                }
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

        function confirmAction(options = {}) {
            const title = options.title || t('domus', 'Please confirm');
            const message = options.message || '';
            const confirmLabel = options.confirmLabel || t('domus', 'Yes');
            const cancelLabel = options.cancelLabel || t('domus', 'Cancel');
            const confirmClassName = options.confirmClassName || 'primary';
            const content = document.createElement('div');
            if (message) {
                const paragraph = document.createElement('p');
                paragraph.className = 'domus-modal-message';
                paragraph.textContent = message;
                content.appendChild(paragraph);
            }

            const footer = document.createElement('div');
            footer.className = 'domus-modal-footer';
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.textContent = cancelLabel;
            const confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.textContent = confirmLabel;
            if (confirmClassName) {
                confirmButton.className = confirmClassName;
            }
            footer.appendChild(cancelButton);
            footer.appendChild(confirmButton);
            content.appendChild(footer);

            return new Promise(resolve => {
                let resolved = false;
                let modal;
                const finish = result => {
                    if (resolved) {
                        return;
                    }
                    resolved = true;
                    modal?.close();
                    resolve(result);
                };
                modal = openModal({
                    title,
                    content,
                    onClose: () => finish(false)
                });
                cancelButton.addEventListener('click', () => finish(false));
                confirmButton.addEventListener('click', () => finish(true));
            });
        }

        function createIconSpan(iconClass) {
            const icon = document.createElement('span');
            icon.className = ['domus-icon', iconClass].filter(Boolean).join(' ');
            icon.setAttribute('aria-hidden', 'true');
            return icon;
        }

        function createIconButton(iconClass, label, options = {}) {
            const btn = document.createElement('button');
            const classes = ['domus-icon-only-button'];
            if (options.className) {
                classes.push(options.className);
            }
            btn.className = classes.join(' ');
            btn.type = options.type || 'button';
            if (options.id) {
                btn.id = options.id;
            }
            if (label) {
                btn.setAttribute('aria-label', label);
                btn.title = options.title || label;
            }
            if (options.dataset) {
                Object.entries(options.dataset).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        btn.dataset[key] = value;
                    }
                });
            }

            btn.appendChild(createIconSpan(iconClass));

            const hiddenLabel = document.createElement('span');
            hiddenLabel.className = 'domus-visually-hidden';
            hiddenLabel.textContent = label || '';
            btn.appendChild(hiddenLabel);

            if (typeof options.onClick === 'function') {
                btn.addEventListener('click', options.onClick);
            }

            return btn;
        }

        function createIconLabelButton(iconClass, label, options = {}) {
            const btn = document.createElement('button');
            const classes = [];
            if (options.className) {
                classes.push(options.className);
            }
            btn.className = classes.join(' ');
            btn.type = options.type || 'button';
            if (options.id) {
                btn.id = options.id;
            }
            if (label) {
                btn.setAttribute('aria-label', label);
                btn.title = options.title || label;
            }
            if (options.dataset) {
                Object.entries(options.dataset).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        btn.dataset[key] = value;
                    }
                });
            }

            btn.appendChild(createIconSpan(iconClass));
            const text = document.createElement('span');
            text.className = 'domus-button-label';
            text.textContent = label || '';
            btn.appendChild(text);

            if (typeof options.onClick === 'function') {
                btn.addEventListener('click', options.onClick);
            }

            return btn;
        }

        function buildIconButton(iconClass, label, options = {}) {
            return createIconButton(iconClass, label, options).outerHTML;
        }

        function buildIconLabelButton(iconClass, label, options = {}) {
            return createIconLabelButton(iconClass, label, options).outerHTML;
        }

        function buildEmptyStateAction(message, options = {}) {
            const iconClass = options.iconClass || 'domus-icon-add';
            const btn = document.createElement('button');
            const classes = ['domus-empty-state-action'];
            if (options.className) {
                classes.push(options.className);
            }
            btn.className = classes.join(' ');
            btn.type = 'button';
            if (options.actionId) {
                btn.id = options.actionId;
            }
            if (message) {
                btn.setAttribute('aria-label', message);
                btn.title = message;
            }

            const parts = String(message || '').split('. ');
            const head = parts.shift() || '';
            const headLine = head && !head.endsWith('.') && parts.length ? `${head}.` : head;
            const subLine = parts.length ? parts.join('. ') : '';

            btn.appendChild(createIconSpan(iconClass));
            const text = document.createElement('span');
            text.className = 'domus-empty-state-text';
            const headSpan = document.createElement('span');
            headSpan.className = 'domus-empty-state-head';
            headSpan.textContent = headLine;
            text.appendChild(headSpan);
            if (subLine) {
                const subSpan = document.createElement('span');
                subSpan.className = 'domus-empty-state-sub';
                subSpan.textContent = subLine;
                text.appendChild(subSpan);
            }
            btn.appendChild(text);

            return '<div class="domus-empty-state">' + btn.outerHTML + '</div>';
        }

        function buildScopeAddButton(iconClass, label, options = {}) {
            const btn = document.createElement('button');
            const classes = ['domus-scope-add-button'];
            if (options.className) {
                classes.push(options.className);
            }
            btn.className = classes.join(' ');
            btn.type = options.type || 'button';
            if (options.id) {
                btn.id = options.id;
            }
            if (label) {
                btn.setAttribute('aria-label', label);
                btn.title = options.title || label;
            }
            if (options.dataset) {
                Object.entries(options.dataset).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        btn.dataset[key] = value;
                    }
                });
            }

            btn.appendChild(createIconSpan(iconClass));
            btn.appendChild(createIconSpan('domus-icon-add'));

            const hiddenLabel = document.createElement('span');
            hiddenLabel.className = 'domus-visually-hidden';
            hiddenLabel.textContent = label || '';
            btn.appendChild(hiddenLabel);

            if (typeof options.onClick === 'function') {
                btn.addEventListener('click', options.onClick);
            }

            return btn.outerHTML;
        }

        function buildModalAction(label, onClick, iconClass = 'domus-icon-edit') {
            const btn = createIconButton(iconClass, label, { className: 'domus-modal-action' });
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

        function buildTable(headers, rows, options = {}) {
            const wrapPanel = options.wrapPanel !== false;
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
            if (!wrapPanel) {
                return html;
            }
            return '<div class="domus-panel domus-panel-table">' + html + '</div>';
        }

        function bindRowNavigation() {
            document.querySelectorAll('table.domus-table tr[data-navigate], table.domus-table tr[data-booking-id]').forEach(row => {
                const bookingId = row.getAttribute('data-booking-id');
                const target = row.getAttribute('data-navigate');
                const argsRaw = row.getAttribute('data-args') || '';
                if (!bookingId && !target) return;
                row.addEventListener('click', function(e) {
                    if (e.target.closest('a') || e.target.closest('button')) {
                        return;
                    }
                    if (bookingId) {
                        Domus.Bookings.openEditModal(bookingId, {
                            refreshView: row.getAttribute('data-refresh-view'),
                            refreshId: row.getAttribute('data-refresh-id')
                        });
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
            input.className = 'domus-dropzone-input';

            const area = document.createElement('div');
            area.className = 'domus-dropzone-area';
            area.setAttribute('role', 'button');
            area.setAttribute('tabindex', '0');
            area.innerHTML = '<strong>' + Domus.Utils.escapeHtml(options.label || t('domus', 'Drop a file here or click to select one')) + '</strong>';

            const fileName = document.createElement('div');
            fileName.className = 'domus-dropzone-filename muted';
            fileName.textContent = options.placeholder || t('domus', 'No file selected');

            const inputId = 'domus-dropzone-input-' + Math.random().toString(36).slice(2);
            input.id = inputId;

            const label = document.createElement('label');
            label.className = 'domus-dropzone-label';
            label.setAttribute('for', inputId);
            label.appendChild(area);
            label.appendChild(fileName);

            container.appendChild(input);
            container.appendChild(label);

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
                if (e?.type === 'keydown') {
                    e.preventDefault();
                }
                if (isChoosing) return;
                isChoosing = true;
                try {
                    if (typeof input.showPicker === 'function') {
                        input.showPicker();
                    } else {
                        input.click();
                    }
                } catch (error) {
                    console.warn('[Domus] Dropzone input click failed', error);
                }
                setTimeout(() => { isChoosing = false; }, 300);
            };
            container.addEventListener('click', triggerSelect);
            area.addEventListener('click', triggerSelect);
            fileName.addEventListener('click', triggerSelect);
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

        function buildBackButton(targetView, args) {
            const serializedArgs = (args || []).join(',');
            return createIconLabelButton('domus-icon-back', t('domus', 'Back'), {
                className: 'domus-back-button primary',
                dataset: {
                    back: targetView,
                    backArgs: serializedArgs
                }
            }).outerHTML;
        }

        function buildSectionHeader(title, action) {
            let actionHtml = '';
            if (action) {
                if (action.iconClass) {
                    const label = action.label || action.title || t('domus', 'Add');
                    const button = createIconButton(action.iconClass, label, {
                        id: action.id,
                        dataset: action.dataset,
                        className: 'domus-section-action',
                        title: action.title || label
                    });
                    actionHtml = button.outerHTML;
                } else {
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

        function buildKpiTile(options = {}) {
            if (!options.headline && options.headline !== 0) {
                return '';
            }

            const headline = Domus.Utils.escapeHtml(String(options.headline));
            const customValue = options.valueHtml;
            const value = customValue !== undefined
                ? ((customValue === null || customValue === '') ? '—' : customValue)
                : (options.value === undefined || options.value === null || options.value === '' ? '—' : Domus.Utils.escapeHtml(String(options.value)));
            const subline = options.subline ? '<div class="domus-kpi-subline">' + Domus.Utils.escapeHtml(String(options.subline)) + '</div>' : '';
            const linkLabel = Domus.Utils.escapeHtml(options.linkLabel || t('domus', 'More'));
            const detailTarget = options.detailTarget ? ' data-kpi-target="' + Domus.Utils.escapeHtml(options.detailTarget) + '"' : '';
            const chartId = options.chartId ? Domus.Utils.escapeHtml(options.chartId) : '';
            const chart = options.showChart && chartId
                ? '<div class="domus-kpi-chart"><div class="domus-kpi-chart-inner"><canvas id="' + chartId + '" class="domus-kpi-chart-canvas"></canvas></div></div>'
                : '';

            return '<div class="domus-kpi-tile">' +
                '<div class="domus-kpi-content">' +
                '<div class="domus-kpi-headline">' + headline + '</div>' +
                '<div class="domus-kpi-value">' + value + '</div>' +
                subline +
                '<a href="#" class="domus-kpi-more"' + detailTarget + '>' + linkLabel + '</a>' +
                '</div>' +
                chart +
                '</div>';
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
            if (row.className) {
                if (Array.isArray(row.className)) {
                    classes.push(...row.className.filter(Boolean));
                } else {
                    classes.push(row.className);
                }
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

        function buildGuidedSteps(steps = [], currentIndex = 0) {
            const items = (steps || []).map((step, index) => {
                const label = step?.label || '';
                let statusClass = 'is-upcoming';
                if (index < currentIndex) {
                    statusClass = 'is-complete';
                } else if (index === currentIndex) {
                    statusClass = 'is-current';
                }
                const ariaCurrent = index === currentIndex ? ' aria-current="step"' : '';
                return '<li class="domus-guided-step ' + Domus.Utils.escapeHtml(statusClass) + '"' + ariaCurrent + '>' +
                    '<span class="domus-guided-step-bullet" aria-hidden="true"></span>' +
                    '<span class="domus-guided-step-label">' + Domus.Utils.escapeHtml(label) + '</span>' +
                    '</li>';
            }).join('');

            return '<ol class="domus-guided-steps">' + items + '</ol>';
        }

        function buildGuidedWorkflowLayout(steps, currentIndex, content) {
            return '<div class="domus-guided-workflow">' +
                '<div class="domus-guided-steps-wrapper">' + buildGuidedSteps(steps, currentIndex) + '</div>' +
                '<div class="domus-guided-content">' + (content || '') + '</div>' +
                '</div>';
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
            buildBackButton,
            buildSectionHeader,
            bindBackButtons,
            bindRowNavigation,
            buildCollapsible,
            bindCollapsibles,
            buildStatCards,
            buildKpiTile,
            buildInfoList,
            buildFormSection,
            buildFormRow,
            buildFormTable,
            buildGuidedSteps,
            buildGuidedWorkflowLayout,
            openModal,
            confirmAction,
            buildIconButton,
            buildIconLabelButton,
            buildEmptyStateAction,
            buildScopeAddButton,
            createIconButton,
            buildModalAction,
            createFileDropZone
        };
    })();

    /**
     * Role helper
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
            const topNavContainer = document.getElementById('domus-top-nav-primary');
            const bottomNavPrimary = document.getElementById('domus-bottom-nav-primary');
            const bottomNavSecondary = document.getElementById('domus-bottom-nav-secondary');
            if (!container && !topNavContainer) return;

            const activeView = getActiveView();

            let usedContainerForPrimary = false;
            if (topNavContainer) {
                topNavContainer.innerHTML = '';
                const topNavList = buildNavList(getMenuItems(), activeView);
                topNavList.classList.add('domus-nav-top');
                topNavContainer.appendChild(topNavList);
            } else if (container) {
                container.innerHTML = '';
                container.appendChild(buildNavList(getMenuItems(), activeView));
                usedContainerForPrimary = true;
            }

            if (container) {
                if (!usedContainerForPrimary) {
                    container.innerHTML = '';
                }
            }

            if (bottomNavPrimary) {
                bottomNavPrimary.innerHTML = '';
            }

            if (bottomNavSecondary) {
                bottomNavSecondary.innerHTML = '';
            }

            const roleOptions = Domus.Role.getRoleOptions();
            if (roleOptions.length > 1) {
                const roleSwitcher = document.createElement('div');
                roleSwitcher.className = 'domus-role-switcher domus-role-switcher-bottom';
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
                if (bottomNavSecondary) {
                    bottomNavSecondary.appendChild(roleSwitcher);
                } else if (container) {
                    container.appendChild(roleSwitcher);
                }
            }

            const bottomItems = getBottomItems();
            if (bottomItems.length) {
                const bottomList = buildNavList(bottomItems, activeView);
                bottomList.classList.add('domus-nav-bottom');
                if (bottomNavPrimary) {
                    bottomNavPrimary.appendChild(bottomList);
                } else if (container) {
                    container.appendChild(bottomList);
                }
            }
        }

        function buildNavList(items, activeView) {
            const ul = document.createElement('ul');
            ul.className = 'domus-nav';

            items.forEach(item => {
                const li = document.createElement('li');
                li.className = activeView === item.view ? 'active' : '';
                const link = document.createElement('a');
                link.href = '#';
                const icon = document.createElement('span');
                icon.className = ['domus-icon', 'domus-nav-icon', item.icon].filter(Boolean).join(' ');
                icon.setAttribute('aria-hidden', 'true');
                const label = document.createElement('span');
                label.textContent = item.label;
                link.appendChild(icon);
                link.appendChild(label);
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    Domus.Router.navigate(item.view, item.args || []);
                });
                li.appendChild(link);
                ul.appendChild(li);
            });

            return ul;
        }

        function getMenuItems() {
            return Domus.Role.getNavigationItems();
        }

        function getBottomItems() {
            return [
                { view: 'settings', label: t('domus', 'Settings'), icon: 'domus-icon-settings' }
            ];
        }

        function getActiveView() {
            const viewMap = {
                propertyDetail: 'properties',
                unitDetail: 'units',
                partnerDetail: 'partners',
                tenancyDetail: 'tenancies'
            };

            return viewMap[Domus.state.currentView] || Domus.state.currentView;
        }

        return { render };
    })();

    /**
     * Tasks
     */
    Domus.Role = (function() {
        const roleConfigs = {
            landlord: {
                label: t('domus', 'Landlord'),
                navigation: [
                    { view: 'dashboard', label: t('domus', 'Dashboard'), icon: 'domus-icon-dashboard' },
                    { view: 'units', label: t('domus', 'Units'), icon: 'domus-icon-unit' },
                    { view: 'partners', label: t('domus', 'Partners'), icon: 'domus-icon-partner' },
                    { view: 'bookings', label: t('domus', 'Bookings'), icon: 'domus-icon-booking' },
                    { view: 'analytics', label: t('domus', 'Analytics'), icon: 'domus-icon-analytics' }
                ],
                tenancyLabels: { singular: t('domus', 'Tenancy'), plural: t('domus', 'Tenancies'), action: t('domus', 'Add {entity}', { entity: t('domus', 'Tenancy') }) },
                capabilities: { manageTenancies: true, manageBookings: true, manageDocuments: true },
                unitDetail: { showBookings: true, showTenancyActions: true }
            },
            buildingMgmt: {
                label: t('domus', 'Building Mgmt'),
                navigation: [
                    { view: 'dashboard', label: t('domus', 'Dashboard'), icon: 'domus-icon-dashboard' },
                    { view: 'properties', label: t('domus', 'Properties'), icon: 'domus-icon-property' },
                    { view: 'partners', label: t('domus', 'Partners'), icon: 'domus-icon-partner' },
                    { view: 'bookings', label: t('domus', 'Bookings'), icon: 'domus-icon-booking' },
                    { view: 'analytics', label: t('domus', 'Analytics'), icon: 'domus-icon-analytics' }
                ],
                tenancyLabels: { singular: t('domus', 'Owner'), plural: t('domus', 'Owners'), action: t('domus', 'Add {entity}', { entity: t('domus', 'Owner') }) },
                capabilities: { manageTenancies: true, manageBookings: true, manageDocuments: true },
                unitDetail: { showBookings: true, showTenancyActions: true }
            },
            tenant: {
                label: t('domus', 'Tenant'),
                navigation: [
                    { view: 'dashboard', label: t('domus', 'Dashboard'), icon: 'domus-icon-dashboard' },
                    { view: 'tenancies', label: t('domus', 'My tenancies'), icon: 'domus-icon-tenancy' },
                    { view: 'analytics', label: t('domus', 'Analytics'), icon: 'domus-icon-analytics' }
                ],
                tenancyLabels: { singular: t('domus', 'Tenancy'), plural: t('domus', 'My tenancies'), action: null },
                capabilities: { manageTenancies: false, manageBookings: false, manageDocuments: false },
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
                args: item.args,
                icon: item.icon
            }));
        }

        function getTenancyLabels() {
            const defaults = {
                singular: t('domus', 'Tenancy'),
                plural: t('domus', 'Tenancies'),
                action: t('domus', 'Add {entity}', { entity: t('domus', 'Tenancy') })
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
                hideField: false,
                disabled: false
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
            return null;
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
     * Distribution helper
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
            Domus.Router.register('analytics', Domus.Analytics.render);
            Domus.Router.register('properties', Domus.Properties.renderList);
            Domus.Router.register('propertyDetail', Domus.Properties.renderDetail);
            Domus.Router.register('units', Domus.Units.renderList);
            Domus.Router.register('unitDetail', Domus.Units.renderDetail);
            Domus.Router.register('partners', Domus.Partners.renderList);
            Domus.Router.register('partnerDetail', Domus.Partners.renderDetail);
            Domus.Router.register('tenancies', Domus.Tenancies.renderList);
            Domus.Router.register('tenancyDetail', Domus.Tenancies.renderDetail);
            Domus.Router.register('bookings', Domus.Bookings.renderList);
            Domus.Router.register('accounts', Domus.Accounts.renderList);
            Domus.Router.register('settings', Domus.Settings.render);
        }

        return { init };
    })();

    document.addEventListener('DOMContentLoaded', function() {
        Domus.App.init();
    });
})();

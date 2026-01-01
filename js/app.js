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
            getDistributions: (propertyId, options = {}) => {
                const params = appendFilters(new URLSearchParams(), { unitId: options.unitId });
                return request('GET', buildUrl(`/properties/${propertyId}/distributions`, params));
            },
            getUnitDistributions: (unitId) => request('GET', `/units/${unitId}/distributions`),
            getDistributionPreview: (bookingId) => request('GET', `/bookings/${bookingId}/distribution-preview`),
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

        let accountHierarchy = null;
        let accounts = readAccounts();
        if (Array.isArray(accounts)) {
            accountHierarchy = accounts;
            accounts = mapHierarchyToAccounts(accountHierarchy);
        }
        Domus.accounts = accounts;

        function setAccounts(nextAccounts, hierarchy = null) {
            accounts = nextAccounts || {};
            accountHierarchy = hierarchy;
            Domus.accounts = accounts;
        }

        function toOptions(includePlaceholder = true, filterFn = null) {
            let entries = [];
            if (accountHierarchy && accountHierarchy.length) {
                entries = flattenHierarchy(accountHierarchy);
            } else {
                entries = Object.entries(accounts).map(([nr, data]) => ({
                    number: nr,
                    label: data && data.label ? data.label : '',
                    status: data && data.status ? data.status : null,
                    level: data && data.level ? data.level : 0
                }));
            }
            if (typeof filterFn === 'function') {
                entries = entries.filter(entry => filterFn(entry.number, entry));
            }
            entries = entries.filter(entry => entry.status !== 'disabled');

            const opts = entries.map(entry => {
                const prefix = entry.level ? `${'— '.repeat(entry.level)}` : '';
                const labelText = `${prefix}${entry.number} ${entry.label || ''}`.trim();
                return {
                    value: entry.number,
                    label: labelText || entry.number
                };
            });
            if (includePlaceholder) {
                return [{ value: '', label: t('domus', 'Select account') }].concat(opts);
            }
            return opts;
        }

        function label(accountNr) {
            const raw = accounts && accounts[accountNr] && accounts[accountNr].label;
            return raw || '';
        }

        function flattenHierarchy(nodes, level = 0, result = []) {
            (nodes || []).forEach(node => {
                result.push({
                    id: node.id,
                    number: node.number,
                    label: node.label || '',
                    level,
                    status: node.status,
                    isSystem: node.isSystem,
                    parentId: node.parentId
                });
                if (node.children && node.children.length) {
                    flattenHierarchy(node.children, level + 1, result);
                }
            });
            return result;
        }

        function mapHierarchyToAccounts(nodes) {
            const entries = flattenHierarchy(nodes || []);
            const mapped = {};
            entries.forEach(entry => {
                mapped[entry.number] = {
                    label: entry.label,
                    status: entry.status,
                    level: entry.level
                };
            });
            return mapped;
        }

        function updateAccountsFromHierarchy(nodes) {
            setAccounts(mapHierarchyToAccounts(nodes || []), nodes || []);
        }

        function buildParentOptions(nodes, options = {}) {
            const excludeId = options.excludeId;
            const entries = flattenHierarchy(nodes || []);
            const list = entries.filter(entry => entry.id !== excludeId);
            const base = [{ value: '', label: t('domus', 'No parent') }];
            return base.concat(list.map(entry => {
                const prefix = entry.level ? `${'— '.repeat(entry.level)}` : '';
                const labelText = `${prefix}${entry.number} ${entry.label || ''}`.trim();
                return {
                    value: String(entry.id),
                    label: labelText || entry.number
                };
            }));
        }

        function buildAccountTree(nodes, level = 0) {
            if (!nodes || nodes.length === 0) {
                if (level > 0) {
                    return '';
                }
                return '<div class="domus-empty">' +
                    Domus.Utils.escapeHtml(t('domus', 'No {entity} available.', { entity: t('domus', 'Accounts') })) +
                    '</div>';
            }
            const items = nodes.map(node => buildAccountNode(node, level)).join('');
            return '<ul class="domus-account-tree">' + items + '</ul>';
        }

        function buildAccountNode(account, level) {
            const safeNumber = Domus.Utils.escapeHtml(account.number || '');
            const safeLabel = Domus.Utils.escapeHtml(account.label || account.labelDe || account.labelEn || '');
            const isDisabled = account.status === 'disabled';
            const statusLabel = isDisabled ? t('domus', 'Disabled') : t('domus', 'Active');
            const statusClass = isDisabled ? 'domus-badge domus-badge-muted' : 'domus-badge';
            const hasChildren = !!(account.children && account.children.length);
            const isSystem = account.isSystem === 1 || account.isSystem === true;
            const usedInBookings = account.usedInBookings === true;
            const cannotModify = isSystem;
            const deleteBlocked = isSystem || usedInBookings || hasChildren;
            const disableLabel = isDisabled ? t('domus', 'Enable') : t('domus', 'Disable');
            const disableTitle = isSystem
                ? t('domus', 'System accounts cannot be disabled.')
                : '';
            let deleteTitle = '';
            if (isSystem) {
                deleteTitle = t('domus', 'System accounts cannot be deleted.');
            } else if (usedInBookings) {
                deleteTitle = t('domus', 'Accounts in bookings cannot be deleted.');
            } else if (hasChildren) {
                deleteTitle = t('domus', 'Accounts with children cannot be deleted.');
            }
            const badges = [
                `<span class="${statusClass}">${Domus.Utils.escapeHtml(statusLabel)}</span>`,
                (usedInBookings ? `<span class="domus-badge domus-badge-muted">${Domus.Utils.escapeHtml(t('domus', 'Used in bookings'))}</span>` : ''),
                (isSystem ? `<span class="domus-badge domus-badge-muted">${Domus.Utils.escapeHtml(t('domus', 'System'))}</span>` : '')
            ].filter(Boolean).join('');

            const childrenHtml = buildAccountTree(account.children || [], level + 1);
            return '<li class="domus-account-node" style="--level:' + level + '">' +
                '<div class="domus-account-entry">' +
                '<div class="domus-account-main">' +
                '<div class="domus-account-title">' +
                '<span class="domus-account-number">' + safeNumber + '</span>' +
                '<span class="domus-account-label">' + safeLabel + '</span>' +
                (badges ? '<span class="domus-account-badges">' + badges + '</span>' : '') +
                '</div>' +
                '</div>' +
                '<div class="domus-account-actions">' +
                '<button type="button" class="domus-account-action" data-account-action="addChild" data-account-id="' + account.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Add child')) + '</button>' +
                '<button type="button" class="domus-account-action" data-account-action="edit" data-account-id="' + account.id + '">' + Domus.Utils.escapeHtml(t('domus', 'Edit')) + '</button>' +
                '<button type="button" class="domus-account-action" data-account-action="toggle" data-account-id="' + account.id + '"' +
                (cannotModify ? ' disabled title="' + Domus.Utils.escapeHtml(disableTitle) + '"' : '') + '>' +
                Domus.Utils.escapeHtml(disableLabel) + '</button>' +
                '<button type="button" class="domus-account-action" data-account-action="delete" data-account-id="' + account.id + '"' +
                (deleteBlocked ? ' disabled title="' + Domus.Utils.escapeHtml(deleteTitle) + '"' : '') + '>' +
                Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                '</div>' +
                '</div>' +
                childrenHtml +
                '</li>';
        }

        function buildAccountForm(account, options = {}) {
            const defaults = options.defaults || {};
            const parentId = defaults.parentId !== undefined ? defaults.parentId : (account?.parentId ?? '');
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Number'),
                    required: true,
                    content: '<input name="number" required value="' + Domus.Utils.escapeHtml(account?.number || '') + '">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Label (DE)'),
                    content: '<input name="labelDe" value="' + Domus.Utils.escapeHtml(account?.labelDe || '') + '">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Label (EN)'),
                    content: '<input name="labelEn" value="' + Domus.Utils.escapeHtml(account?.labelEn || '') + '">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Parent account'),
                    content: '<select name="parentId">' +
                        buildParentOptions(options.tree || [], { excludeId: account?.id }).map(opt => (
                            '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === String(parentId) ? ' selected' : '') + '>' +
                            Domus.Utils.escapeHtml(opt.label) + '</option>'
                        )).join('') +
                        '</select>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Sort order'),
                    content: '<input name="sortOrder" type="number" value="' + Domus.Utils.escapeHtml(account?.sortOrder ?? '') + '">'
                })
            ];

            const actions = '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-account-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-account-form">' +
                Domus.UI.buildFormTable(rows) +
                actions +
                '</form>' +
                '</div>';
        }

        function collectAccountFormData(form) {
            const formData = new FormData(form);
            const payload = {
                number: (formData.get('number') || '').toString().trim(),
                labelDe: (formData.get('labelDe') || '').toString().trim(),
                labelEn: (formData.get('labelEn') || '').toString().trim()
            };
            const parentId = (formData.get('parentId') || '').toString();
            const sortOrder = (formData.get('sortOrder') || '').toString().trim();
            if (parentId !== '') {
                payload.parentId = parentId;
            } else {
                payload.parentId = '';
            }
            if (sortOrder !== '') {
                payload.sortOrder = Number(sortOrder);
            }
            return payload;
        }

        function openAccountModal(options) {
            const mode = options.mode || 'create';
            const account = options.account || {};
            const modal = Domus.UI.openModal({
                title: mode === 'create'
                    ? t('domus', 'Add {entity}', { entity: t('domus', 'Account') })
                    : t('domus', 'Edit {entity}', { entity: t('domus', 'Account') }),
                content: buildAccountForm(account, { tree: options.tree || [], defaults: options.defaults || {} })
            });

            const form = modal.modalEl.querySelector('#domus-account-form');
            form?.addEventListener('submit', function(event) {
                event.preventDefault();
                const payload = collectAccountFormData(form);
                if (!payload.number) {
                    Domus.UI.showNotification(t('domus', 'Account number is required.'), 'error');
                    return;
                }
                const action = mode === 'create'
                    ? Domus.Api.createAccount(payload)
                    : Domus.Api.updateAccount(account.id, payload);
                action.then(() => {
                    Domus.UI.showNotification(
                        mode === 'create'
                            ? t('domus', '{entity} created.', { entity: t('domus', 'Account') })
                            : t('domus', '{entity} updated.', { entity: t('domus', 'Account') }),
                        'success'
                    );
                    modal.close();
                    renderList();
                }).catch(err => Domus.UI.showNotification(err.message, 'error'));
            });

            modal.modalEl.querySelector('#domus-account-cancel')?.addEventListener('click', modal.close);
        }

        function buildAccountIndex(nodes, map = {}) {
            (nodes || []).forEach(node => {
                map[node.id] = node;
                if (node.children && node.children.length) {
                    buildAccountIndex(node.children, map);
                }
            });
            return map;
        }

        function bindAccountActions(nodes) {
            const accountIndex = buildAccountIndex(nodes || []);
            document.getElementById('domus-account-create-btn')?.addEventListener('click', () => {
                openAccountModal({ mode: 'create', tree: nodes || [] });
            });

            document.querySelectorAll('[data-account-action]').forEach(btn => {
                btn.addEventListener('click', function() {
                    const action = this.dataset.accountAction;
                    const id = parseInt(this.dataset.accountId, 10);
                    if (!action || Number.isNaN(id)) {
                        return;
                    }
                    const account = accountIndex[id];
                    if (!account) {
                        return;
                    }
                    if (action === 'addChild') {
                        openAccountModal({ mode: 'create', tree: nodes || [], defaults: { parentId: account.id } });
                        return;
                    }
                    if (action === 'edit') {
                        openAccountModal({ mode: 'edit', account, tree: nodes || [] });
                        return;
                    }
                    if (action === 'toggle') {
                        const isDisabled = account.status === 'disabled';
                        const label = isDisabled ? t('domus', 'Enable') : t('domus', 'Disable');
                        if (!confirm(t('domus', '{action} {entity}?', { action: label, entity: t('domus', 'Account') }))) {
                            return;
                        }
                        const apiCall = isDisabled ? Domus.Api.enableAccount(id) : Domus.Api.disableAccount(id);
                        apiCall.then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: t('domus', 'Account') }), 'success');
                            renderList();
                        }).catch(err => Domus.UI.showNotification(err.message, 'error'));
                        return;
                    }
                    if (action === 'delete') {
                        if (!confirm(t('domus', 'Delete {entity}?', { entity: t('domus', 'Account') }))) {
                            return;
                        }
                        Domus.Api.deleteAccount(id)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: t('domus', 'Account') }), 'success');
                                renderList();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    }
                });
            });
        }

        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Accounts') }));
            Domus.Api.getAccounts()
                .then(nodes => {
                    const toolbar = '<div class="domus-toolbar">' +
                        '<button id="domus-account-create-btn" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Account') })) + '</button>' +
                        '</div>';
                    Domus.UI.renderContent(toolbar + '<div class="domus-account-tree-wrapper">' + buildAccountTree(nodes || []) + '</div>');
                    updateAccountsFromHierarchy(nodes || []);
                    bindAccountActions(nodes || []);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        return { toOptions, label, renderList };
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

            const icon = document.createElement('span');
            icon.className = ['domus-icon', iconClass].filter(Boolean).join(' ');
            icon.setAttribute('aria-hidden', 'true');
            btn.appendChild(icon);

            const hiddenLabel = document.createElement('span');
            hiddenLabel.className = 'domus-visually-hidden';
            hiddenLabel.textContent = label || '';
            btn.appendChild(hiddenLabel);

            if (typeof options.onClick === 'function') {
                btn.addEventListener('click', options.onClick);
            }

            return btn;
        }

        function buildIconButton(iconClass, label, options = {}) {
            return createIconButton(iconClass, label, options).outerHTML;
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
            return buildIconButton('domus-icon-back', t('domus', 'Back'), {
                className: 'domus-back-button',
                dataset: {
                    back: targetView,
                    backArgs: serializedArgs
                }
            });
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

        function buildKpiTile(options = {}) {
            if (!options.headline && options.headline !== 0) {
                return '';
            }

            const headline = Domus.Utils.escapeHtml(String(options.headline));
            const value = options.value === undefined || options.value === null || options.value === '' ? '—' : Domus.Utils.escapeHtml(String(options.value));
            const linkLabel = Domus.Utils.escapeHtml(options.linkLabel || t('domus', 'More'));
            const detailTarget = options.detailTarget ? ' data-kpi-target="' + Domus.Utils.escapeHtml(options.detailTarget) + '"' : '';
            const chartId = options.chartId ? Domus.Utils.escapeHtml(options.chartId) : '';
            const chart = options.showChart && chartId
                ? '<div class="domus-kpi-chart"><canvas id="' + chartId + '" class="domus-kpi-chart-canvas"></canvas></div>'
                : '';

            return '<div class="domus-kpi-tile">' +
                '<div class="domus-kpi-content">' +
                '<div class="domus-kpi-headline">' + headline + '</div>' +
                '<div class="domus-kpi-value">' + value + '</div>' +
                '<button type="button" class="domus-kpi-more"' + detailTarget + '>' + linkLabel + '</button>' +
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
            buildKpiTile,
            buildInfoList,
            buildFormSection,
            buildFormRow,
            buildFormTable,
            openModal,
            buildIconButton,
            createIconButton,
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
                    { view: 'dashboard', label: t('domus', 'Dashboard'), icon: 'domus-icon-dashboard' },
                    { view: 'units', label: t('domus', 'Units'), icon: 'domus-icon-unit' },
                    { view: 'partners', label: t('domus', 'Partners'), icon: 'domus-icon-partner' },
                    { view: 'bookings', label: t('domus', 'Bookings'), icon: 'domus-icon-booking' },
                    { view: 'accounts', label: t('domus', 'Accounts'), icon: 'domus-icon-account' },
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
                    { view: 'accounts', label: t('domus', 'Accounts'), icon: 'domus-icon-account' },
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
     * Distribution helper
     */
    Domus.Distributions = (function() {
        const typeOptions = [
            { value: 'area', label: t('domus', 'Area'), systemDefault: true },
            { value: 'mea', label: t('domus', 'MEA') },
            { value: 'unit', label: t('domus', 'Unit'), systemDefault: true },
            { value: 'persons', label: t('domus', 'Persons') },
            { value: 'consumption', label: t('domus', 'Consumption') },
            { value: 'mixed', label: t('domus', 'Mixed') },
            { value: 'manual', label: t('domus', 'Manual') }
        ];
        const baseTypes = ['mea', 'unit', 'area'];
        const systemDefaultTypes = typeOptions.filter(opt => opt.systemDefault).map(opt => opt.value);

        function canManageDistributions() {
            return Domus.Role.isBuildingMgmtView();
        }

        function loadForProperty(propertyId, options = {}) {
            return Domus.Api.getDistributions(propertyId, options);
        }

        function loadForUnit(unitId) {
            return Domus.Api.getUnitDistributions(unitId);
        }

        function getTypeLabel(type) {
            const normalized = (type || '').toString().toLowerCase();
            const match = typeOptions.find(opt => opt.value === normalized);
            return match ? match.label : type;
        }

        function isBaseType(type) {
            return baseTypes.includes((type || '').toString().toLowerCase());
        }

        function parseBaseConfig(configJson) {
            if (!configJson) {
                return '';
            }
            try {
                const parsed = JSON.parse(configJson);
                if (parsed && parsed.base !== undefined && parsed.base !== null && parsed.base !== '') {
                    return parsed.base;
                }
            } catch (e) {
                return '';
            }
            return '';
        }

        function buildBaseConfig(baseValue) {
            if (baseValue === undefined || baseValue === null || baseValue === '') {
                return '';
            }
            const parsed = parseFloat(baseValue);
            if (Number.isNaN(parsed) || parsed <= 0) {
                return '';
            }
            return JSON.stringify({ base: parsed });
        }

        function toggleConfigFields(form, type) {
            const normalized = (type || '').toString().toLowerCase();
            const needsBase = isBaseType(normalized);
            const needsConfig = normalized === 'mixed';
            const baseRow = form.querySelector('.domus-distribution-base-row');
            const configRow = form.querySelector('.domus-distribution-config-row');
            const baseInput = form.querySelector('input[name="baseValue"]');
            const configInput = form.querySelector('textarea[name="configJson"]');

            if (baseRow) {
                baseRow.style.display = needsBase ? '' : 'none';
            }
            if (configRow) {
                configRow.style.display = needsConfig ? '' : 'none';
            }
            if (baseInput) {
                baseInput.required = needsBase;
                baseInput.disabled = !needsBase;
            }
            if (configInput) {
                configInput.required = needsConfig;
                configInput.disabled = !needsConfig;
            }
        }

        function resolveConfigPayload(type, form) {
            const normalized = (type || '').toString().toLowerCase();
            if (isBaseType(normalized)) {
                const baseValue = form.querySelector('input[name="baseValue"]')?.value;
                return buildBaseConfig(baseValue);
            }
            if (normalized === 'mixed') {
                return form.querySelector('textarea[name="configJson"]')?.value || '';
            }
            return '';
        }

        function renderTable(distributions, options = {}) {
            const filtered = filterList(distributions, options);
            const showUnitValue = options.showUnitValue === true;
            const hideConfig = options.hideConfig === true;
            const headers = [
                t('domus', 'Name'),
                t('domus', 'Type'),
            ];
            if (showUnitValue) {
                headers.push(t('domus', 'Unit value'));
            }
            headers.push(t('domus', 'Valid from'), t('domus', 'Valid to'));
            if (!hideConfig) {
                headers.push(t('domus', 'Base'));
            }

            const rows = filtered.map(item => {
                const unitValue = item.unitValue || null;
                const cells = [
                    Domus.Utils.escapeHtml(item.name || ''),
                    Domus.Utils.escapeHtml(getTypeLabel(item.type))
                ];
                if (showUnitValue) {
                    const valueContent = unitValue && unitValue.value !== undefined && unitValue.value !== null
                        ? Domus.Utils.formatAmount(unitValue.value)
                        : '—';
                    cells.push({ content: Domus.Utils.escapeHtml(valueContent), alignRight: true });
                }
                cells.push(
                    Domus.Utils.escapeHtml(formatDate(item.validFrom)),
                    Domus.Utils.escapeHtml(formatDate(item.validTo))
                );
                if (!hideConfig) {
                    const baseValue = parseBaseConfig(item.configJson);
                    const baseContent = baseValue === '' || baseValue === null || baseValue === undefined ? '—' : baseValue;
                    cells.push(Domus.Utils.escapeHtml(baseContent));
                }
                return { cells, className: 'domus-distribution-row', dataset: { distid: item.id, disttype: item.type } };
            });

            return Domus.UI.buildTable(headers, rows);
        }

        function filterList(distributions, options = {}) {
            const baseExcludes = (options.excludeTypes || []).map(t => String(t).toLowerCase());
            const excludeDefaults = options.excludeSystemDefaults !== false
                ? systemDefaultTypes.map(t => String(t).toLowerCase())
                : [];
            const excludeTypes = baseExcludes.concat(excludeDefaults);
            return (distributions || []).filter(item => !excludeTypes.includes(String(item.type).toLowerCase()));
        }

        function formatDate(value) {
            if (!value) {
                return '—';
            }
            return Domus.Utils.formatDate(value);
        }

        function buildTypeSelect(defaultValue = '', { excludeSystemDefaults = false } = {}) {
            const options = excludeSystemDefaults ? typeOptions.filter(opt => !opt.systemDefault) : typeOptions;
            return '<select name="type" required>' + options.map(opt => {
                const selected = String(opt.value) === String(defaultValue) ? ' selected' : '';
                return '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + selected + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>';
            }).join('') + '</select>';
        }

        function openCreateKeyModal(propertyId, onCreated) {
            if (!canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }
            const today = (new Date()).toISOString().slice(0, 10);
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Name'),
                    required: true,
                    content: '<input type="text" name="name" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Type'),
                    required: true,
                    content: buildTypeSelect('', { excludeSystemDefaults: true })
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Valid from'),
                    required: true,
                    content: '<input type="date" name="validFrom" value="' + Domus.Utils.escapeHtml(today) + '" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Valid to'),
                    content: '<input type="date" name="validTo">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Base'),
                    helpText: t('domus', 'Base value used to calculate shares.'),
                    content: '<input type="number" name="baseValue" step="0.01" min="0.01">',
                    className: 'domus-distribution-base-row'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Configuration'),
                    helpText: t('domus', 'Provide JSON configuration for mixed distributions.'),
                    fullWidth: true,
                    content: '<textarea name="configJson" rows="3"></textarea>',
                    className: 'domus-distribution-config-row'
                })
            ];

            const form = '<form id="domus-distribution-form">' +
                Domus.UI.buildFormTable(rows) +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-distribution-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>' +
                '</form>';

            const modal = Domus.UI.openModal({
                title: t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') }),
                content: form
            });

            modal.modalEl.querySelector('#domus-distribution-cancel')?.addEventListener('click', modal.close);
            const typeSelect = modal.modalEl.querySelector('select[name="type"]');
            if (typeSelect) {
                toggleConfigFields(modal.modalEl, typeSelect.value);
                typeSelect.addEventListener('change', function() {
                    toggleConfigFields(modal.modalEl, this.value);
                });
            }
            modal.modalEl.querySelector('#domus-distribution-form')?.addEventListener('submit', function(e) {
                e.preventDefault();
                const payload = {};
                Array.prototype.forEach.call(this.elements, el => {
                    if (el.name && el.name !== 'baseValue') {
                        payload[el.name] = el.value;
                    }
                });
                payload.configJson = resolveConfigPayload(payload.type, this);
                Domus.Api.createDistribution(propertyId, payload)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Distribution') }), 'success');
                        modal.close();
                        onCreated?.();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function openCreateUnitValueModal(unit, onCreated, defaults = {}) {
            if (!canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }
            if (!unit || !unit.id || !unit.propertyId) {
                Domus.UI.showNotification(t('domus', 'Unit information is incomplete.'), 'error');
                return;
            }

            Domus.Api.getDistributions(unit.propertyId)
                .then(distributions => {
                    if (!distributions || !distributions.length) {
                        Domus.UI.showNotification(t('domus', 'Create a distribution first for this property.'), 'error');
                        return;
                    }
                    const filtered = Domus.Distributions.filterList(distributions, { excludeSystemDefaults: true });
                    if (!filtered.length) {
                        Domus.UI.showNotification(t('domus', 'No applicable distributions available for unit values.'), 'error');
                        return;
                    }
                    const today = (new Date()).toISOString().slice(0, 10);
                    const options = filtered.map(d => '<option value="' + Domus.Utils.escapeHtml(d.id) + '">' +
                        Domus.Utils.escapeHtml(d.name || ('#' + d.id)) + ' (' + Domus.Utils.escapeHtml(getTypeLabel(d.type)) + ')' + '</option>').join('');

                    const rows = [
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Distribution'),
                            required: true,
                            content: '<select name="distributionKeyId" required>' + options + '</select>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Value'),
                            required: true,
                            content: '<input type="number" name="value" step="0.01" min="0" required>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Valid from'),
                            required: true,
                            content: '<input type="date" name="validFrom" value="' + Domus.Utils.escapeHtml(today) + '" required>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Valid to'),
                            content: '<input type="date" name="validTo">'
                        })
                    ];

                    const form = '<form id="domus-unit-distribution-form">' +
                        Domus.UI.buildFormTable(rows) +
                        '<div class="domus-form-actions">' +
                        '<button type="button" id="domus-unit-distribution-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                        '</div>' +
                        '</form>';

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Distribution value') }),
                        content: form
                    });

                    modal.modalEl.querySelector('#domus-unit-distribution-cancel')?.addEventListener('click', modal.close);
                    if (defaults.distributionKeyId) {
                        const select = modal.modalEl.querySelector('select[name="distributionKeyId"]');
                        if (select) {
                            select.value = String(defaults.distributionKeyId);
                        }
                    }
                    modal.modalEl.querySelector('#domus-unit-distribution-form')?.addEventListener('submit', function(e) {
                        e.preventDefault();
                        const payload = {};
                        Array.prototype.forEach.call(this.elements, el => {
                            if (el.name) {
                                payload[el.name] = el.value;
                            }
                        });
                        Domus.Api.createUnitDistribution(unit.id, payload)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Distribution value') }), 'success');
                                modal.close();
                                onCreated?.();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function renderPreviewTable(preview) {
            if (!preview || !preview.shares || !preview.shares.length) {
                return Domus.UI.buildTable([t('domus', 'Unit'), t('domus', 'Weight'), t('domus', 'Amount')], []);
            }
            const rows = preview.shares.map(share => ([
                Domus.Utils.escapeHtml(share.unitLabel || share.unitId || ''),
                Domus.Utils.formatPercentage(share.weight),
                { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(share.amount)), alignRight: true }
            ]));

            return '<div class="domus-preview-meta">' +
                '<div>' + Domus.Utils.escapeHtml(preview.distributionKey?.name || '') + ' • ' + Domus.Utils.escapeHtml(preview.distributionKey?.type || '') + '</div>' +
                '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'Period')) + ': ' + Domus.Utils.escapeHtml((preview.period?.from || '') + (preview.period?.to ? ' – ' + preview.period.to : '')) + '</div>' +
                '</div>' +
                Domus.UI.buildTable([t('domus', 'Unit'), t('domus', 'Weight'), t('domus', 'Amount')], rows);
        }

        function openPreviewModal(property) {
            if (!canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }
            const sourceBookings = (property?.bookings || []).filter(b => b.distributionKeyId);
            if (!sourceBookings.length) {
                Domus.UI.showNotification(t('domus', 'No distributable bookings found for this property.'), 'error');
                return;
            }

            const selectOptions = sourceBookings.map(b => {
                const label = [Domus.Utils.formatDate(b.date), Domus.Utils.formatCurrency(b.amount), b.description].filter(Boolean).join(' • ');
                return '<option value="' + Domus.Utils.escapeHtml(b.id) + '">' + Domus.Utils.escapeHtml(label || ('#' + b.id)) + '</option>';
            }).join('');

            const modal = Domus.UI.openModal({
                title: t('domus', 'Distribution preview'),
                size: 'large',
                content: '<div class="domus-form">' +
                    '<label>' + Domus.Utils.escapeHtml(t('domus', 'Booking')) + '<select id="domus-preview-booking">' + selectOptions + '</select></label>' +
                    '<div id="domus-preview-table" class="domus-preview-table">' + Domus.Utils.escapeHtml(t('domus', 'Loading…')) + '</div>' +
                    '</div>'
            });

            const bookingSelect = modal.modalEl.querySelector('#domus-preview-booking');
            const tableContainer = modal.modalEl.querySelector('#domus-preview-table');

            function loadPreview(bookingId) {
                if (!bookingId) {
                    tableContainer.innerHTML = Domus.Utils.escapeHtml(t('domus', 'Select a booking.'));
                    return;
                }
                tableContainer.innerHTML = Domus.Utils.escapeHtml(t('domus', 'Loading…'));
                Domus.Api.getDistributionPreview(bookingId)
                    .then(preview => {
                        tableContainer.innerHTML = renderPreviewTable(preview);
                    })
                    .catch(err => {
                        tableContainer.innerHTML = Domus.Utils.escapeHtml(err.message || t('domus', 'Unable to load preview.'));
                    });
            }

            bookingSelect?.addEventListener('change', function() {
                loadPreview(this.value);
            });

            if (bookingSelect && bookingSelect.value) {
                loadPreview(bookingSelect.value);
            }
        }

        function openEditKeyModal(propertyId, distribution, onSaved) {
            if (!canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }
            if (!distribution) {
                Domus.UI.showNotification(t('domus', 'Distribution not found.'), 'error');
                return;
            }

            const baseValue = parseBaseConfig(distribution.configJson);
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Name'),
                    required: true,
                    content: '<input type="text" name="name" value="' + Domus.Utils.escapeHtml(distribution.name || '') + '" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Type'),
                    content: '<input type="text" value="' + Domus.Utils.escapeHtml(getTypeLabel(distribution.type)) + '" disabled>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Valid from'),
                    required: true,
                    content: '<input type="date" name="validFrom" value="' + Domus.Utils.escapeHtml(distribution.validFrom || '') + '" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Valid to'),
                    content: '<input type="date" name="validTo" value="' + Domus.Utils.escapeHtml(distribution.validTo || '') + '">' 
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Base'),
                    helpText: t('domus', 'Base value used to calculate shares.'),
                    content: '<input type="number" name="baseValue" step="0.01" min="0.01" value="' + Domus.Utils.escapeHtml(baseValue) + '">',
                    className: 'domus-distribution-base-row'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Configuration'),
                    helpText: t('domus', 'Provide JSON configuration for mixed distributions.'),
                    fullWidth: true,
                    content: '<textarea name="configJson" rows="3">' + Domus.Utils.escapeHtml(distribution.configJson || '') + '</textarea>',
                    className: 'domus-distribution-config-row'
                })
            ];

            const modal = Domus.UI.openModal({
                title: t('domus', 'Edit {entity}', { entity: t('domus', 'Distribution') }),
                content: '<form id="domus-edit-distribution">' + Domus.UI.buildFormTable(rows) +
                    '<div class="domus-form-actions">' +
                    '<button type="button" id="domus-edit-distribution-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                    '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                    '</div></form>'
            });

            modal.modalEl.querySelector('#domus-edit-distribution-cancel')?.addEventListener('click', modal.close);
            toggleConfigFields(modal.modalEl, distribution.type);
            modal.modalEl.querySelector('#domus-edit-distribution')?.addEventListener('submit', function(e) {
                e.preventDefault();
                const payload = {};
                Array.prototype.forEach.call(this.elements, el => {
                    if (el.name && el.name !== 'baseValue') payload[el.name] = el.value;
                });
                payload.configJson = resolveConfigPayload(distribution.type, this);
                Domus.Api.updateDistribution(propertyId, distribution.id, payload)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: t('domus', 'Distribution') }), 'success');
                        modal.close();
                        onSaved?.();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function bindTable(containerId, distributions, options = {}) {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.querySelectorAll('tr.domus-distribution-row').forEach(row => {
                row.addEventListener('click', () => {
                    const distId = row.getAttribute('data-distid');
                    const distribution = distributions.find(d => String(d.id) === String(distId));
                    if (options.mode === 'unit') {
                        options.onUnitEdit?.(distribution);
                    } else {
                        options.onPropertyEdit?.(distribution);
                    }
                });
            });
        }

        return {
            canManageDistributions,
            loadForProperty,
            loadForUnit,
            renderTable,
            openCreateKeyModal,
            openCreateUnitValueModal,
            getTypeLabel,
            openPreviewModal,
            renderPreviewTable,
            openEditKeyModal,
            bindTable,
            filterList
        };
    })();

    Domus.DistributionReports = (function() {
        function openModal(defaults = {}) {
            if (!Domus.Distributions.canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }

            const defaultYear = defaults.year || Domus.state.currentYear;
            let selectedPropertyId = defaults.propertyId ? String(defaults.propertyId) : '';
            let selectedUnitId = defaults.unitId ? String(defaults.unitId) : '';
            let selectedYear = defaultYear;
            let properties = [];
            let units = [];

            const formRows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Property'),
                    required: true,
                    content: '<select id="domus-distribution-report-property"></select>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Unit'),
                    required: true,
                    content: '<select id="domus-distribution-report-unit"></select>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Year'),
                    required: true,
                    content: '<select id="domus-distribution-report-year"></select>'
                })
            ];

            const container = document.createElement('div');
            container.innerHTML = '<div class="domus-form">' + Domus.UI.buildFormTable(formRows) + '</div>' +
                '<div class="domus-table" id="domus-distribution-report-table"></div>';

            const modal = Domus.UI.openModal({
                title: t('domus', 'Distribution Report'),
                content: container,
                size: 'large'
            });

            const modalEl = modal.modalEl;
            const propertySelect = modalEl.querySelector('#domus-distribution-report-property');
            const unitSelect = modalEl.querySelector('#domus-distribution-report-unit');
            const yearSelect = modalEl.querySelector('#domus-distribution-report-year');
            const tableContainer = modalEl.querySelector('#domus-distribution-report-table');

            if (!propertySelect || !unitSelect || !yearSelect || !tableContainer) {
                Domus.UI.showNotification(t('domus', 'Unable to load the distribution report form.'), 'error');
                return;
            }

            yearSelect.innerHTML = buildYearOptions(defaultYear).map(year => '<option value="' + year + '">' + Domus.Utils.escapeHtml(year) + '</option>').join('');
            yearSelect.value = String(selectedYear);

            yearSelect.addEventListener('change', () => {
                selectedYear = parseInt(yearSelect.value, 10);
                loadReport();
            });

            propertySelect.addEventListener('change', () => {
                selectedPropertyId = propertySelect.value;
                loadUnits(selectedPropertyId);
            });

            unitSelect.addEventListener('change', () => {
                selectedUnitId = unitSelect.value;
                loadReport();
            });

            function buildYearOptions(initialYear) {
                const current = (new Date()).getFullYear();
                const years = [];
                for (let i = 0; i < 6; i++) {
                    years.push(current - i);
                }
                if (!years.includes(initialYear)) {
                    years.push(initialYear);
                }
                return years.sort((a, b) => b - a);
            }

            function renderOptions(list, selectedId) {
                return (list || []).map(item => {
                    const selected = String(item.value) === String(selectedId) ? ' selected' : '';
                    return '<option value="' + Domus.Utils.escapeHtml(item.value) + '"' + selected + '>' +
                        Domus.Utils.escapeHtml(item.label) + '</option>';
                }).join('');
            }

            function updatePropertyOptions() {
                const options = properties.map(item => ({
                    value: item.id,
                    label: item.name || `${t('domus', 'Property')} #${item.id}`
                }));
                if (!selectedPropertyId && options[0]) {
                    selectedPropertyId = String(options[0].value);
                }
                propertySelect.innerHTML = renderOptions(options, selectedPropertyId);
            }

            function updateUnitOptions() {
                const options = units.map(item => ({
                    value: item.id,
                    label: item.label || `${t('domus', 'Unit')} #${item.id}`
                }));
                if (!selectedUnitId && options[0]) {
                    selectedUnitId = String(options[0].value);
                }
                if (selectedUnitId && !options.some(opt => String(opt.value) === String(selectedUnitId))) {
                    selectedUnitId = options[0] ? String(options[0].value) : '';
                }
                unitSelect.innerHTML = renderOptions(options, selectedUnitId);
            }

            function formatShare(value, base) {
                if (value === undefined || value === null || base === undefined || base === null || base === '') {
                    return '';
                }
                const valueText = Domus.Utils.formatAmount(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                const baseText = Domus.Utils.formatAmount(base, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                return `${valueText} / ${baseText}`;
            }

            function renderReport(rows) {
                if (!rows || !rows.length) {
                    tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'No bookings found for the selected year.')) + '</div>';
                    return;
                }
                let totalSum = 0;
                let amountSum = 0;
                const renderedRows = rows.map(row => {
                    const accountLabel = row.accountLabel || '';
                    const accountValue = accountLabel || (row.account !== undefined && row.account !== null ? row.account.toString() : '');
                    const distributionLabel = row.distributionKeyName || Domus.Distributions.getTypeLabel(row.distributionKeyType) || '';
                    totalSum += Number(row.total) || 0;
                    amountSum += Number(row.amount) || 0;
                    return [
                        Domus.Utils.escapeHtml(accountValue),
                        Domus.Utils.escapeHtml(Domus.Utils.formatDate(row.date)),
                        Domus.Utils.escapeHtml(distributionLabel),
                        Domus.Utils.escapeHtml(formatShare(row.shareValue, row.shareBase)),
                        { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(row.total)), alignRight: true },
                        { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(row.amount)), alignRight: true }
                    ];
                });
                renderedRows.push([
                    Domus.Utils.escapeHtml(t('domus', 'Total')),
                    '',
                    '',
                    '',
                    { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(totalSum)), alignRight: true },
                    { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(amountSum)), alignRight: true }
                ]);
                tableContainer.innerHTML = Domus.UI.buildTable([
                    t('domus', 'Account'),
                    t('domus', 'Date'),
                    t('domus', 'Distribution'),
                    t('domus', 'Share'),
                    t('domus', 'Total'),
                    t('domus', 'Amount')
                ], renderedRows);
            }

            function loadReport() {
                if (!selectedPropertyId || !selectedUnitId) {
                    tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'Select a property and unit.')) + '</div>';
                    return;
                }
                tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'Loading…')) + '</div>';
                Domus.Api.getDistributionReport(selectedPropertyId, selectedUnitId, selectedYear)
                    .then(rows => {
                        renderReport(rows || []);
                    })
                    .catch(err => {
                        tableContainer.innerHTML = '<div class="domus-error">' + Domus.Utils.escapeHtml(err.message || t('domus', 'An error occurred')) + '</div>';
                    });
            }

            function loadUnits(propertyId) {
                if (!propertyId) {
                    units = [];
                    updateUnitOptions();
                    loadReport();
                    return;
                }
                Domus.Api.getUnits(propertyId)
                    .then(list => {
                        units = list || [];
                        updateUnitOptions();
                        loadReport();
                    })
                    .catch(err => {
                        tableContainer.innerHTML = '<div class="domus-error">' + Domus.Utils.escapeHtml(err.message || t('domus', 'An error occurred')) + '</div>';
                    });
            }

            Domus.Api.getProperties()
                .then(list => {
                    properties = list || [];
                    updatePropertyOptions();
                    loadUnits(selectedPropertyId);
                })
                .catch(err => {
                    tableContainer.innerHTML = '<div class="domus-error">' + Domus.Utils.escapeHtml(err.message || t('domus', 'An error occurred')) + '</div>';
                });
        }

        return { openModal };
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

            const activeView = getActiveView();

            container.innerHTML = '';
            container.appendChild(buildNavList(getMenuItems(), activeView));

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

            const bottomItems = getBottomItems();
            if (bottomItems.length) {
                const bottomList = buildNavList(bottomItems, activeView);
                bottomList.classList.add('domus-nav-bottom');
                container.appendChild(bottomList);
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
     * Dashboard view
     */
    Domus.Dashboard = (function() {
        function render() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Dashboard') }));

            const summaryPromise = Domus.Api.getDashboardSummary();
            const unitsPromise = Domus.Role.isTenantView() || Domus.Role.isBuildingMgmtView()
                ? Promise.resolve(null)
                : Domus.Api.getUnitsStatisticsOverview();

            Promise.all([summaryPromise, unitsPromise])
                .then(([data, unitsOverview]) => {
                    const html = buildHeader() + buildContent(data || {}, unitsOverview);
                    Domus.UI.renderContent(html);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function buildHeader() {
            const filter = Domus.UI.buildYearFilter(() => Domus.Router.navigate('dashboard'));
            return '<div class="domus-toolbar">' + filter + '</div>';
        }

        function buildContent(data, unitsOverview) {
            if (Domus.Role.isTenantView()) {
                return buildTenantDashboard(data);
            }
            if (Domus.Role.isBuildingMgmtView()) {
                return buildBuildingMgmtDashboard(data);
            }
            return buildLandlordDashboard(data, unitsOverview);
        }

        function buildLandlordDashboard(data, unitsOverview) {
            const tenancyLabels = Domus.Role.getTenancyLabels();
            const cards = [
                { label: t('domus', 'Units'), value: data.unitCount || 0 },
                { label: tenancyLabels.plural, value: data.tenancyCount || 0 },
                { label: t('domus', 'Monthly income'), value: data.monthlyBaseRentSum || 0, formatter: Domus.Utils.formatCurrency }
            ];

            const cardHtml = cards.map(card => {
                const renderedValue = card.formatter ? card.formatter(card.value) : card.value;
                const safeValue = renderedValue === undefined || renderedValue === null ? '' : renderedValue.toString();
                return '<div class="domus-card"><div class="domus-card-title">' +
                    Domus.Utils.escapeHtml(card.label) + '</div><div class="domus-card-value">' +
                    Domus.Utils.escapeHtml(safeValue) + '</div></div>';
            }).join('');

            const table = unitsOverview
                ? Domus.Units.renderStatisticsTable(unitsOverview, {
                    buildRowDataset: (row) => row.unitId ? { navigate: 'unitDetail', args: row.unitId } : null,
                    totals: [
                        { key: 'gwb', label: t('domus', 'Total {label}', { label: t('domus', 'Gross profit') }) }
                    ]
                })
                : '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'No {entity} available.', { entity: t('domus', 'Units') })) + '</div>';

            setTimeout(Domus.UI.bindRowNavigation, 0);

            return '<div class="domus-cards">' + cardHtml + '</div>' +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Units overview')) + '</h2>' + table;
        }

        function buildBuildingMgmtDashboard(data) {
            const cards = [
                { label: t('domus', 'Properties'), value: data.propertyCount || 0 },
                { label: t('domus', 'Units'), value: data.unitCount || 0 },
                { label: t('domus', 'Managed owners'), value: data.tenancyCount || 0 },
                { label: t('domus', 'Bookings this year'), value: data.bookingCount || 0 }
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
     * Analytics view
     */
    Domus.Analytics = (function() {
        let chartInstance = null;
        let requestId = 0;
        let properties = [];
        let units = [];

        function render() {
            Domus.UI.renderSidebar('');
            Domus.UI.renderContent(buildLayout());
            bindControls();
            loadFilters();
        }

        function buildLayout() {
            const options = Domus.Accounts.toOptions(false);
            const optionHtml = options.map(opt => (
                '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' +
                Domus.Utils.escapeHtml(opt.label || opt.value) +
                '</option>'
            )).join('');
            const emptyState = options.length === 0
                ? '<div class="domus-analytics-empty">' + Domus.Utils.escapeHtml(t('domus', 'No {entity} available.', { entity: t('domus', 'Accounts') })) + '</div>'
                : '';
            const propertyFilter = Domus.Role.isBuildingMgmtView()
                ? '<label class="domus-analytics-filter domus-analytics-property-filter">' +
                    '<span>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + '</span>' +
                    '<select id="domus-analytics-property">' +
                    '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All properties')) + '</option>' +
                    '</select>' +
                    '</label>'
                : '';

            return '<div class="domus-section-header"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Analytics')) + '</h3></div>' +
                '<div class="domus-analytics-layout">' +
                '<div class="domus-analytics-panel">' +
                '<div class="domus-analytics-filters">' +
                propertyFilter +
                '<label class="domus-analytics-filter">' +
                '<span>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + '</span>' +
                '<select id="domus-analytics-unit">' +
                '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All units')) + '</option>' +
                '</select>' +
                '</label>' +
                '</div>' +
                '<label for="domus-analytics-accounts">' + Domus.Utils.escapeHtml(t('domus', 'Accounts')) + '</label>' +
                '<select id="domus-analytics-accounts" class="domus-analytics-select" multiple size="10">' +
                optionHtml +
                '</select>' +
                '<div class="domus-analytics-hint">' + Domus.Utils.escapeHtml(t('domus', 'Hold Ctrl (Windows) or Command (Mac) to select multiple accounts.')) + '</div>' +
                emptyState +
                '</div>' +
                '<div class="domus-analytics-chart">' +
                '<div id="domus-analytics-status" class="domus-analytics-status">' +
                Domus.Utils.escapeHtml(t('domus', 'Select accounts to view the yearly trend.')) +
                '</div>' +
                '<canvas id="domus-analytics-chart" class="domus-analytics-canvas" aria-label="' + Domus.Utils.escapeHtml(t('domus', 'Account analytics chart')) + '" role="img"></canvas>' +
                '</div>' +
                '</div>';
        }

        function bindControls() {
            const select = document.getElementById('domus-analytics-accounts');
            const unitSelect = document.getElementById('domus-analytics-unit');
            if (!select) {
                return;
            }

            select.addEventListener('change', () => {
                updateChart(getSelectedAccounts(select), getSelectedFilters());
            });

            const propertySelect = document.getElementById('domus-analytics-property');
            propertySelect?.addEventListener('change', () => {
                updateChart(getSelectedAccounts(select), getSelectedFilters());
            });

            unitSelect?.addEventListener('change', () => {
                updateChart(getSelectedAccounts(select), getSelectedFilters());
            });

            updateChart(getSelectedAccounts(select), getSelectedFilters());
        }

        function getSelectedAccounts(select) {
            return Array.from(select.selectedOptions || [])
                .map(option => {
                    const value = option.value;
                    const normalized = normalizeAccountNumber(value);
                    return {
                        value,
                        normalized,
                        label: option.textContent || value || normalized
                    };
                })
                .filter(entry => entry.normalized !== '');
        }

        function updateChart(accounts, filters = {}) {
            const status = document.getElementById('domus-analytics-status');
            if (!window.Chart) {
                if (status) {
                    status.textContent = t('domus', 'Chart library not available.');
                }
                return;
            }

            if (!accounts.length) {
                destroyChart();
                if (status) {
                    status.textContent = t('domus', 'Select accounts to view the yearly trend.');
                }
                return;
            }

            if (status) {
                status.textContent = t('domus', 'Loading…');
            }

            const currentRequest = ++requestId;
            const uniqueAccounts = [];
            const accountLabels = {};
            accounts.forEach(entry => {
                if (!entry || !entry.normalized) {
                    return;
                }
                if (!uniqueAccounts.includes(entry.normalized)) {
                    uniqueAccounts.push(entry.normalized);
                }
                accountLabels[entry.normalized] = entry.label || entry.value || entry.normalized;
            });

            Domus.Api.getAccountTotals(uniqueAccounts, filters)
                .then(data => {
                    if (currentRequest !== requestId) {
                        return;
                    }
                    renderChart(data || {}, uniqueAccounts, accountLabels);
                })
                .catch(err => {
                    destroyChart();
                    if (status) {
                        status.textContent = err.message || t('domus', 'An error occurred');
                    }
                });
        }

        function renderChart(data, accounts, accountLabels = {}) {
            const status = document.getElementById('domus-analytics-status');
            const canvas = document.getElementById('domus-analytics-chart');
            if (!canvas) {
                return;
            }

            const years = Array.isArray(data.years) ? data.years : [];
            const series = data.series || {};
            if (!years.length) {
                destroyChart();
                if (status) {
                    status.textContent = t('domus', 'No analytics data found.');
                }
                return;
            }

            if (status) {
                status.textContent = '';
            }

            const colors = [
                '#2b7cd3',
                '#6c4bc1',
                '#e8793b',
                '#2f9e77',
                '#b84592',
                '#d1a215',
                '#24689e',
                '#b05d24'
            ];

            const datasets = accounts.map((account, index) => {
                const values = Array.isArray(series[account]) ? series[account] : new Array(years.length).fill(0);
                const labelParts = [account, accountLabels[account] || Domus.Accounts.label(account)].filter(Boolean);
                return {
                    label: labelParts.join(' — '),
                    data: values,
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    fill: false,
                    tension: 0.25
                };
            });

            const chartData = {
                labels: years.map(year => year.toString()),
                datasets
            };

            destroyChart();
            chartInstance = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 300
                    },
                    interaction: {
                        mode: 'nearest',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        function destroyChart() {
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
        }

        function normalizeAccountNumber(value) {
            const raw = (value || '').toString().trim();
            if (raw === '') {
                return '';
            }
            const normalized = raw.replace(/^0+/, '');
            return normalized === '' ? '0' : normalized;
        }

        function loadFilters() {
            const propertySelect = document.getElementById('domus-analytics-property');
            const unitSelect = document.getElementById('domus-analytics-unit');
            if (!unitSelect) {
                return;
            }
            if (propertySelect && Domus.Role.isBuildingMgmtView()) {
                Domus.Api.getProperties()
                    .then(list => {
                        properties = list || [];
                        propertySelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All properties')) + '</option>' +
                            properties.map(item => (
                                '<option value="' + Domus.Utils.escapeHtml(String(item.id)) + '">' +
                                Domus.Utils.escapeHtml(item.name || '') +
                                '</option>'
                            )).join('');
                    })
                    .catch(() => {
                        propertySelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All properties')) + '</option>';
                    });
            } else if (propertySelect) {
                propertySelect.closest('.domus-analytics-property-filter')?.classList.add('domus-hidden');
            }
            updateUnits();
        }

        function updateUnits() {
            const unitSelect = document.getElementById('domus-analytics-unit');
            if (!unitSelect) {
                return;
            }
            unitSelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All units')) + '</option>';
            unitSelect.disabled = false;
            Domus.Api.getUnits()
                .then(list => {
                    units = list || [];
                    unitSelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All units')) + '</option>' +
                        units.map(item => (
                            '<option value="' + Domus.Utils.escapeHtml(String(item.id)) + '">' +
                            Domus.Utils.escapeHtml(item.label || item.name || '') +
                            '</option>'
                        )).join('');
                })
                .catch(() => {
                    units = [];
                    unitSelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All units')) + '</option>';
                });
        }

        function getSelectedFilters() {
            const propertySelect = document.getElementById('domus-analytics-property');
            const unitSelect = document.getElementById('domus-analytics-unit');
            const filters = {};
            if (propertySelect && Domus.Role.isBuildingMgmtView() && propertySelect.value) {
                filters.propertyId = propertySelect.value;
            }
            if (unitSelect && unitSelect.value) {
                filters.unitId = unitSelect.value;
            }
            return filters;
        }

        return { render };
    })();

    /**
     * Properties view
     */
    Domus.Properties = (function() {
        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Properties') }));
            Domus.Api.getProperties()
                .then(properties => {
                    const header = '<div class="domus-toolbar">' +
                        '<button id="domus-property-create-btn" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Property') })) + '</button>' +
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
                title: t('domus', 'Add {entity}', { entity: t('domus', 'Property') }),
                content: buildPropertyForm()
            });
            bindPropertyForm(modal, data => Domus.Api.createProperty(data)
                .then(() => {
                    Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Property') }), 'success');
                    modal.close();
                    renderList();
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error')));
        }

        function renderDetail(id) {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Property') }));
            Domus.Api.getProperty(id)
                .then(property => Promise.all([Promise.resolve(property), Domus.Distributions.loadForProperty(id).catch(() => [])]))
                .then(([property, distributions]) => {

                    const visibleDistributions = Domus.Distributions.filterList(distributions, { excludeSystemDefaults: false });
                    const cityLine = [property.zip, property.city].filter(Boolean).join(' ');
                    const addressParts = [property.street, cityLine, property.country].filter(Boolean);
                    const address = addressParts.length ? addressParts.join(', ') : (property.address || '');
                    const showBookingFeatures = Domus.Role.hasCapability('manageBookings');
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const canManageDistributions = Domus.Distributions.canManageDistributions();
                    const standardActions = [
                        Domus.UI.buildIconButton('domus-icon-details', t('domus', 'Details'), { id: 'domus-property-details' }),
                        Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), { id: 'domus-property-delete' })
                    ];
                    const contextActions = [
                        '<button id="domus-add-unit">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Unit') })) + '</button>',
                        showBookingFeatures ? '<button id="domus-add-booking">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Booking') })) + '</button>' : '',
                        canManageDistributions ? '<button id="domus-add-distribution">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') })) + '</button>' : '',
                        canManageDistributions ? '<button id="domus-preview-distribution">' + Domus.Utils.escapeHtml(t('domus', 'Preview distribution')) + '</button>' : ''
                    ].filter(Boolean);
                    const stats = Domus.UI.buildStatCards([
                        { label: t('domus', 'Units'), value: (property.units || []).length, hint: t('domus', 'Total units in this property'), formatValue: false },
                        { label: t('domus', 'Bookings'), value: (property.bookings || []).length, hint: t('domus', 'Entries for the selected year'), formatValue: false },
                        { label: t('domus', 'Year'), value: Domus.state.currentYear, hint: t('domus', 'Reporting context'), formatValue: false }
                    ]);

                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-content">' +
                        '<div class="domus-hero-indicator"><span class="domus-icon domus-icon-property" aria-hidden="true"></span></div>' +
                        '<div class="domus-hero-main">' +
                        (property.description ? '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(property.description) + '</div>' : '') +
                        '<h2>' + Domus.Utils.escapeHtml(property.name || '') + '</h2>' +
                        '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(address) + '</p>' +
                        (property.type ? '<div class="domus-hero-tags"><span class="domus-badge">' + Domus.Utils.escapeHtml(property.type) + '</span></div>' : '') +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        (standardActions.length ? '<div class="domus-hero-actions-row domus-hero-actions-standard">' + standardActions.join('') + '</div>' : '') +
                        (contextActions.length ? '<div class="domus-hero-actions-row">' + contextActions.join('') + '</div>' : '') +
                        '</div>' +
                        '</div>';

                    const unitsHeader = Domus.UI.buildSectionHeader(t('domus', 'Units'));
                    const distributionsHeader = Domus.UI.buildSectionHeader(t('domus', 'Distribution'));
                    const bookingsHeader = showBookingFeatures ? Domus.UI.buildSectionHeader(t('domus', 'Bookings')) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-property-link-doc',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        label: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
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
                        (canManageDistributions ? '<div class="domus-panel">' + distributionsHeader + '<div class="domus-panel-body" id="domus-property-distributions">' +
                        Domus.Distributions.renderTable(visibleDistributions, { excludeSystemDefaults: false }) + '</div></div>' : '') +
                        '<div class="domus-panel">' + unitsHeader + '<div class="domus-panel-body">' +
                        Domus.Units.renderListInline(property.units || []) + '</div></div>' +
                        (showBookingFeatures ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(property.bookings || [], { refreshView: 'propertyDetail', refreshId: id }) + '</div></div>' : '') +
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
                    Domus.Distributions.bindTable('domus-property-distributions', visibleDistributions, {
                        mode: 'property',
                        propertyId: id,
                        onPropertyEdit: (distribution) => Domus.Distributions.openEditKeyModal(id, distribution, () => renderDetail(id))
                    });
                    bindDetailActions(id, property);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, property) {
            const detailsBtn = document.getElementById('domus-property-details');
            const deleteBtn = document.getElementById('domus-property-delete');
            detailsBtn?.addEventListener('click', () => openPropertyModal(id, 'view'));
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    if (confirm(t('domus', 'Delete {entity}?', { entity: t('domus', 'Property') }))) {
                        Domus.Api.deleteProperty(id)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: t('domus', 'Property') }), 'success');
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
            document.getElementById('domus-property-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('property', id, () => renderDetail(id));
            });
            document.getElementById('domus-add-distribution')?.addEventListener('click', () => {
                Domus.Distributions.openCreateKeyModal(id, () => renderDetail(id));
            });
            document.getElementById('domus-preview-distribution')?.addEventListener('click', () => {
                Domus.Distributions.openPreviewModal(property);
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
                        title: mode === 'view' ? t('domus', 'Property details') : t('domus', 'Edit {entity}', { entity: t('domus', 'Property') }),
                        content: buildPropertyForm(property, { mode }),
                        headerActions
                    });
                    bindPropertyForm(modal, data => Domus.Api.updateProperty(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: t('domus', 'Property') }), 'success');
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
        let rentabilityChartInstance = null;
        let kpiChartInstances = [];

        function formatPartnerNames(partners) {
            return (partners || [])
                .map(p => p.name)
                .filter(Boolean)
                .join(', ');
        }

        function normalizeChartValue(value) {
            if (value === undefined || value === null || value === '') {
                return null;
            }
            const numeric = Number(value);
            return Number.isNaN(numeric) ? null : numeric;
        }

        function getRentabilityChartSeries(statistics) {
            const rows = (statistics?.revenue?.rows || [])
                .map(row => ({
                    year: normalizeChartValue(row?.year),
                    rentability: normalizeChartValue(row?.netRentab),
                    coldRent: normalizeChartValue(row?.rent)
                }))
                .filter(row => row.year);

            if (!rows.length) {
                return null;
            }

            rows.sort((a, b) => a.year - b.year);

            const labels = rows.map(row => String(row.year));
            const rentability = rows.map(row => row.rentability);
            const coldRent = rows.map(row => row.coldRent);
            const hasValues = rentability.some(value => value !== null) || coldRent.some(value => value !== null);

            if (!hasValues) {
                return null;
            }

            return { labels, rentability, coldRent };
        }

        function buildRentabilityChartPanel(statistics) {
            const chartSeries = getRentabilityChartSeries(statistics);
            const header = Domus.UI.buildSectionHeader(t('domus', 'Rentability & cold rent'));
            const body = chartSeries
                ? '<div class="domus-chart-wrapper"><canvas id="domus-unit-rentability-chart" class="domus-chart"></canvas></div>'
                : '<div class="domus-empty">' + Domus.Utils.escapeHtml(t('domus', 'No rentability data available.')) + '</div>';

            return '<div class="domus-panel domus-panel-chart">' +
                header +
                '<div class="domus-panel-body">' + body + '</div>' +
                '</div>';
        }

        function renderRentabilityChart(statistics) {
            if (rentabilityChartInstance) {
                rentabilityChartInstance.destroy();
                rentabilityChartInstance = null;
            }

            const chartSeries = getRentabilityChartSeries(statistics);
            const canvas = document.getElementById('domus-unit-rentability-chart');
            if (!canvas || !chartSeries || !window.Chart) {
                return;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }

            const rootStyles = getComputedStyle(document.documentElement);
            const rentabilityColor = rootStyles.getPropertyValue('--color-primary').trim() || '#2d7fff';
            const coldRentColor = rootStyles.getPropertyValue('--color-warning').trim() || '#f6b02e';

            const formatAxisPercentage = (value) => {
                const numeric = Number(value);
                if (Number.isNaN(numeric)) {
                    return '';
                }
                return `${Domus.Utils.formatNumber(numeric * 100, { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: false })}%`;
            };
            const formatAxisCurrency = (value) => {
                const numeric = Number(value);
                if (Number.isNaN(numeric)) {
                    return '';
                }
                return `€ ${Domus.Utils.formatNumber(numeric, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            };

            const rentabilityValues = chartSeries.rentability.filter(value => value !== null);
            const coldRentValues = chartSeries.coldRent.filter(value => value !== null);
            const rentabilityMin = rentabilityValues.length ? Math.min(...rentabilityValues) : 0;
            const rentabilityMax = rentabilityValues.length ? Math.max(...rentabilityValues) : 0;
            const coldRentMax = coldRentValues.length ? Math.max(...coldRentValues) : 0;

            let yAxisMin = rentabilityMin;
            let yAxisMax = rentabilityMax;
            if (yAxisMin === yAxisMax) {
                yAxisMin -= 0.05;
                yAxisMax += 0.05;
            }

            const zeroFraction = yAxisMax !== yAxisMin ? (0 - yAxisMin) / (yAxisMax - yAxisMin) : 0;
            let y1AxisMin = 0;
            let y1AxisMax = coldRentMax;
            if (zeroFraction > 0 && zeroFraction < 1 && y1AxisMax !== 0) {
                y1AxisMin = (zeroFraction * y1AxisMax) / (zeroFraction - 1);
            }

            rentabilityChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartSeries.labels,
                    datasets: [
                        {
                            label: t('domus', 'Rentability'),
                            data: chartSeries.rentability,
                            type: 'line',
                            yAxisID: 'y',
                            borderColor: rentabilityColor,
                            backgroundColor: rentabilityColor,
                            tension: 0.3,
                            pointRadius: 3,
                            pointHoverRadius: 4,
                            fill: false
                        },
                        {
                            label: t('domus', 'Cold rent'),
                            data: chartSeries.coldRent,
                            yAxisID: 'y1',
                            backgroundColor: coldRentColor,
                            borderColor: coldRentColor,
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            position: 'bottom'
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    if (context.dataset.yAxisID === 'y') {
                                        return `${context.dataset.label}: ${Domus.Utils.formatPercentage(context.parsed.y)}`;
                                    }
                                    return `${context.dataset.label}: ${Domus.Utils.formatCurrency(context.parsed.y)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            }
                        },
                        y: {
                            position: 'left',
                            min: yAxisMin,
                            max: yAxisMax,
                            grid: {
                                display: false
                            },
                            ticks: {
                                callback: formatAxisPercentage
                            }
                        },
                        y1: {
                            position: 'right',
                            min: y1AxisMin,
                            max: y1AxisMax || undefined,
                            grid: {
                                display: false
                            },
                            ticks: {
                                callback: formatAxisCurrency
                            }
                        }
                    }
                }
            });
        }

        function destroyKpiCharts() {
            kpiChartInstances.forEach(instance => instance?.destroy());
            kpiChartInstances = [];
        }

        function renderKpiLineChart(canvasId, labels, values, options = {}) {
            const canvas = document.getElementById(canvasId);
            if (!canvas || !window.Chart) {
                return;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }

            const rootStyles = getComputedStyle(document.documentElement);
            const lineColor = options.color || rootStyles.getPropertyValue('--color-primary').trim() || '#2d7fff';

            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            data: values,
                            borderColor: lineColor,
                            backgroundColor: lineColor,
                            borderWidth: 2,
                            tension: 0.3,
                            fill: false,
                            pointRadius: 0,
                            pointHoverRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    scales: {
                        x: { display: false, grid: { display: false } },
                        y: {
                            display: true,
                            ticks: { display: false },
                            border: { display: false },
                            grid: {
                                drawTicks: false,
                                color: (context) => (context.tick?.value === 0 ? 'rgba(0, 0, 0, 0.2)' : 'transparent')
                            }
                        }
                    }
                }
            });

            kpiChartInstances.push(chart);
        }

        function renderKpiTileCharts(statistics) {
            destroyKpiCharts();
            const series = getRentabilityChartSeries(statistics);
            if (!series) {
                return;
            }
            renderKpiLineChart('domus-kpi-rentability-chart', series.labels, series.rentability);
            renderKpiLineChart('domus-kpi-cold-rent-chart', series.labels, series.coldRent, {
                color: getComputedStyle(document.documentElement).getPropertyValue('--color-warning').trim() || '#f6b02e'
            });
        }

        function buildKpiDetailPanel(title, body) {
            const header = title ? Domus.UI.buildSectionHeader(title) : '';
            return '<div class="domus-panel">' + header + '<div class="domus-panel-body">' + body + '</div></div>';
        }

        function bindKpiDetailArea(detailMap) {
            const detailArea = document.getElementById('domus-unit-kpi-detail');
            const detailContent = document.getElementById('domus-unit-kpi-detail-content');
            if (!detailArea || !detailContent) {
                return;
            }

            document.querySelectorAll('.domus-kpi-more[data-kpi-target]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = btn.getAttribute('data-kpi-target');
                    const content = target ? detailMap[target] : null;
                    if (!content) {
                        return;
                    }
                    detailContent.innerHTML = content;
                    detailArea.removeAttribute('hidden');
                    Domus.UI.bindRowNavigation();
                });
            });
        }

        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Units') }));
            Domus.Api.getUnitsStatisticsOverview()
                .then(statistics => {
                    const header = '<div class="domus-toolbar">' +
                        '<button id="domus-unit-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Unit') })) + '</button>' +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';

                    const table = renderStatisticsTable(statistics, {
                        buildRowDataset: (row) => row.unitId ? { navigate: 'unitDetail', args: row.unitId } : null,
                        totals: [
                            { key: 'gwb', label: t('domus', 'Total {label}', { label: t('domus', 'Gross profit') }) }
                        ]
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
                return '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'No {entity} available.', { entity: t('domus', 'Statistics') })) + '</div>';
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

            const totalsHtml = buildStatisticsTotals(columnMeta, rowsData, options.totals || []);
            return Domus.UI.buildTable(headers, rows) + totalsHtml;
        }

        function buildStatisticsTotals(columnMeta, rowsData, totalsConfig) {
            if (!totalsConfig.length) {
                return '';
            }

            const items = totalsConfig.map(config => {
                const column = columnMeta.find(col => col.key === config.key);
                if (!column) {
                    return null;
                }
                let sum = 0;
                let hasValues = false;
                rowsData.forEach(row => {
                    const value = Number(row[column.key]);
                    if (!Number.isNaN(value)) {
                        sum += value;
                        hasValues = true;
                    }
                });
                if (!hasValues) {
                    return null;
                }
                const formatted = formatStatValue(sum, column.format, column.unit);
                const label = config.label || t('domus', 'Total {label}', { label: column.label || column.key });
                return '<div class="domus-table-summary-item">' +
                    '<span class="domus-table-summary-label">' + Domus.Utils.escapeHtml(label) + '</span>' +
                    '<span class="domus-table-summary-value">' + Domus.Utils.escapeHtml(formatted.content) + '</span>' +
                    '</div>';
            }).filter(Boolean);

            if (!items.length) {
                return '';
            }

            return '<div class="domus-table-summary">' + items.join('') + '</div>';
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
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Unit') }),
                        content: buildUnitForm(propertyOptions, effectiveDefaults, { showPropertySelect, requireProperty, defaultPropertyId })
                    });
                    bindUnitForm(modal, data => Domus.Api.createUnit(data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Unit') }), 'success');
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
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Unit') }));
            Domus.Api.get('/units/' + id)
                .then(unit => Promise.all([
                    Promise.resolve(unit),
                    Domus.Api.getUnitStatistics(id).catch(() => null),
                    Domus.Api.getBookings({ unitId: id }).catch(() => []),
                    Domus.Distributions.loadForUnit(id).catch(() => [])
                ]))
                .then(([unit, statistics, bookings, distributions]) => {

                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const unitDetailConfig = Domus.Role.getUnitDetailConfig();
                    const canManageTenancies = Domus.Role.hasCapability('manageTenancies');
                    const canManageBookings = Domus.Role.hasCapability('manageBookings') && unitDetailConfig.showBookings;
                    const canManageDistributions = Domus.Distributions.canManageDistributions();
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const isLandlord = Domus.Role.getCurrentRole() === 'landlord';
                    const useKpiLayout = isLandlord;
                    const filteredDistributions = Domus.Distributions.filterList(distributions, { excludeSystemDefaults: true });
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
                    const stats = useKpiLayout ? '' : Domus.UI.buildStatCards([
                        {
                            label: t('domus', 'Current Tenancy'),
                            value: Domus.Utils.formatCurrency(currentBaseRent) || '—',
                            hint: t('domus', 'Base rent') || '—',
                            formatValue: false
                        },
                        {
                            label: ' ',
                            value: Domus.Utils.formatPercentage(rentabilityValue) || '—',
                            hint: t('domus', 'Rentability'),
                            formatValue: false
                        },
                        { label: t('domus', 'Living area'), value: unit.livingArea ? `${Domus.Utils.formatAmount(unit.livingArea)} m²` : '—', hint: t('domus', 'Reported size') },
                        { label: t('domus', 'Year'), value: Domus.Utils.formatYear(Domus.state.currentYear), hint: t('domus', 'Reporting context'), formatValue: false }
                    ]);
                    const standardActions = [
                        Domus.UI.buildIconButton('domus-icon-details', t('domus', 'Details'), { id: 'domus-unit-details' }),
                        Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), { id: 'domus-unit-delete' })
                    ];
                    const contextActions = [
                        (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action ? '<button id="domus-add-tenancy" data-unit-id="' + id + '">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : ''),
                        (canManageBookings ? '<button id="domus-add-unit-booking">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Booking') })) + '</button>' : ''),
                        (canManageDistributions ? '<button id="domus-add-unit-distribution">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') })) + '</button>' : ''),
                        (canManageDistributions ? '<button id="domus-unit-distribution-report">' + Domus.Utils.escapeHtml(t('domus', 'Distribution Report')) + '</button>' : ''),
                        '<button id="domus-unit-service-charge">' + Domus.Utils.escapeHtml(t('domus', 'Utility Bill Statement')) + '</button>'
                    ].filter(Boolean);

                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-content">' +
                        '<div class="domus-hero-indicator"><span class="domus-icon domus-icon-unit" aria-hidden="true"></span></div>' +
                        '<div class="domus-hero-main">' +
                        (kicker ? '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(kicker) + '</div>' : '') +
                        '<h2>' + Domus.Utils.escapeHtml(unit.label || '') + '</h2>' +
                        (addressLine ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(addressLine) + '</p>' : '') +
                        (unit.unitType ? '<div class="domus-hero-tags"><span class="domus-badge">' + Domus.Utils.escapeHtml(unit.unitType) + '</span></div>' : '') +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        (standardActions.length ? '<div class="domus-hero-actions-row domus-hero-actions-standard">' + standardActions.join('') + '</div>' : '') +
                        (contextActions.length ? '<div class="domus-hero-actions-row">' + contextActions.join('') + '</div>' : '') +
                        '</div>' +
                        '</div>';

                    const tenanciesHeader = Domus.UI.buildSectionHeader(tenancyLabels.plural);
                    const distributionsHeader = Domus.UI.buildSectionHeader(t('domus', 'Distribution'));
                    const bookingsHeader = canManageBookings ? Domus.UI.buildSectionHeader(t('domus', 'Bookings')) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-unit-link-doc',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        label: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        dataset: { entityType: 'unit', entityId: id }
                    } : null);

                    const statisticsHeader = Domus.UI.buildSectionHeader(t('domus', 'Revenue'));
                    const revenueTable = renderStatisticsTable(statistics ? statistics.revenue : null);
                    const costTable = statistics && statistics.cost
                        ? '<div class="domus-section">' + Domus.UI.buildSectionHeader(t('domus', 'Costs')) + renderStatisticsTable(statistics.cost) + '</div>'
                        : '';
                    const rentabilityChartPanel = useKpiLayout ? '' : (isLandlord ? buildRentabilityChartPanel(statistics) : '');

                    const rentabilityTrend = getRentabilityChartSeries(statistics);
                    const hasRentabilityTrend = !!(rentabilityTrend?.rentability || []).some(value => value !== null);
                    const hasColdRentTrend = !!(rentabilityTrend?.coldRent || []).some(value => value !== null);
                    const rentabilityValueLabel = rentabilityValue === undefined || rentabilityValue === null
                        ? '—'
                        : Domus.Utils.formatPercentage(rentabilityValue);
                    const coldRentValueLabel = currentBaseRent === undefined || currentBaseRent === null
                        ? '—'
                        : Domus.Utils.formatCurrency(currentBaseRent);
                    const currentTenantLabel = currentTenantName || '—';
                    const kpiTiles = useKpiLayout
                        ? '<div class="domus-kpi-tiles">' +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Rentability'),
                            value: rentabilityValueLabel,
                            chartId: 'domus-kpi-rentability-chart',
                            showChart: hasRentabilityTrend,
                            linkLabel: t('domus', 'More'),
                            detailTarget: 'revenue'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Cold rent'),
                            value: coldRentValueLabel,
                            chartId: 'domus-kpi-cold-rent-chart',
                            showChart: hasColdRentTrend,
                            linkLabel: t('domus', 'More'),
                            detailTarget: 'cost'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Current rental'),
                            value: currentTenantLabel,
                            showChart: false,
                            linkLabel: t('domus', 'More'),
                            detailTarget: 'tenancies'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Open issues'),
                            value: t('domus', '0 to dos'),
                            showChart: false,
                            linkLabel: t('domus', 'More')
                        }) +
                        '</div>'
                        : '';

                    const kpiDetailArea = useKpiLayout
                        ? '<div class="domus-kpi-detail" id="domus-unit-kpi-detail" hidden>' +
                        '<div id="domus-unit-kpi-detail-content"></div>' +
                        '</div>'
                        : '';

                    const bookingsPanel = canManageBookings
                        ? '<div class="domus-panel"><div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(bookings || [], { refreshView: 'unitDetail', refreshId: id }) +
                        '</div></div>'
                        : '';

                    const documentsPanel = '<div class="domus-panel"><div class="domus-panel-body">' +
                        Domus.Documents.renderList('unit', id, { showLinkAction: documentActionsEnabled }) +
                        '</div></div>';

                    const recentBookings = canManageBookings
                        ? Domus.UI.buildCollapsible(bookingsPanel, {
                            collapsed: true,
                            showLabel: t('domus', 'Recent bookings'),
                            hideLabel: t('domus', 'Recent bookings'),
                            id: 'domus-unit-recent-bookings'
                        })
                        : '';

                    const recentDocuments = Domus.UI.buildCollapsible(documentsPanel, {
                        collapsed: true,
                        showLabel: t('domus', 'Recent documents'),
                        hideLabel: t('domus', 'Recent documents'),
                        id: 'domus-unit-recent-documents'
                    });

                    const content = useKpiLayout
                        ? '<div class="domus-detail domus-dashboard domus-unit-detail-landlord">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        kpiTiles +
                        kpiDetailArea +
                        recentBookings +
                        recentDocuments +
                        '</div>'
                        : '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid">' +
                        '<div class="domus-dashboard-main">' +
                        rentabilityChartPanel +
                        (canManageDistributions ? '<div class="domus-panel">' + distributionsHeader + '<div class="domus-panel-body" id="domus-unit-distributions">' +
                        Domus.Distributions.renderTable(filteredDistributions, { showUnitValue: true, hideConfig: true, excludeSystemDefaults: true }) + '</div></div>' : '') +
                        '<div class="domus-panel">' + tenanciesHeader + '<div class="domus-panel-body">' +
                        Domus.Tenancies.renderInline(allTenancies) + '</div></div>' +
                        '<div class="domus-panel">' + statisticsHeader + '<div class="domus-panel-body">' +
                        revenueTable + costTable + '</div></div>' +
                        (canManageBookings ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(bookings || [], { refreshView: 'unitDetail', refreshId: id }) + '</div></div>' : '') +
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
                    Domus.UI.bindCollapsibles();
                    if (canManageDistributions && !useKpiLayout) {
                        Domus.Distributions.bindTable('domus-unit-distributions', filteredDistributions, {
                            mode: 'unit',
                            onUnitEdit: (distribution) => Domus.Distributions.openCreateUnitValueModal(unit, () => renderDetail(id), { distributionKeyId: distribution?.id })
                        });
                    }
                    if (useKpiLayout) {
                        renderKpiTileCharts(statistics);
                        const detailMap = {
                            revenue: buildKpiDetailPanel(t('domus', 'Revenue'), revenueTable),
                            cost: buildKpiDetailPanel(t('domus', 'Costs'), renderStatisticsTable(statistics ? statistics.cost : null)),
                            tenancies: buildKpiDetailPanel(tenancyLabels.plural, Domus.Tenancies.renderInline(allTenancies))
                        };
                        bindKpiDetailArea(detailMap);
                    } else {
                        renderRentabilityChart(isLandlord ? statistics : null);
                    }
                    bindDetailActions(id, unit);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, unit) {
            const detailsBtn = document.getElementById('domus-unit-details');
            const deleteBtn = document.getElementById('domus-unit-delete');

            detailsBtn?.addEventListener('click', () => openUnitModal(id, 'view'));
            deleteBtn?.addEventListener('click', () => {
                if (!confirm(t('domus', 'Delete {entity}?', { entity: t('domus', 'Unit') }))) {
                    return;
                }
                Domus.Api.deleteUnit(id)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: t('domus', 'Unit') }), 'success');
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
                    title: t('domus', 'Add {entity}', { entity: t('domus', 'Buying price') }),
                    hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                });
            });
            document.getElementById('domus-unit-service-charge')?.addEventListener('click', () => {
                Domus.UnitSettlements.openModal(id, () => renderDetail(id));
            });
            document.getElementById('domus-unit-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('unit', id, () => renderDetail(id));
            });
            document.getElementById('domus-add-unit-distribution')?.addEventListener('click', () => {
                Domus.Distributions.openCreateUnitValueModal(unit, () => renderDetail(id));
            });
            document.getElementById('domus-unit-distribution-report')?.addEventListener('click', () => {
                Domus.DistributionReports.openModal({
                    propertyId: unit?.propertyId,
                    unitId: id,
                    year: Domus.state.currentYear
                });
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
                        title: mode === 'view' ? t('domus', 'Unit details') : t('domus', 'Edit {entity}', { entity: t('domus', 'Unit') }),
                        content: buildUnitForm(propertyOptions, unit, { showPropertySelect, requireProperty, defaultPropertyId, mode }),
                        headerActions
                    });
                    bindUnitForm(modal, data => Domus.Api.updateUnit(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: t('domus', 'Unit') }), 'success');
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
                    inputField('taxId', t('domus', 'Tax ID'), unit?.taxId || ''),
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

        return { renderList, renderDetail, renderListInline, renderStatisticsTable, openCreateModal };
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
                title: t('domus', 'Utility Bill Statement'),
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
                        Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Report') }), 'success');
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
                    t('domus', 'Utility costs'),
                    t('domus', 'Maintenance fee'),
                    t('domus', 'Property tax'),
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
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Partners') }));
            const allowedType = Domus.Permission.getPartnerListFilter();
            const allowedLabel = allowedType === 'owner' ? t('domus', 'Owner') : t('domus', 'Tenant');
            Domus.Api.getPartners(allowedType)
                .then(partners => {
                    const toolbar = '<div class="domus-toolbar">' +
                        '<button id="domus-partner-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Partner') })) + '</button>' +
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
                title: t('domus', 'Add {entity}', { entity: t('domus', 'Partner') }),
                content: buildPartnerForm()
            });
            bindPartnerForm(modal, data => Domus.Api.createPartner(data)
                .then(() => {
                    Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Partner') }), 'success');
                    modal.close();
                    renderList();
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error')));
        }

        function renderDetail(id) {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Partner') }));
            Domus.Api.get('/partners/' + id)
                .then(partner => {
                    const tenancies = partner.tenancies || [];
                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const canManageTenancies = Domus.Role.hasCapability('manageTenancies');
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const stats = Domus.UI.buildStatCards([
                        { label: tenancyLabels.plural, value: tenancies.length, hint: t('domus', 'Linked contracts'), formatValue: false },
                        { label: t('domus', 'Type'), value: partner.partnerType || '—', hint: t('domus', 'Partner category') }
                    ]);
                    const standardActions = [
                        Domus.UI.buildIconButton('domus-icon-details', t('domus', 'Details'), { id: 'domus-partner-details' }),
                        Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), { id: 'domus-partner-delete' })
                    ];
                    const contextActions = [
                        (canManageTenancies && tenancyLabels.action ? '<button id="domus-add-partner-tenancy" data-partner-id="' + id + '">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : '')
                    ].filter(Boolean);

                    const contactMeta = [partner.phone, partner.email].filter(Boolean).join(' • ');
                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-content">' +
                        '<div class="domus-hero-indicator"><span class="domus-icon domus-icon-partner" aria-hidden="true"></span></div>' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(partner.partnerType || t('domus', 'Partner')) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(partner.name || '') + '</h2>' +
                        (contactMeta ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(contactMeta) + '</p>' : '') +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        (standardActions.length ? '<div class="domus-hero-actions-row domus-hero-actions-standard">' + standardActions.join('') + '</div>' : '') +
                        (contextActions.length ? '<div class="domus-hero-actions-row">' + contextActions.join('') + '</div>' : '') +
                        '</div>' +
                        '</div>';

                    const tenanciesHeader = Domus.UI.buildSectionHeader(tenancyLabels.plural);
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-partner-link-doc',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        label: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
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
                if (!confirm(t('domus', 'Delete {entity}?', { entity: t('domus', 'Partner') }))) {
                    return;
                }
                Domus.Api.deletePartner(id)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: t('domus', 'Partner') }), 'success');
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
                        title: mode === 'view' ? t('domus', 'Partner details') : t('domus', 'Edit {entity}', { entity: t('domus', 'Partner') }),
                        content: buildPartnerForm(partner, { mode }),
                        headerActions
                    });
                    bindPartnerForm(modal, data => Domus.Api.updatePartner(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: t('domus', 'Partner') }), 'success');
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
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: Domus.Role.getTenancyLabels().plural }));
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
            const effectiveTitle = title || t('domus', 'Add {entity}', { entity: tenancyLabels.singular });
            const effectiveSuccessMessage = successMessage || t('domus', '{entity} created.', { entity: Domus.Role.getTenancyLabels().singular });
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
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: Domus.Role.getTenancyLabels().singular }));
            Domus.Api.get('/tenancies/' + id)
                .then(tenancy => {
                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const partnerLabel = formatPartnerNames(tenancy.partners);
                    const stats = Domus.UI.buildStatCards([
                        { label: t('domus', 'Base rent'), value: Domus.Utils.formatCurrency(tenancy.baseRent), hint: t('domus', 'Monthly base rent') },
                        { label: t('domus', 'Service charge'), value: Domus.Utils.formatCurrency(tenancy.serviceCharge), hint: t('domus', 'Service charge') },
                        { label: t('domus', 'Deposit'), value: Domus.Utils.formatCurrency(tenancy.deposit), hint: t('domus', 'Security deposit') }
                    ]);
                    const standardActions = [
                        Domus.UI.buildIconButton('domus-icon-details', t('domus', 'Details'), { id: 'domus-tenancy-details' }),
                        Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), { id: 'domus-tenancy-delete' })
                    ];
                    const contextActions = [
                        '<button id="domus-tenancy-change">' + Domus.Utils.escapeHtml(t('domus', 'Change conditions')) + '</button>'
                    ];

                    const statusTag = tenancy.status ? '<span class="domus-badge">' + Domus.Utils.escapeHtml(tenancy.status) + '</span>' : '';
                    const heroMeta = [Domus.Utils.formatDate(tenancy.startDate), Domus.Utils.formatDate(tenancy.endDate)].filter(Boolean).join(' • ');
                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-content">' +
                        '<div class="domus-hero-indicator"><span class="domus-icon domus-icon-tenancy" aria-hidden="true"></span></div>' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(tenancy.unitLabel || `${tenancyLabels.singular} #${id}`) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(tenancyLabels.singular) + ' #' + Domus.Utils.escapeHtml(id) + '</h2>' +
                        (heroMeta ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(heroMeta) + '</p>' : '') +
                        '<div class="domus-hero-tags">' + statusTag + '</div>' +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        (standardActions.length ? '<div class="domus-hero-actions-row domus-hero-actions-standard">' + standardActions.join('') + '</div>' : '') +
                        (contextActions.length ? '<div class="domus-hero-actions-row">' + contextActions.join('') + '</div>' : '') +
                        '</div>' +
                        '</div>';

                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-tenancy-link-doc',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        label: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        dataset: { entityType: 'tenancy', entityId: id }
                    } : null);
                    const detailsHeader = Domus.UI.buildSectionHeader(t('domus', 'Details'));
                    const partnersHeader = Domus.UI.buildSectionHeader(t('domus', 'Partners'));
                    const conditionsHeader = Domus.UI.buildSectionHeader(t('domus', 'Conditions'));

                    const infoList = Domus.UI.buildInfoList([
                        { label: t('domus', 'Unit'), value: formatUnitLabel(tenancy) },
                        { label: t('domus', 'Partners'), value: partnerLabel || t('domus', 'None') },
                        { label: t('domus', 'Start date'), value: Domus.Utils.formatDate(tenancy.startDate) },
                        { label: t('domus', 'End date'), value: Domus.Utils.formatDate(tenancy.endDate) }
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
                        '</div>' +
                        '<div class="domus-dashboard-side">' +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('tenancy', id, { showLinkAction: documentActionsEnabled }) + '</div></div>' +
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
                if (!confirm(t('domus', 'Delete {entity}?', { entity: Domus.Role.getTenancyLabels().singular }))) {
                    return;
                }
                Domus.Api.deleteTenancy(id)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: Domus.Role.getTenancyLabels().singular }), 'success');
                        Domus.UI.renderSidebar('');
                        renderList();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });

            document.getElementById('domus-tenancy-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('tenancy', id, () => renderDetail(id));
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
                        title: mode === 'view' ? t('domus', 'Tenancy details') : t('domus', 'Edit {entity}', { entity: Domus.Role.getTenancyLabels().singular }),
                        content: buildTenancyForm(unitOptions, partnerOptions, tenancy, { mode, hideFinancialFields: Domus.Permission.hideTenancyFinancialFields() }),
                        headerActions
                    });
                    bindTenancyForm(modal, data => Domus.Api.updateTenancy(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: Domus.Role.getTenancyLabels().singular }), 'success');
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

        function buildDocumentIndicator(booking) {
            if (!booking?.hasDocuments) {
                return '';
            }
            const label = t('domus', 'Document attached');
            return '<span class="domus-doc-indicator" title="' + Domus.Utils.escapeHtml(label) + '">' +
                '<span class="domus-icon domus-icon-document" aria-hidden="true"></span>' +
                '<span class="domus-visually-hidden">' + Domus.Utils.escapeHtml(label) + '</span>' +
                '</span>';
        }

        function buildAccountCell(booking) {
            const accountLabel = Domus.Utils.escapeHtml(formatAccount(booking));
            const indicator = buildDocumentIndicator(booking);
            if (!indicator) {
                return accountLabel;
            }
            return '<span class="domus-inline-label">' + accountLabel + indicator + '</span>';
        }

        const bookingCsvColumns = [
            'account',
            'date',
            'deliveryDate',
            'amount',
            'propertyId',
            'unitId',
            'distributionKeyId',
            'periodFrom',
            'periodTo',
            'description'
        ];

        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Bookings') }));
            Domus.Api.getBookings()
                .then(bookings => {
                    const toolbar = '<div class="domus-toolbar">' +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';

                    const isBuildingMgmt = Domus.Role.isBuildingMgmtView();
                    const bookingsList = filterBookingsForRole(bookings || []);
                    const distributionPromise = isBuildingMgmt ? buildDistributionTitleMap(bookingsList) : Promise.resolve({});

                    distributionPromise.then(distMap => {
                        const headers = [t('domus', 'Invoice date'), t('domus', 'Account')];
                        if (isBuildingMgmt) headers.push(t('domus', 'Distribution'));
                        headers.push(t('domus', 'Amount'));

                        const rows = bookingsList.map(b => {
                            const cells = [
                                Domus.Utils.escapeHtml(Domus.Utils.formatDate(b.date)),
                                buildAccountCell(b)
                            ];
                            if (isBuildingMgmt) {
                                const key = `${b.propertyId || ''}:${b.distributionKeyId || ''}`;
                                cells.push(Domus.Utils.escapeHtml(distMap[key] || '—'));
                            }
                            cells.push({ content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(b.amount)), alignRight: true });
                            return {
                                cells,
                                dataset: { 'booking-id': b.id, 'refresh-view': 'bookings' }
                            };
                        });

                        Domus.UI.renderContent(toolbar + Domus.UI.buildTable(headers, rows) + buildImportPanel());
                        bindList();
                    }).catch(err => Domus.UI.showError(err.message));
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function buildDistributionTitleMap(bookings) {
            const propertyIds = Array.from(new Set((bookings || [])
                .filter(b => b.propertyId && b.distributionKeyId)
                .map(b => b.propertyId)));
            const fetches = propertyIds.map(pid => Domus.Api.getDistributions(pid).then(list => ({ pid, list: list || [] })));
            return Promise.all(fetches).then(results => {
                const map = {};
                results.forEach(({ pid, list }) => {
                    list.forEach(item => {
                        map[`${pid}:${item.id}`] = item.name || (`#${item.id}`);
                    });
                });
                return map;
            });
        }

        function bindList() {
            Domus.UI.bindRowNavigation();
            bindImportActions();
        }

        function filterBookingsForRole(bookings) {
            const currentRole = Domus.Role.getCurrentRole();
            return (bookings || []).filter(booking => {
                const accountNumber = booking?.account !== undefined && booking?.account !== null
                    ? String(booking.account)
                    : '';
                if (!accountNumber) {
                    return true;
                }
                if (currentRole === 'landlord') {
                    return !accountNumber.startsWith('4');
                }
                if (currentRole === 'buildingMgmt') {
                    return !accountNumber.startsWith('2');
                }
                return true;
            });
        }

        function renderInline(bookings, options = {}) {
            const rows = (bookings || []).map(b => ({
                cells: [
                    Domus.Utils.escapeHtml(Domus.Utils.formatDate(b.date)),
                    buildAccountCell(b),
                    { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(b.amount)), alignRight: true }
                ],
                dataset: b.id ? {
                    'booking-id': b.id,
                    'refresh-view': options.refreshView,
                    'refresh-id': options.refreshId
                } : null
            }));
            return Domus.UI.buildTable([
                t('domus', 'Invoice date'), t('domus', 'Account'), t('domus', 'Amount')
            ], rows);
        }

        function buildImportPanel() {
            const columnsLabel = Domus.Utils.escapeHtml(t('domus', 'Columns (in order): {columns}', {
                columns: bookingCsvColumns.join(', ')
            }));
            return '<div class="domus-panel domus-booking-import domus-collapsed">' +
                '<button type="button" class="domus-booking-import-toggle" id="domus-booking-import-toggle" aria-expanded="false">' +
                Domus.Utils.escapeHtml(t('domus', 'Import bookings')) +
                '</button>' +
                '<div class="domus-panel-body domus-booking-import-body">' +
                '<p>' + Domus.Utils.escapeHtml(t('domus', 'Download the CSV template to see the required column order, then paste your rows below.')) + '</p>' +
                '<div class="domus-booking-import-actions">' +
                '<button type="button" class="domus-ghost" id="domus-booking-csv-template">' + Domus.Utils.escapeHtml(t('domus', 'Download CSV template')) + '</button>' +
                '</div>' +
                '<div class="muted domus-booking-import-columns">' + columnsLabel + '</div>' +
                '<label class="domus-booking-import-label">' +
                Domus.Utils.escapeHtml(t('domus', 'Paste CSV data')) +
                '<textarea id="domus-booking-csv-input" placeholder="' + Domus.Utils.escapeHtml(t('domus', 'account,date,deliveryDate,amount,propertyId,unitId,distributionKeyId,periodFrom,periodTo,description')) + '"></textarea>' +
                '</label>' +
                '<div class="domus-booking-import-actions">' +
                '<button type="button" class="primary" id="domus-booking-csv-import">' + Domus.Utils.escapeHtml(t('domus', 'Import bookings')) + '</button>' +
                '</div>' +
                '<div class="domus-booking-import-status muted" id="domus-booking-import-status"></div>' +
                '</div>' +
                '</div>';
        }

        function buildBookingCsvTemplate(masterdata) {
            const lines = [];
            if (masterdata) {
                const properties = masterdata.properties || [];
                const units = masterdata.units || [];
                const distributionKeys = masterdata.distributionKeys || {};
                if (properties.length) {
                    lines.push('# Properties (id - name)');
                    properties.forEach(property => {
                        lines.push(`# ${property.id} - ${property.name || t('domus', 'Property') + ' #' + property.id}`);
                    });
                    lines.push('#');
                }
                if (units.length) {
                    lines.push('# Units (id - label - propertyId)');
                    units.forEach(unit => {
                        lines.push(`# ${unit.id} - ${unit.label || t('domus', 'Unit') + ' #' + unit.id} - ${unit.propertyId || ''}`);
                    });
                    lines.push('#');
                }
                const distributionKeysEntries = Object.entries(distributionKeys);
                if (distributionKeysEntries.length) {
                    lines.push('# Distribution keys (propertyId: id - name)');
                    distributionKeysEntries.forEach(([propertyId, keys]) => {
                        (keys || []).forEach(key => {
                            lines.push(`# ${propertyId}: ${key.id} - ${key.name || t('domus', 'Distribution') + ' #' + key.id}`);
                        });
                    });
                    lines.push('#');
                }
            }
            lines.push(bookingCsvColumns.join(','));
            lines.push('4000,2024-01-15,2024-01-15,120.50,1,10,3,2024-01-01,2024-01-31,Sample booking');
            return lines.join('\n') + '\n';
        }

        function downloadBookingCsvTemplate() {
            const baseTemplate = () => buildBookingCsvTemplate(null);
            updateImportStatus(t('domus', 'Preparing template…'));
            return Promise.all([
                Domus.Api.getProperties(),
                Domus.Api.getUnits()
            ])
                .then(([properties, units]) => {
                    const propertyList = properties || [];
                    const distributionRequests = propertyList.map(property => (
                        Domus.Api.getDistributions(property.id)
                            .then(keys => ({ propertyId: property.id, keys: keys || [] }))
                            .catch(() => ({ propertyId: property.id, keys: [] }))
                    ));
                    return Promise.all(distributionRequests)
                        .then(results => {
                            const distributionKeys = {};
                            results.forEach(resultItem => {
                                distributionKeys[resultItem.propertyId] = resultItem.keys || [];
                            });
                            return buildBookingCsvTemplate({
                                properties: propertyList,
                                units: units || [],
                                distributionKeys
                            });
                        });
                })
                .catch(() => baseTemplate())
                .then(content => {
                    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'domus-bookings-template.csv';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    updateImportStatus(t('domus', 'Template ready.'));
                });
        }

        function parseCsvText(text) {
            const rows = [];
            let row = [];
            let field = '';
            let inQuotes = false;
            const pushField = () => {
                row.push(field);
                field = '';
            };
            const pushRow = () => {
                pushField();
                rows.push(row);
                row = [];
            };

            for (let i = 0; i < text.length; i += 1) {
                const char = text[i];
                if (inQuotes) {
                    if (char === '"') {
                        if (text[i + 1] === '"') {
                            field += '"';
                            i += 1;
                        } else {
                            inQuotes = false;
                        }
                    } else {
                        field += char;
                    }
                } else if (char === '"') {
                    inQuotes = true;
                } else if (char === ',') {
                    pushField();
                } else if (char === '\n') {
                    pushRow();
                } else if (char === '\r') {
                    if (text[i + 1] === '\n') {
                        i += 1;
                    }
                    pushRow();
                } else {
                    field += char;
                }
            }

            if (field.length || row.length) {
                pushRow();
            }

            return rows.filter(values => values.some(value => value.trim() !== ''));
        }

        function parseBookingCsv(text) {
            const rows = parseCsvText(text || '').filter(values => {
                const firstValue = values.find(value => value.trim() !== '');
                return !firstValue || !firstValue.trim().startsWith('#');
            });
            const errors = [];
            if (!rows.length) {
                errors.push(t('domus', 'No CSV rows found.'));
                return { entries: [], errors };
            }

            const expectedHeaders = bookingCsvColumns.map(col => col.toLowerCase());
            const header = rows[0].map(cell => cell.trim().toLowerCase());
            const hasHeader = expectedHeaders.every((col, idx) => header[idx] === col);
            const dataRows = hasHeader ? rows.slice(1) : rows;

            const entries = [];
            dataRows.forEach((row, index) => {
                const rowNumber = hasHeader ? index + 2 : index + 1;
                const values = bookingCsvColumns.map((_, idx) => (row[idx] || '').trim());
                if (values.every(value => value === '')) {
                    return;
                }

                const payload = {};
                const rowErrors = [];
                const [account, date, deliveryDate, amount, propertyId, unitId, distributionKeyId, periodFrom, periodTo, description] = values;

                if (account) payload.account = account;
                if (date) payload.date = date;
                if (deliveryDate) payload.deliveryDate = deliveryDate;
                if (amount !== '') payload.amount = amount;

                const propertyResult = parseOptionalInteger(propertyId, t('domus', 'Property'));
                if (propertyResult.errorMessage) {
                    rowErrors.push(propertyResult.errorMessage);
                } else if (propertyResult.value !== null) {
                    payload.propertyId = propertyResult.value;
                }
                const unitResult = parseOptionalInteger(unitId, t('domus', 'Unit'));
                if (unitResult.errorMessage) {
                    rowErrors.push(unitResult.errorMessage);
                } else if (unitResult.value !== null) {
                    payload.unitId = unitResult.value;
                }
                const distributionResult = parseOptionalInteger(distributionKeyId, t('domus', 'Distribution key'));
                if (distributionResult.errorMessage) {
                    rowErrors.push(distributionResult.errorMessage);
                } else if (distributionResult.value !== null) {
                    payload.distributionKeyId = distributionResult.value;
                }

                if (periodFrom) payload.periodFrom = periodFrom;
                if (periodTo) payload.periodTo = periodTo;
                if (description) payload.description = description;

                if (!payload.account) {
                    rowErrors.push(t('domus', 'Account is required.'));
                }
                if (!payload.date) {
                    rowErrors.push(t('domus', 'Invoice date is required.'));
                }
                if (payload.amount === undefined || payload.amount === '') {
                    rowErrors.push(t('domus', 'Amount is required.'));
                } else if (Number.isNaN(Number(payload.amount))) {
                    rowErrors.push(t('domus', 'Enter a valid amount.'));
                }
                if (payload.propertyId === undefined && payload.unitId === undefined) {
                    rowErrors.push(t('domus', 'At least one relation is required.'));
                }

                if (rowErrors.length) {
                    errors.push(t('domus', 'Row {row}: {message}', { row: rowNumber, message: rowErrors.join(' ') }));
                    return;
                }

                entries.push({ payload, rowNumber });
            });

            return { entries, errors };
        }

        function parseOptionalInteger(value, label) {
            if (!value) {
                return { value: null, errorMessage: '' };
            }
            const parsed = parseInt(value, 10);
            if (Number.isNaN(parsed)) {
                return { value: null, errorMessage: t('domus', '{label} must be a number.', { label }) };
            }
            return { value: parsed, errorMessage: '' };
        }

        function bindImportActions() {
            const downloadBtn = document.getElementById('domus-booking-csv-template');
            const importBtn = document.getElementById('domus-booking-csv-import');
            const toggleBtn = document.getElementById('domus-booking-import-toggle');
            if (downloadBtn) {
                downloadBtn.addEventListener('click', downloadBookingCsvTemplate);
            }
            if (importBtn) {
                importBtn.addEventListener('click', handleCsvImport);
            }
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => {
                    const panel = document.querySelector('.domus-booking-import');
                    if (!panel) {
                        return;
                    }
                    const isCollapsed = panel.classList.toggle('domus-collapsed');
                    toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
                });
            }
        }

        function updateImportStatus(message) {
            const status = document.getElementById('domus-booking-import-status');
            if (status) {
                status.textContent = message;
            }
        }

        function handleCsvImport() {
            const input = document.getElementById('domus-booking-csv-input');
            const raw = input ? input.value.trim() : '';
            if (!raw) {
                Domus.UI.showNotification(t('domus', 'Paste CSV data before importing.'), 'error');
                updateImportStatus(t('domus', 'No CSV data provided.'));
                return;
            }

            const result = parseBookingCsv(raw);
            if (result.errors.length) {
                Domus.UI.showNotification(t('domus', 'Please fix the CSV errors before importing.'), 'error');
                updateImportStatus(result.errors.join(' '));
                return;
            }

            if (!result.entries.length) {
                Domus.UI.showNotification(t('domus', 'No bookings found to import.'), 'error');
                updateImportStatus(t('domus', 'No bookings found in the CSV.'));
                return;
            }

            updateImportStatus(t('domus', 'Importing {count} bookings…', { count: result.entries.length }));
            const requests = result.entries.map(entry => (
                Domus.Api.createBooking(entry.payload)
                    .then(() => ({ ok: true, rowNumber: entry.rowNumber }))
                    .catch(err => ({ ok: false, rowNumber: entry.rowNumber, message: err.message }))
            ));

            Promise.all(requests).then(results => {
                const failures = results.filter(resultItem => !resultItem.ok);
                const successCount = results.length - failures.length;

                if (successCount > 0) {
                    Domus.UI.showNotification(t('domus', 'Imported {count} bookings.', { count: successCount }), 'success');
                    if (input) {
                        input.value = '';
                    }
                }

                if (failures.length) {
                    const failureMessages = failures.map(item => t('domus', 'Row {row}: {message}', {
                        row: item.rowNumber,
                        message: item.message || t('domus', 'Import failed.')
                    }));
                    Domus.UI.showNotification(t('domus', 'Some bookings could not be imported.'), 'error');
                    updateImportStatus(failureMessages.join(' '));
                } else {
                    updateImportStatus(t('domus', 'Import completed.'));
                }

                if (successCount > 0) {
                    renderList();
                }
            });
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
            const title = formConfig.title || t('domus', 'Add {entity}', { entity: t('domus', 'Booking') });
            const successMessage = formConfig.successMessage || t('domus', '{entity} created.', { entity: t('domus', 'Booking') });
            const today = new Date();
            const pad = (value) => String(value).padStart(2, '0');
            const todayValue = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
            if (!defaults.date) {
                defaults = Object.assign({}, defaults, { date: todayValue });
            }

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

        function openEditModal(id, refreshContext = {}) {
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
                        title: t('domus', 'Edit {entity}', { entity: t('domus', 'Booking') }),
                        content: buildBookingForm({ accountOptions, propertyOptions, unitOptions }, booking, { multiEntry: false }),
                        size: 'large'
                    });
                    const docWidget = mountBookingDocumentWidget(modal.modalEl);
                    bindBookingForm(modal, data => Domus.Api.updateBooking(id, Object.assign({}, data.metadata, data.entries[0] || {}))
                        .then(() => attachDocumentsToEntities([id], data.metadata, data.document))
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: t('domus', 'Booking') }), 'success');
                            modal.close();
                            refreshBookingContext(refreshContext);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    {
                        multiEntry: false,
                        accountOptions,
                        initialEntries: [{ account: booking.account, amount: booking.amount }],
                        docWidget
                    });
                    modal.modalEl.querySelector('#domus-booking-delete')?.addEventListener('click', () => {
                        if (!confirm(t('domus', 'Delete {entity}?', { entity: t('domus', 'Booking') }))) {
                            return;
                        }
                        Domus.Api.deleteBooking(id)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: t('domus', 'Booking') }), 'success');
                                modal.close();
                                refreshBookingContext(refreshContext);
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function refreshBookingContext(context) {
            const view = context?.refreshView;
            const entityId = context?.refreshId;
            if (view === 'propertyDetail' && entityId) {
                Domus.Properties.renderDetail(entityId);
                return;
            }
            if (view === 'unitDetail' && entityId) {
                Domus.Units.renderDetail(entityId);
                return;
            }
            if (view === 'bookings') {
                renderList();
                return;
            }
        }

        function bindBookingForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-booking-form');
            const cancel = modalContext.modalEl.querySelector('#domus-booking-cancel');
            const entriesContainer = modalContext.modalEl.querySelector('#domus-booking-entries');
            const multiEntry = options.multiEntry !== false;
            const docWidget = options.docWidget;
            const distributionSelect = modalContext.modalEl.querySelector('#domus-booking-distribution');
            const propertySelect = form?.querySelector('select[name="propertyId"]');
            const invoiceDateInput = form?.querySelector('input[name="date"]');
            const deliveryDateInput = form?.querySelector('input[name="deliveryDate"]');
            const unitField = form?.querySelector('[data-role="unit-field"]');
            const unitSelect = form?.querySelector('select[name="unitId"]');
            const isBuildingMgmt = Domus.Role.isBuildingMgmtView();
            const unitAllocationValue = 'unit-allocation';
            let lastInvoiceDate = invoiceDateInput ? invoiceDateInput.value : '';
            let deliveryTouched = deliveryDateInput
                ? (deliveryDateInput.value !== '' && deliveryDateInput.value !== lastInvoiceDate)
                : false;

            initializeBookingEntries(entriesContainer, options.accountOptions || [], options.initialEntries || [{}], multiEntry);

            function updateDistributionOptions(propertyId) {
                if (!distributionSelect) {
                    return;
                }
                const emptyOption = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'Select distribution')) + '</option>';
                const unitAllocationOption = isBuildingMgmt
                    ? '<option value="' + Domus.Utils.escapeHtml(unitAllocationValue) + '">' + Domus.Utils.escapeHtml(t('domus', 'Unit allocation')) + '</option>'
                    : '';
                if (!propertyId) {
                    distributionSelect.innerHTML = emptyOption + unitAllocationOption;
                    distributionSelect.disabled = true;
                    return;
                }
                distributionSelect.disabled = true;
                Domus.Api.getDistributions(propertyId)
                    .then(list => {
                        const optionsHtml = (list || []).map(d => '<option value="' + Domus.Utils.escapeHtml(d.id) + '">' + Domus.Utils.escapeHtml(d.name || ('#' + d.id)) + ' (' + Domus.Utils.escapeHtml(Domus.Distributions.getTypeLabel(d.type)) + ')</option>');
                        distributionSelect.innerHTML = emptyOption + unitAllocationOption + optionsHtml.join('');
                        const desired = distributionSelect.dataset.selected || '';
                        if (desired) {
                            distributionSelect.value = desired;
                        }
                        if (isBuildingMgmt) {
                            toggleUnitField(distributionSelect.value === unitAllocationValue);
                        }
                        distributionSelect.disabled = false;
                    })
                    .catch(err => {
                        Domus.UI.showNotification(err.message, 'error');
                        distributionSelect.innerHTML = emptyOption;
                        distributionSelect.disabled = false;
                    });
            }

            if (distributionSelect) {
                updateDistributionOptions(propertySelect ? propertySelect.value : null);
            }

            function clearUnitSelection() {
                if (unitSelect) {
                    unitSelect.value = '';
                }
            }

            function toggleUnitField(isVisible) {
                if (!unitField) {
                    return;
                }
                if (isVisible) {
                    unitField.removeAttribute('hidden');
                    unitSelect?.setAttribute('required', '');
                } else {
                    unitField.setAttribute('hidden', '');
                    unitSelect?.removeAttribute('required');
                    clearUnitSelection();
                }
            }

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
            propertySelect?.addEventListener('change', function() {
                updateDistributionOptions(this.value);
            });
            distributionSelect?.addEventListener('change', function() {
                if (isBuildingMgmt) {
                    toggleUnitField(this.value === unitAllocationValue);
                }
            });
            deliveryDateInput?.addEventListener('change', function() {
                deliveryTouched = deliveryDateInput.value !== '' && deliveryDateInput.value !== invoiceDateInput?.value;
            });
            invoiceDateInput?.addEventListener('change', function() {
                if (!deliveryDateInput) {
                    return;
                }
                if (!deliveryTouched || deliveryDateInput.value === '' || deliveryDateInput.value === lastInvoiceDate) {
                    deliveryDateInput.value = this.value;
                    deliveryTouched = false;
                }
                lastInvoiceDate = this.value;
            });
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

                if (isBuildingMgmt && distributionSelect) {
                    const selection = distributionSelect.value;
                    if (selection === unitAllocationValue) {
                        if (!formData.unitId) {
                            Domus.UI.showNotification(t('domus', 'Select unit'), 'error');
                            return;
                        }
                        delete formData.distributionKeyId;
                    } else if (selection) {
                        delete formData.unitId;
                    }
                }

                if (!formData.date) {
                    Domus.UI.showNotification(t('domus', 'Invoice date is required.'), 'error');
                    return;
                }
                if (!formData.deliveryDate) {
                    Domus.UI.showNotification(t('domus', 'Delivery date is required.'), 'error');
                    return;
                }
                if (!formData.propertyId && !formData.unitId) {
                    Domus.UI.showNotification(t('domus', 'Select a related property or unit.'), 'error');
                    return;
                }

                const payload = { metadata: formData, entries, document: docWidget?.getSelection ? docWidget.getSelection() : null };
                onSubmit(payload);
            });

            if (isBuildingMgmt && distributionSelect) {
                const initialDistribution = distributionSelect.dataset.selected || distributionSelect.value || '';
                toggleUnitField(initialDistribution === unitAllocationValue);
            }
        }

        function buildBookingForm(options, booking, formOptions = {}) {
            const { accountOptions, propertyOptions, unitOptions } = options;
            const multiEntry = formOptions.multiEntry !== undefined ? formOptions.multiEntry : !booking;
            const bookingDate = booking?.date ? Domus.Utils.escapeHtml(booking.date) : '';
            const bookingDeliveryDate = booking?.deliveryDate
                ? Domus.Utils.escapeHtml(booking.deliveryDate)
                : bookingDate;
            const propertyLocked = Boolean(booking?.propertyId) || Boolean(formOptions.lockProperty);
            const isBuildingMgmt = Domus.Role.isBuildingMgmtView();
            const unitLocked = Boolean(formOptions.lockUnit) || (!isBuildingMgmt && Boolean(booking?.unitId));
            const selectedProperty = booking?.propertyId ? String(booking.propertyId) : '';
            const selectedUnit = booking?.unitId ? String(booking.unitId) : '';
            const unitAllocationValue = 'unit-allocation';
            const selectedDistributionKey = booking?.distributionKeyId
                ? String(booking.distributionKeyId)
                : (booking?.unitId && isBuildingMgmt ? unitAllocationValue : '');
            const hideProperty = formOptions.hidePropertyField || Domus.Role.getCurrentRole() === 'landlord';
            const showDistribution = Domus.Distributions.canManageDistributions();
            const existingDocuments = booking?.id
                ? '<div class="domus-booking-documents-existing">' +
                '<div class="domus-booking-documents-header">' + Domus.Utils.escapeHtml(t('domus', 'Linked documents')) + '</div>' +
                Domus.Documents.renderList('booking', booking.id, { showLinkAction: false }) +
                '</div>'
                : '';
            return '<div class="domus-form">' +
                '<form id="domus-booking-form">' +
                '<div class="domus-booking-layout">' +
                '<div class="domus-booking-main">' +
                '<div class="domus-booking-dates">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Invoice date')) + ' *<input type="date" name="date" required value="' + bookingDate + '"></label>' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Delivery date')) + ' *<input type="date" name="deliveryDate" required value="' + bookingDeliveryDate + '"></label>' +
                '</div>' +
                '<div class="domus-booking-entries-wrapper">' +
                '<div class="domus-booking-entries-header">' + Domus.Utils.escapeHtml(t('domus', 'Amounts')) + '</div>' +
                '<div id="domus-booking-entries" class="domus-booking-entries" data-multi="' + (multiEntry ? '1' : '0') + '"></div>' +
                '<div class="domus-booking-hint">' + Domus.Utils.escapeHtml(t('domus', 'Add multiple booking lines. A new row appears automatically when you enter an amount.')) + '</div>' +
                '</div>' +
                (hideProperty ? (selectedProperty ? '<input type="hidden" name="propertyId" value="' + Domus.Utils.escapeHtml(selectedProperty) + '">' : '')
                    : ('<label>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + '<select name="propertyId"' + (propertyLocked ? ' disabled' : '') + '>' +
                    propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedProperty ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                    '</select>' + (propertyLocked ? '<input type="hidden" name="propertyId" value="' + Domus.Utils.escapeHtml(selectedProperty) + '">' : '') + '</label>')) +
                (showDistribution ? '<label>' + Domus.Utils.escapeHtml(t('domus', 'Distribution key')) + '<select name="distributionKeyId" id="domus-booking-distribution" data-selected="' + Domus.Utils.escapeHtml(selectedDistributionKey) + '">' +
                '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'Select distribution')) + '</option>' +
                '</select></label>' : '') +
                '<div class="domus-booking-unit-field" data-role="unit-field">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + '<select name="unitId"' + (unitLocked ? ' disabled' : '') + '>' +
                unitOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedUnit ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select></label>' +
                '</div>' +
                '</div>' +
                '<div class="domus-booking-documents" id="domus-booking-documents">' +
                '<div class="domus-doc-attachment-placeholder domus-doc-attachment-shell"></div>' +
                existingDocuments +
                '</div>' +
                '</div>' +
                '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                (booking?.id ? '<button type="button" class="domus-ghost" id="domus-booking-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' : '') +
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
                return { entries: [], error: t('domus', 'No {entity} available.', { entity: t('domus', 'Booking lines') }) };
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

        return { renderList, renderInline, openCreateModal, openEditModal };
    })();

    /**
     * Settings view
     */
    Domus.Settings = (function() {
        function buildForm(settings) {
            const taxRate = settings?.taxRate ?? '';
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Tax rate'),
                    helpText: t('domus', 'The tax rate will be used to calculate the estimated net result'),
                    content: '<input name="taxRate" type="number" step="0.01" value="' + Domus.Utils.escapeHtml(taxRate) + '">'
                })
            ];
            const actions = '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-settings-form">' +
                Domus.UI.buildFormTable(rows) +
                actions +
                '</form>' +
                '</div>';
        }

        function bindForm() {
            const form = document.getElementById('domus-settings-form');
            if (!form) {
                return;
            }
            form.addEventListener('submit', function(event) {
                event.preventDefault();
                const formData = new FormData(form);
                let taxRate = (formData.get('taxRate') || '').toString().trim();
                if (taxRate === '') {
                    taxRate = '0';
                }
                if (taxRate !== '' && Number.isNaN(Number(taxRate))) {
                    Domus.UI.showNotification(t('domus', 'Enter a valid amount.'), 'error');
                    return;
                }
                Domus.Api.updateSettings({ taxRate })
                    .then(response => {
                        const nextValue = response?.settings?.taxRate ?? taxRate;
                        const input = form.querySelector('[name="taxRate"]');
                        if (input) {
                            input.value = nextValue;
                        }
                        Domus.UI.showNotification(t('domus', 'Settings saved.'), 'success');
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function render() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading…'));
            Domus.Api.getSettings()
                .then(response => {
                    const settings = response?.settings || {};
                    const content = '<div class="domus-settings">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Settings')) + '</h2>' +
                        buildForm(settings) +
                        '</div>';
                    Domus.UI.renderContent(content);
                    bindForm();
                })
                .catch(err => Domus.UI.showError(err.message || t('domus', 'An error occurred')));
        }

        return { render };
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
                    const html = '<div id="' + containerId + '">' + t('domus', 'No {entity} found.', { entity: t('domus', 'Documents') }) + (showActions ? buildDocumentActions(entityType, entityId) : '') + '</div>';
                    updateContainer(html);
                });
            return '<div id="' + containerId + '">' + t('domus', 'Loading {entity}…', { entity: t('domus', 'Documents') }) + '</div>';
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
                    }).join('') : '<li>' + Domus.Utils.escapeHtml(t('domus', 'No {entity} found.', { entity: t('domus', 'Linked objects') })) + '</li>';

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

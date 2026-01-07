(function() {
    'use strict';

    window.Domus = window.Domus || {};

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
})();

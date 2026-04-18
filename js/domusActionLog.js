/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.ActionLog = (function() {
        const presetTypes = [
            { value: 'note', label: t('domus', 'Note') },
            { value: 'call', label: t('domus', 'Call log') },
            { value: 'email', label: t('domus', 'Email') },
            { value: 'event', label: t('domus', 'Event') },
            { value: 'document', label: t('domus', 'Document') },
            { value: 'custom', label: t('domus', 'Own action') }
        ];
        const linkedEntityTypes = [
            { value: '', label: t('domus', 'None') },
            { value: 'property', label: t('domus', 'Property') },
            { value: 'unit', label: t('domus', 'Unit') },
            { value: 'partner', label: t('domus', 'Partner') }
        ];

        const typeIconMap = {
            note: 'domus-icon-action-note',
            call: 'domus-icon-action-call',
            email: 'domus-icon-action-email',
            event: 'domus-icon-action-event',
            document: 'domus-icon-action-document',
            yearstatus: 'domus-icon-action-year-status',
            custom: 'domus-icon-action-custom'
        };

        function renderList(entityType, entityId, options = {}) {
            const containerId = options.containerId || `domus-action-log-${entityType}-${entityId}`;
            loadEntityList(entityType, entityId, { ...options, containerId });
            return '<div id="' + Domus.Utils.escapeHtml(containerId) + '">' + Domus.Utils.escapeHtml(t('domus', 'Loading {entity}…', { entity: t('domus', 'Action log') })) + '</div>';
        }

        function loadEntityList(entityType, entityId, options = {}) {
            const containerId = options.containerId || `domus-action-log-${entityType}-${entityId}`;
            const refreshList = () => loadEntityList(entityType, entityId, options);
            const handleSaved = typeof options.onSaved === 'function'
                ? options.onSaved
                : refreshList;
            Domus.Api.getActionLogs(entityType, entityId)
                .then(entries => {
                    updateContainer(containerId, buildListMarkup(entries || [], {
                        containerId,
                        showEntityColumn: false,
                        emptyActionId: options.emptyActionId
                    }));
                    bindEntryRows(containerId, {
                        onSaved: handleSaved
                    });
                    bindCreateButtons([options.emptyActionId], {
                        entityType,
                        entityId,
                        entityLabel: options.entityLabel,
                        onSaved: handleSaved
                    });
                })
                .catch(() => {
                    updateContainer(containerId, buildListMarkup([], {
                        containerId,
                        showEntityColumn: false,
                        emptyActionId: options.emptyActionId
                    }));
                    bindCreateButtons([options.emptyActionId], {
                        entityType,
                        entityId,
                        entityLabel: options.entityLabel,
                        onSaved: handleSaved
                    });
                });
        }

        function updateContainer(containerId, html) {
            const container = document.getElementById(containerId);
            if (container) {
                container.outerHTML = html;
            }
        }

        function buildListMarkup(entries, options = {}) {
            const safeEntries = entries || [];
            if (!safeEntries.length) {
                return '<div id="' + Domus.Utils.escapeHtml(options.containerId || '') + '">' + Domus.UI.buildEmptyStateAction(
                    t('domus', 'No {entity} found.', { entity: t('domus', 'Action log entries') }),
                    {
                        iconClass: 'domus-icon-details',
                        actionId: options.emptyActionId
                    }
                ) + '</div>';
            }

            const headers = [
                { label: t('domus', 'Type'), className: 'domus-action-log-col-icon' },
                t('domus', 'Title'),
                { label: t('domus', 'Date'), className: 'domus-action-log-col-date' }
            ];

            const rows = safeEntries.map(entry => {
                const cells = [
                    { content: buildTypeIcon(entry.type), className: 'domus-action-log-cell-icon' },
                    options.showEntityColumn
                        ? formatDashboardTitleCell(entry)
                        : '<div class="domus-action-log-title-text">' + Domus.Utils.escapeHtml(entry.title || '') + '</div>',
                    { content: '<span class="domus-action-log-date">' + Domus.Utils.escapeHtml(formatDate(entry.createdAt)) + '</span>', className: 'domus-action-log-cell-date' }
                ];

                return {
                    cells,
                    dataset: {
                        actionLogId: entry.id
                    }
                };
            });

            const table = Domus.UI.buildTable(headers, rows, { wrapPanel: false, showHeader: false });
            const id = options.containerId || '';

            return '<div id="' + Domus.Utils.escapeHtml(id) + '" class="domus-action-log-list">' +
                '<div class="domus-action-log-scroll-viewport">' + table + '</div>' +
                '</div>';
        }

        function formatDate(timestamp) {
            if (!timestamp) {
                return '—';
            }
            return Domus.Utils.formatDate(timestamp * 1000);
        }

        function formatDashboardTitleCell(entry) {
            const title = Domus.Utils.escapeHtml(entry?.title || '');
            const entityLabel = Domus.Utils.escapeHtml(entry?.entityLabel || '');
            return '<div class="domus-action-log-title-cell">' +
                '<strong>' + title + '</strong>' +
                (entityLabel ? '<div class="muted">' + entityLabel + '</div>' : '') +
                '</div>';
        }

        function buildTypeIcon(type) {
            const iconClass = getTypeIconClass(type);
            const label = getTypeLabel(type);
            return '<span class="domus-action-log-icon-wrap" aria-label="' + Domus.Utils.escapeHtml(label) + '" title="' + Domus.Utils.escapeHtml(label) + '">' +
                '<span class="domus-icon domus-action-log-icon ' + Domus.Utils.escapeHtml(iconClass) + '" aria-hidden="true"></span>' +
                '<span class="domus-visually-hidden">' + Domus.Utils.escapeHtml(label) + '</span>' +
                '</span>';
        }

        function getTypeIconClass(type) {
            const normalizedType = String(type || '').trim().toLowerCase();
            switch (normalizedType) {
            case 'note':
                return 'domus-icon-action-note';
            case 'call':
                return 'domus-icon-action-call';
            case 'email':
                return 'domus-icon-action-email';
            case 'event':
                return 'domus-icon-action-event';
            case 'document':
                return 'domus-icon-action-document';
            case 'yearstatus':
                return 'domus-icon-action-year-status';
            case 'custom':
                return 'domus-icon-action-custom';
            default:
                return 'domus-icon-action-custom';
            }
        }

        function getTypeLabel(type) {
            const normalizedType = String(type || '').trim();
            const preset = presetTypes.find(item => item.value === normalizedType);
            return preset ? preset.label : (normalizedType || t('domus', 'Note'));
        }

        function bindCreateButtons(buttonIds, options = {}) {
            (buttonIds || []).filter(Boolean).forEach(id => {
                const button = document.getElementById(id);
                if (!button || button.dataset.domusActionLogBound) {
                    return;
                }
                button.dataset.domusActionLogBound = 'true';
                button.addEventListener('click', () => {
                    openCreateModal(options);
                });
            });
        }

        function bindEntryRows(containerId, options = {}) {
            const container = document.getElementById(containerId);
            if (!container) {
                return;
            }

            const onSaved = typeof options.onSaved === 'function' ? options.onSaved : null;
            container.querySelectorAll('table.domus-table tr[data-action-log-id], table.domus-table tr[data-actionLogId]').forEach(row => {
                if (row.dataset.domusActionLogBound) {
                    return;
                }
                row.dataset.domusActionLogBound = 'true';

                const handleActivate = (event) => {
                    const actionLogId = row.dataset.actionLogId || row.getAttribute('data-action-log-id') || row.getAttribute('data-actionLogId');
                    if (!actionLogId) {
                        return;
                    }
                    if (event && event.target && (event.target.closest('a') || event.target.closest('button') || event.target.closest('input') || event.target.closest('select') || event.target.closest('textarea'))) {
                        return;
                    }

                    event?.preventDefault?.();
                    event?.stopImmediatePropagation?.();
                    Domus.ActionLog.openEntryModal(actionLogId, {
                        onSaved
                    });
                };

                row.addEventListener('click', handleActivate, true);
                row.addEventListener('keydown', event => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                    }
                    handleActivate(event);
                }, true);
            });
        }

        function openCreateModal(options = {}) {
            resolveTargetContext(options)
                .then(context => {
                    if (!context.targets.length) {
                        Domus.UI.showNotification(t('domus', 'No properties or units are available yet.'), 'error');
                        return;
                    }

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Add log entry'),
                        content: buildCreateForm(context)
                    });

                    bindCreateModal(modal, context, options.onSaved);
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function openEntryModal(entryId, options = {}, mode = 'view') {
            Domus.Api.getActionLogEntry(entryId)
                .then(entry => {
                    let modal;
                    const headerActions = [];
                    const isEditable = entry?.source === 'manual';

                    if (mode === 'view' && isEditable) {
                        headerActions.push(Domus.UI.buildModalAction(t('domus', 'Edit'), () => {
                            modal?.close();
                            openEntryModal(entryId, options, 'edit');
                        }));
                    }

                    modal = Domus.UI.openModal({
                        title: mode === 'view'
                            ? t('domus', 'Action log entry')
                            : t('domus', 'Edit {entity}', { entity: t('domus', 'Action log entry') }),
                        content: mode === 'view' ? buildViewForm(entry) : buildEditForm(entry),
                        headerActions
                    });
                    if (mode === 'view') {
                        modal.modalEl.querySelector('#domus-action-log-close')?.addEventListener('click', modal.close);
                        return;
                    }

                    bindEditModal(modal, entry, options);
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function resolveTargetContext(options = {}) {
            if (options.entityType && options.entityId) {
                return Promise.resolve({
                    lockTarget: true,
                    selectedTarget: `${options.entityType}:${options.entityId}`,
                    targets: [{
                        value: `${options.entityType}:${options.entityId}`,
                        label: options.entityLabel || t('domus', options.entityType === 'property' ? 'Property' : 'Unit')
                    }]
                });
            }

            return Promise.all([
                Domus.Api.getProperties().catch(() => []),
                Domus.Api.getUnits().catch(() => [])
            ]).then(([properties, units]) => {
                const role = Domus.Role?.getCurrentRole?.() || Domus.state.role;
                const scopedProperties = role === 'buildingMgmt'
                    ? (properties || []).filter(property => property?.usageRole === 'manager')
                    : [];
                const scopedUnits = role === 'buildingMgmt'
                    ? (units || []).filter(unit => unit?.propertyId)
                    : role === 'landlord'
                        ? (units || []).filter(unit => !unit?.propertyId)
                        : [];
                const targets = []
                    .concat(scopedProperties.map(property => ({
                        value: `property:${property.id}`,
                        label: `${t('domus', 'Property')}: ${property.name || `${t('domus', 'Property')} #${property.id}`}`
                    })))
                    .concat(scopedUnits.map(unit => ({
                        value: `unit:${unit.id}`,
                        label: `${t('domus', 'Unit')}: ${unit.label || `${t('domus', 'Unit')} #${unit.id}`}`
                    })));

                return {
                    lockTarget: false,
                    selectedTarget: targets[0]?.value || '',
                    targets
                };
            });
        }

        function buildCreateForm(context) {
            const targetContent = context.lockTarget
                ? '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(context.targets[0]?.label || '') + '</div><input type="hidden" id="domus-action-log-target" value="' + Domus.Utils.escapeHtml(context.selectedTarget) + '">'
                : '<select id="domus-action-log-target" name="target">' +
                    context.targets.map(target => '<option value="' + Domus.Utils.escapeHtml(target.value) + '"' + (target.value === context.selectedTarget ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(target.label) + '</option>').join('') +
                    '</select>';

            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Entity'),
                    required: !context.lockTarget,
                    content: targetContent
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Type'),
                    required: true,
                    content: buildTypePicker('note')
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Own action'),
                    className: 'domus-hidden',
                    content: '<div id="domus-action-log-custom-type-wrap"><input id="domus-action-log-custom-type" name="customType"></div>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Title'),
                    required: true,
                    content: '<input id="domus-action-log-title" name="title" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Note'),
                    content: '<textarea id="domus-action-log-data" name="data"></textarea>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Linked object type'),
                    content: '<select id="domus-action-log-linked-type" name="linkedEntityType"></select>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Linked object'),
                    content: '<select id="domus-action-log-linked-id" name="linkedEntityId" disabled></select>'
                })
            ];

            return '<div class="domus-form">' +
                '<form id="domus-action-log-form">' +
                Domus.UI.buildFormTable(rows) +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-action-log-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary" id="domus-action-log-submit">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        function bindCreateModal(modal, context, onSaved) {
            const form = modal.modalEl.querySelector('#domus-action-log-form');
            const cancelButton = modal.modalEl.querySelector('#domus-action-log-cancel');
            const typeInput = modal.modalEl.querySelector('#domus-action-log-type');
            const customTypeInput = modal.modalEl.querySelector('#domus-action-log-custom-type');
            const customTypeWrap = modal.modalEl.querySelector('#domus-action-log-custom-type-wrap');
            const customTypeRow = customTypeWrap?.closest('.domus-form-row');
            const targetSelect = modal.modalEl.querySelector('#domus-action-log-target');
            const linkedTypeSelect = modal.modalEl.querySelector('#domus-action-log-linked-type');
            const linkedEntitySelect = modal.modalEl.querySelector('#domus-action-log-linked-id');

            const getOwnerType = () => {
                const target = (targetSelect?.value || context.selectedTarget || '').trim();
                return target.split(':')[0] || null;
            };

            function updateTypeState() {
                const isCustom = typeInput?.value === 'custom';
                if (!customTypeInput || !customTypeWrap || !customTypeRow) {
                    return;
                }
                customTypeRow.classList.toggle('domus-hidden', !isCustom);
                customTypeInput.required = isCustom;
                if (!isCustom) {
                    customTypeInput.value = '';
                }
            }

            cancelButton?.addEventListener('click', modal.close);
            bindTypePicker(modal.modalEl, updateTypeState);
            updateTypeState();
            bindLinkedEntityControls({
                linkedTypeSelect,
                linkedEntitySelect,
                ownerType: getOwnerType()
            });
            targetSelect?.addEventListener('change', () => {
                bindLinkedEntityControls({
                    linkedTypeSelect,
                    linkedEntitySelect,
                    ownerType: getOwnerType()
                });
            });

            form?.addEventListener('submit', event => {
                event.preventDefault();
                const target = modal.modalEl.querySelector('#domus-action-log-target')?.value || context.selectedTarget || '';
                const parts = target.split(':');
                const entityType = parts[0] || '';
                const entityId = Number(parts[1] || 0);
                const typeValue = typeInput?.value === 'custom'
                    ? (customTypeInput?.value || '').trim()
                    : (typeInput?.value || '').trim();
                const title = (modal.modalEl.querySelector('#domus-action-log-title')?.value || '').trim();
                const linkedEntityType = (modal.modalEl.querySelector('#domus-action-log-linked-type')?.value || '').trim();
                const linkedEntityIdRaw = (linkedEntitySelect?.value || '').trim();
                const linkedEntityId = linkedEntityIdRaw ? Number(linkedEntityIdRaw) : null;

                if (!entityType || !entityId) {
                    Domus.UI.showNotification(t('domus', 'Entity is required.'), 'error');
                    return;
                }
                if (!typeValue) {
                    Domus.UI.showNotification(t('domus', 'Type is required.'), 'error');
                    return;
                }
                if (!title) {
                    Domus.UI.showNotification(t('domus', 'Title is required.'), 'error');
                    return;
                }
                if (linkedEntityType && !linkedEntityId) {
                    Domus.UI.showNotification(t('domus', 'Linked object is required.'), 'error');
                    return;
                }

                const payload = {
                    type: typeValue,
                    title,
                    data: modal.modalEl.querySelector('#domus-action-log-data')?.value || '',
                    linkedEntityType: linkedEntityType || null,
                    linkedEntityId: linkedEntityType && linkedEntityId ? linkedEntityId : null,
                    linkedLabel: null
                };

                Domus.Api.createActionLog(entityType, entityId, payload)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Action log entry created.'), 'success');
                        modal.close();
                        if (typeof onSaved === 'function') {
                            onSaved();
                        }
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function buildViewForm(entry) {
            const targetLabel = entry?.entityLabel || '';
            const targetHref = entry?.entityType && entry?.entityId && (entry.entityType === 'property' || entry.entityType === 'unit')
                ? `#/${entry.entityType === 'property' ? 'propertyDetail' : 'unitDetail'}/${entry.entityId}`
                : '';
            const linkedEntity = entry?.linkedEntity || null;

            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Entity'),
                    content: buildDisplayValue(targetHref
                        ? '<a class="domus-link" href="' + Domus.Utils.escapeHtml(targetHref) + '">' + Domus.Utils.escapeHtml(targetLabel) + '</a>'
                        : Domus.Utils.escapeHtml(targetLabel || '—'))
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Date'),
                    content: buildDisplayValue(Domus.Utils.escapeHtml(formatDate(entry?.createdAt)))
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Type'),
                    content: buildDisplayValue(buildTypeIcon(entry?.type))
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Title'),
                    content: buildDisplayValue(Domus.Utils.escapeHtml(entry?.title || ''))
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Note'),
                    content: buildDisplayValue(formatMultiline(entry?.data))
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Linked object'),
                    content: buildDisplayValue(buildLinkedEntityValue(linkedEntity))
                })
            ];

            return '<div class="domus-form">' +
                '<form id="domus-action-log-view-form">' +
                Domus.UI.buildFormTable(rows) +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-action-log-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        function buildEditForm(entry) {
            const isCustomType = entry?.type && !presetTypes.some(option => option.value === entry.type);
            const selectedType = isCustomType ? 'custom' : (entry?.type || 'note');
            const targetLabel = entry?.entityLabel || '';
            const targetHref = entry?.entityType && entry?.entityId && (entry.entityType === 'property' || entry.entityType === 'unit')
                ? `#/${entry.entityType === 'property' ? 'propertyDetail' : 'unitDetail'}/${entry.entityId}`
                : '';

            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Entity'),
                    content: buildDisplayValue(targetHref
                        ? '<a class="domus-link" href="' + Domus.Utils.escapeHtml(targetHref) + '">' + Domus.Utils.escapeHtml(targetLabel) + '</a>'
                        : Domus.Utils.escapeHtml(targetLabel || '—'))
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Date'),
                    content: buildDisplayValue(Domus.Utils.escapeHtml(formatDate(entry?.createdAt)))
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Type'),
                    required: true,
                    content: buildTypePicker(selectedType)
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Own action'),
                    className: isCustomType ? '' : 'domus-hidden',
                    content: '<div id="domus-action-log-custom-type-wrap"><input id="domus-action-log-custom-type" name="customType" value="' + Domus.Utils.escapeHtml(isCustomType ? (entry?.type || '') : '') + '"></div>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Title'),
                    required: true,
                    content: '<input id="domus-action-log-title" name="title" required value="' + Domus.Utils.escapeHtml(entry?.title || '') + '">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Note'),
                    content: '<textarea id="domus-action-log-data" name="data">' + Domus.Utils.escapeHtml(entry?.data || '') + '</textarea>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Linked object type'),
                    content: '<select id="domus-action-log-linked-type" name="linkedEntityType"></select>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Linked object'),
                    content: '<select id="domus-action-log-linked-id" name="linkedEntityId" disabled></select>'
                })
            ];

            return '<div class="domus-form">' +
                '<form id="domus-action-log-edit-form">' +
                Domus.UI.buildFormTable(rows) +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-action-log-delete">' + Domus.Utils.escapeHtml(t('domus', 'Delete')) + '</button>' +
                '<button type="button" id="domus-action-log-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary" id="domus-action-log-submit">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>' +
                '</form>' +
                '</div>';
        }

        function bindEditModal(modal, entry, options = {}) {
            const form = modal.modalEl.querySelector('#domus-action-log-edit-form');
            const deleteButton = modal.modalEl.querySelector('#domus-action-log-delete');
            const cancelButton = modal.modalEl.querySelector('#domus-action-log-cancel');
            const typeInput = modal.modalEl.querySelector('#domus-action-log-type');
            const customTypeInput = modal.modalEl.querySelector('#domus-action-log-custom-type');
            const customTypeWrap = modal.modalEl.querySelector('#domus-action-log-custom-type-wrap');
            const customTypeRow = customTypeWrap?.closest('.domus-form-row');
            const linkedTypeSelect = modal.modalEl.querySelector('#domus-action-log-linked-type');
            const linkedEntitySelect = modal.modalEl.querySelector('#domus-action-log-linked-id');

            function updateTypeState() {
                const currentValue = typeInput?.value || '';
                const isCustom = currentValue === 'custom';
                if (!customTypeInput || !customTypeWrap || !customTypeRow) {
                    return;
                }
                customTypeRow.classList.toggle('domus-hidden', !isCustom);
                customTypeInput.required = isCustom;
                if (!isCustom) {
                    customTypeInput.value = '';
                }
            }

            cancelButton?.addEventListener('click', modal.close);
            bindTypePicker(modal.modalEl, updateTypeState);
            updateTypeState();
            bindLinkedEntityControls({
                linkedTypeSelect,
                linkedEntitySelect,
                ownerType: entry?.entityType || null,
                selectedType: entry?.linkedEntityType || '',
                selectedId: entry?.linkedEntityId || null
            });
            deleteButton?.addEventListener('click', () => {
                Domus.UI.confirmAction({
                    title: t('domus', 'Delete {entity}?', { entity: t('domus', 'Action log entry') }),
                    message: t('domus', 'Delete {entity}?', { entity: t('domus', 'Action log entry') }),
                    confirmLabel: t('domus', 'Delete')
                }).then(confirmed => {
                    if (!confirmed) {
                        return;
                    }

                    Domus.Api.deleteActionLog(entry.id)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: t('domus', 'Action log entry') }), 'success');
                            modal.close();
                            if (typeof options.onSaved === 'function') {
                                options.onSaved();
                            }
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            });

            form?.addEventListener('submit', event => {
                event.preventDefault();
                const selectedType = (typeInput?.value || '').trim();
                const useCustomType = selectedType === 'custom';
                const typeValue = (useCustomType ? customTypeInput?.value : selectedType || '').trim();
                const title = (modal.modalEl.querySelector('#domus-action-log-title')?.value || '').trim();
                const linkedEntityType = (linkedTypeSelect?.value || '').trim();
                const linkedEntityIdRaw = (linkedEntitySelect?.value || '').trim();
                const linkedEntityId = linkedEntityIdRaw ? Number(linkedEntityIdRaw) : null;

                if (!typeValue) {
                    Domus.UI.showNotification(t('domus', 'Type is required.'), 'error');
                    return;
                }
                if (!title) {
                    Domus.UI.showNotification(t('domus', 'Title is required.'), 'error');
                    return;
                }
                if (linkedEntityType && !linkedEntityId) {
                    Domus.UI.showNotification(t('domus', 'Linked object is required.'), 'error');
                    return;
                }

                const payload = {
                    type: typeValue,
                    title,
                    data: modal.modalEl.querySelector('#domus-action-log-data')?.value || '',
                    linkedEntityType: linkedEntityType || null,
                    linkedEntityId: linkedEntityType && linkedEntityId ? linkedEntityId : null,
                    linkedLabel: null
                };

                Domus.Api.updateActionLog(entry.id, payload)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Action log entry updated.'), 'success');
                        modal.close();
                        if (typeof options.onSaved === 'function') {
                            options.onSaved();
                        }
                        openEntryModal(entry.id, options, 'view');
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function buildDisplayValue(content) {
            return '<div class="domus-form-value-text domus-action-log-value">' + (content || '—') + '</div>';
        }

        function formatMultiline(value) {
            const normalized = String(value || '').trim();
            if (!normalized) {
                return '—';
            }
            return Domus.Utils.escapeHtml(normalized).replace(/\n/g, '<br>');
        }

        function buildLinkedEntityValue(linkedEntity) {
            if (!linkedEntity) {
                return '—';
            }

            if (linkedEntity.href) {
                return '<a class="domus-link" href="' + Domus.Utils.escapeHtml(linkedEntity.href) + '" target="_blank" rel="noopener">' +
                    Domus.Utils.escapeHtml(linkedEntity.label || '') +
                    '</a>';
            }

            if (linkedEntity.navigate && linkedEntity.id) {
                return '<a class="domus-link" href="#/' + Domus.Utils.escapeHtml(linkedEntity.navigate) + '/' + Domus.Utils.escapeHtml(String(linkedEntity.id)) + '">' +
                    Domus.Utils.escapeHtml(linkedEntity.label || '') +
                    '</a>';
            }

            return Domus.Utils.escapeHtml(linkedEntity.label || '—');
        }

        function getLinkedTypeOptions(ownerType) {
            return linkedEntityTypes.filter(option => !option.value || option.value !== ownerType);
        }

        function buildLinkedTypeOptionsMarkup(ownerType, selectedType) {
            return getLinkedTypeOptions(ownerType).map(option => (
                '<option value="' + Domus.Utils.escapeHtml(option.value) + '"' + (option.value === selectedType ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(option.label) + '</option>'
            )).join('');
        }

        function listLinkedEntities(type) {
            if (type === 'property') {
                return Domus.Api.getProperties().catch(() => []).then(properties => (
                    (properties || []).map(property => ({
                        id: property?.id,
                        label: property?.name || `${t('domus', 'Property')} #${property?.id ?? ''}`
                    })).filter(item => Number(item.id) > 0)
                ));
            }

            if (type === 'unit') {
                return Domus.Api.getUnits().catch(() => []).then(units => (
                    (units || []).map(unit => ({
                        id: unit?.id,
                        label: unit?.label || `${t('domus', 'Unit')} #${unit?.id ?? ''}`
                    })).filter(item => Number(item.id) > 0)
                ));
            }

            if (type === 'partner') {
                return Domus.Api.getPartners().catch(() => []).then(partners => (
                    (partners || []).map(partner => ({
                        id: partner?.id,
                        label: partner?.name || `${t('domus', 'Partner')} #${partner?.id ?? ''}`
                    })).filter(item => Number(item.id) > 0)
                ));
            }

            return Promise.resolve([]);
        }

        function bindLinkedEntityControls({ linkedTypeSelect, linkedEntitySelect, ownerType, selectedType = '', selectedId = null }) {
            if (!linkedTypeSelect || !linkedEntitySelect) {
                return;
            }

            const allowedTypeValues = getLinkedTypeOptions(ownerType).map(option => option.value);
            const resolvedSelectedType = allowedTypeValues.includes(selectedType) ? selectedType : '';
            linkedTypeSelect.innerHTML = buildLinkedTypeOptionsMarkup(ownerType, resolvedSelectedType);

            const renderEntityOptions = (type, preferredId = null) => {
                if (!type) {
                    linkedEntitySelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'None')) + '</option>';
                    linkedEntitySelect.disabled = true;
                    return;
                }

                linkedEntitySelect.disabled = true;
                linkedEntitySelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'Loading {entity}…', { entity: t('domus', 'Linked object') })) + '</option>';
                listLinkedEntities(type).then(items => {
                    const selectedValue = preferredId !== null && preferredId !== undefined
                        ? String(preferredId)
                        : '';
                    const options = ['<option value=""></option>'].concat(
                        (items || []).map(item => (
                            '<option value="' + Domus.Utils.escapeHtml(String(item.id)) + '"' + (String(item.id) === selectedValue ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(item.label) + '</option>'
                        ))
                    );
                    linkedEntitySelect.innerHTML = options.join('');
                    linkedEntitySelect.disabled = false;
                }).catch(() => {
                    linkedEntitySelect.innerHTML = '<option value=""></option>';
                    linkedEntitySelect.disabled = false;
                });
            };

            renderEntityOptions(linkedTypeSelect.value || '', selectedId);
            linkedTypeSelect.onchange = () => {
                renderEntityOptions(linkedTypeSelect.value || '', null);
            };
        }

        function buildTypePicker(selectedType) {
            const currentType = presetTypes.some(option => option.value === selectedType) ? selectedType : 'custom';
            return '<div class="domus-action-log-type-picker" role="radiogroup" aria-label="' + Domus.Utils.escapeHtml(t('domus', 'Type')) + '">' +
                '<input type="hidden" id="domus-action-log-type" name="type" value="' + Domus.Utils.escapeHtml(currentType) + '">' +
                presetTypes.map(option => buildTypePickerOption(option, option.value === currentType)).join('') +
                '</div>';
        }

        function buildTypePickerOption(option, isSelected) {
            const label = option?.label || '';
            const typeValue = option?.value || '';
            const iconClass = getTypeIconClass(typeValue);
            return '<label class="domus-action-log-type-option' + (isSelected ? ' is-selected' : '') + '" data-domus-action-log-type="' + Domus.Utils.escapeHtml(typeValue) + '" role="radio" aria-checked="' + (isSelected ? 'true' : 'false') + '" title="' + Domus.Utils.escapeHtml(label) + '">' +
                '<input class="domus-action-log-type-option-input" type="radio" name="domus-action-log-type-radio" value="' + Domus.Utils.escapeHtml(typeValue) + '"' + (isSelected ? ' checked' : '') + '>' +
                '<span class="domus-icon domus-action-log-type-option-icon ' + Domus.Utils.escapeHtml(iconClass) + '" aria-hidden="true"></span>' +
                '<span class="domus-action-log-type-option-label">' + Domus.Utils.escapeHtml(label) + '</span>' +
                '</label>';
        }

        function bindTypePicker(root, onChange) {
            const typeInput = root.querySelector('#domus-action-log-type');
            const options = root.querySelectorAll('[data-domus-action-log-type]');
            if (!typeInput || !options.length) {
                return;
            }

            const applySelection = (value) => {
                typeInput.value = value;
                options.forEach(option => {
                    const isSelected = option.getAttribute('data-domus-action-log-type') === value;
                    option.classList.toggle('is-selected', isSelected);
                    option.setAttribute('aria-checked', isSelected ? 'true' : 'false');
                    const radio = option.querySelector('.domus-action-log-type-option-input');
                    if (radio) {
                        radio.checked = isSelected;
                    }
                });
                if (typeof onChange === 'function') {
                    onChange();
                }
            };

            options.forEach(option => {
                if (option.dataset.domusActionLogTypeBound) {
                    return;
                }
                option.dataset.domusActionLogTypeBound = 'true';
                const radio = option.querySelector('.domus-action-log-type-option-input');
                if (!radio) {
                    return;
                }
                radio.addEventListener('change', () => {
                    if (!radio.checked) {
                        return;
                    }
                    applySelection(radio.value || option.getAttribute('data-domus-action-log-type') || 'note');
                });
            });

            applySelection(typeInput.value || 'note');
        }

        return {
            renderList,
            bindCreateButtons,
            openCreateModal,
            openEntryModal
        };
    })();
})();

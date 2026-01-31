(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Tasks = (function() {
        function parseDate(value) {
            if (!value) return null;
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) {
                const parts = String(value).split('-');
                if (parts.length === 3) {
                    return new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00`);
                }
                return null;
            }
            return date;
        }

        function getDueStatus(dueDate) {
            const parsed = parseDate(dueDate);
            if (!parsed) {
                return 'ok';
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const warningDate = new Date(today);
            warningDate.setDate(today.getDate() + 7);
            if (parsed < today) {
                return 'overdue';
            }
            if (parsed <= warningDate) {
                return 'warning';
            }
            return 'ok';
        }

        function getHighestDueStatus(items) {
            let highest = 'ok';
            (items || []).forEach(item => {
                const status = getDueStatus(item.dueDate);
                if (status === 'overdue') {
                    highest = 'overdue';
                } else if (status === 'warning' && highest === 'ok') {
                    highest = 'warning';
                }
            });
            return highest;
        }

        function sortOpenItems(items) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return (items || []).slice().sort((a, b) => {
                const aDate = parseDate(a.dueDate);
                const bDate = parseDate(b.dueDate);
                const aOverdue = aDate ? aDate < today : false;
                const bOverdue = bDate ? bDate < today : false;
                if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
                if (aDate && bDate) {
                    const diff = aDate - bDate;
                    if (diff !== 0) return diff;
                } else if (aDate || bDate) {
                    return aDate ? -1 : 1;
                }
                const unitNameA = (a.unitName || '').toLowerCase();
                const unitNameB = (b.unitName || '').toLowerCase();
                if (unitNameA < unitNameB) return -1;
                if (unitNameA > unitNameB) return 1;
                return 0;
            });
        }

        function buildTypeBadge(type) {
            const label = type === 'process' ? t('domus', 'Process') : t('domus', 'Task');
            return '<span class="domus-badge domus-badge-muted">' + Domus.Utils.escapeHtml(label) + '</span>';
        }

        function getActionMeta(actionType) {
            const map = {
                booking: { label: t('domus', 'Add booking'), icon: 'domus-icon-booking' },
                closeBookingYear: { label: t('domus', 'Close booking year'), icon: 'domus-icon-confirm-year' },
                document: { label: t('domus', 'Add document'), icon: 'domus-icon-document' },
                serviceChargeReport: { label: t('domus', 'Service charge report'), icon: 'domus-icon-document' },
                url: { label: t('domus', 'Own link'), icon: 'domus-icon-external' }
            };
            return map[actionType] || null;
        }

        function buildOpenTasksTable(items, options = {}) {
            const sorted = sortOpenItems(items || []);
            const showUnit = options.showUnit !== false;
            const showDescription = options.showDescription !== false;
            const showType = options.showType !== false;
            const showAction = options.showAction !== false;
            const wrapPanel = options.wrapPanel !== false;
            const headers = [
                showUnit ? t('domus', 'Unit') : null,
                t('domus', 'Title'),
                showDescription ? t('domus', 'Description') : null,
                t('domus', 'Due date'),
                showType ? t('domus', 'Type') : null,
                showAction ? { label: t('domus', 'Action'), alignRight: true } : null
            ].filter(item => item !== null);
            const rows = sorted.map(item => {
                const unitCell = showUnit
                    ? '<span class="domus-link" data-navigate="unitDetail" data-args="' + Domus.Utils.escapeHtml(String(item.unitId || '')) + '">' +
                        Domus.Utils.escapeHtml(item.unitName || '') +
                        '</span>'
                    : '';
                const titleParts = [];
                titleParts.push(Domus.Utils.escapeHtml(item.title || ''));
                if (item.workflowName) {
                    titleParts.push('<div class="muted">' + Domus.Utils.escapeHtml(item.workflowName) + '</div>');
                }
                const dueStatus = getDueStatus(item.dueDate);
                const dueDateLabel = Domus.Utils.formatDate(item.dueDate);
                const dueClass = dueStatus === 'overdue'
                    ? 'domus-task-date-overdue'
                    : (dueStatus === 'warning' ? 'domus-task-date-warning' : '');
                const dueText = Domus.Utils.escapeHtml(dueDateLabel || '—');
                const dueHtml = dueClass ? '<span class="' + dueClass + '">' + dueText + '</span>' : dueText;
                const descriptionBtn = showDescription && (item.description || item.actionType)
                    ? Domus.UI.buildIconButton('domus-icon-details', t('domus', 'Description'), {
                        className: 'domus-task-description',
                        dataset: {
                            title: item.title || '',
                            description: item.description || '',
                            actionType: item.actionType || '',
                            actionUrl: item.actionUrl || ''
                        }
                    })
                    : '';
                const actionMeta = getActionMeta(item.actionType);
                const runActionBtn = showAction && actionMeta
                    ? Domus.UI.buildIconButton(actionMeta.icon, actionMeta.label, {
                        className: 'domus-task-run-action',
                        dataset: {
                            type: item.type || '',
                            actionType: item.actionType || '',
                            actionUrl: item.actionUrl || '',
                            actionYear: item.year || '',
                            unitId: item.unitId || ''
                        }
                    })
                    : '';
                const actionBtn = showAction
                    ? '<div class="domus-task-action-buttons">' +
                    (runActionBtn || '<span class="domus-task-action-spacer"></span>') +
                    Domus.UI.buildIconButton('domus-icon-task', t('domus', 'Mark done'), {
                        className: 'domus-task-close',
                        dataset: {
                            type: item.type || '',
                            id: item.stepId || item.taskId || ''
                        }
                    }) +
                    '</div>'
                    : '';
                const cells = [
                    showUnit ? unitCell : null,
                    titleParts.join(''),
                    showDescription ? descriptionBtn : null,
                    dueHtml,
                    showType ? buildTypeBadge(item.type) : null,
                    showAction ? actionBtn : null
                ].filter(itemCell => itemCell !== null);
                const dataset = showUnit
                    ? { navigate: 'unitDetail', args: item.unitId }
                    : (item.type === 'process' ? { 'process-run-id': item.runId } : null);
                return { cells, dataset, className: (!showUnit && item.type === 'process') ? 'domus-task-process-row' : '' };
            });

            if (!rows.length && options.emptyMessage) {
                return Domus.UI.buildEmptyStateAction(options.emptyMessage, {
                    iconClass: options.emptyIconClass,
                    actionId: options.emptyActionId
                });
            }
            return Domus.UI.buildTable(headers, rows, { wrapPanel });
        }

        function bindOpenTaskActions(options = {}) {
            document.querySelectorAll('.domus-task-run-action').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const actionType = btn.getAttribute('data-action-type');
                    const actionUrl = btn.getAttribute('data-action-url');
                    const actionYear = btn.getAttribute('data-action-year');
                    const unitId = btn.getAttribute('data-unit-id');
                    if (!actionType) return;
                    runTaskAction(actionType, actionUrl, actionYear, unitId, options.onRefresh);
                });
            });
            document.querySelectorAll('.domus-task-close').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const type = btn.getAttribute('data-type');
                    const id = btn.getAttribute('data-id');
                    if (!id) return;
                    const action = type === 'process' ? Domus.Api.closeTaskStep(id) : Domus.Api.closeTask(id);
                    action.then(() => {
                        Domus.UI.showNotification(t('domus', 'Task completed.'), 'success');
                        if (typeof options.onRefresh === 'function') {
                            options.onRefresh();
                        }
                    }).catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            });
        }

        function runTaskAction(actionType, actionUrl, actionYear, unitId, onComplete) {
            if (actionType === 'url') {
                if (!actionUrl) {
                    Domus.UI.showNotification(t('domus', 'Link URL is required.'), 'error');
                    return;
                }
                window.open(actionUrl, '_blank', 'noopener');
                return;
            }

            if (!unitId) {
                Domus.UI.showNotification(t('domus', 'Unit is required.'), 'error');
                return;
            }

            if (actionType === 'document') {
                Domus.Documents.openLinkModal('unit', unitId, onComplete);
                return;
            }

            if (actionType === 'closeBookingYear') {
                const yearValue = parseInt(actionYear || Domus.state.currentYear, 10);
                Domus.Api.getUnitStatistics(unitId)
                    .then(statistics => {
                        if (Domus.Units?.openYearStatusModal) {
                            Domus.Units.openYearStatusModal(unitId, statistics, onComplete, { defaultYear: yearValue });
                        } else {
                            Domus.UI.showNotification(t('domus', 'Action not supported.'), 'error');
                        }
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
                return;
            }

            Domus.Api.get('/units/' + unitId)
                .then(unit => {
                    if (actionType === 'booking') {
                        Domus.Bookings.openCreateModal({ propertyId: unit?.propertyId, unitId }, onComplete, {
                            accountFilter: (nr) => String(nr).startsWith('2'),
                            hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                        });
                        return;
                    }
                    if (actionType === 'serviceChargeReport') {
                        Domus.UnitSettlements.openModal(unitId, onComplete);
                        return;
                    }
                    Domus.UI.showNotification(t('domus', 'Action not supported.'), 'error');
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function openStartProcessModal(unitId, onSaved) {
            Domus.Api.getTaskTemplates(true)
                .then(templates => {
                    const options = (templates || []).map(template => (
                        '<option value="' + Domus.Utils.escapeHtml(String(template.id)) + '" data-key="' + Domus.Utils.escapeHtml(template.key || '') + '">' +
                        Domus.Utils.escapeHtml(template.name || '') +
                        '</option>'
                    )).join('');
                    const rows = [
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Template'),
                            required: true,
                            content: '<select id="domus-task-template" name="templateId" required>' + options + '</select>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Year'),
                            content: '<input id="domus-task-year" name="year" type="number" value="' + Domus.Utils.escapeHtml(String(Domus.state.currentYear)) + '">'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Name'),
                            content: '<input id="domus-task-run-name" name="name" type="text">'
                        })
                    ];
                    const content = '<div class="domus-form"><form id="domus-task-start-form">' +
                        Domus.UI.buildFormTable(rows) +
                        '<div class="domus-form-actions">' +
                        '<button type="button" id="domus-task-start-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Start process')) + '</button>' +
                        '</div>' +
                        '</form></div>';
                    const modal = Domus.UI.openModal({ title: t('domus', 'Start process'), content });
                    const form = modal.modalEl.querySelector('#domus-task-start-form');
                    const templateSelect = modal.modalEl.querySelector('#domus-task-template');
                    const yearInput = modal.modalEl.querySelector('#domus-task-year');
                    const nameInput = modal.modalEl.querySelector('#domus-task-run-name');
                    const cancelBtn = modal.modalEl.querySelector('#domus-task-start-cancel');

                    function updateVisibility() {
                        const selected = templateSelect?.selectedOptions?.[0];
                        const key = selected?.getAttribute('data-key');
                        const showYear = key === 'year_end';
                        const yearRow = yearInput?.closest('tr');
                        if (yearRow) {
                            yearRow.style.display = showYear ? '' : 'none';
                        }
                        const templateName = selected?.textContent || '';
                        const yearValue = yearInput?.value || '';
                        const nameValue = showYear && yearValue ? `${templateName} ${yearValue}` : templateName;
                        if (nameInput) {
                            nameInput.value = nameValue.trim();
                        }
                    }

                    templateSelect?.addEventListener('change', updateVisibility);
                    yearInput?.addEventListener('input', updateVisibility);
                    updateVisibility();

                    cancelBtn?.addEventListener('click', modal.close);
                    form?.addEventListener('submit', (event) => {
                        event.preventDefault();
                        const data = new FormData(form);
                        const payload = {
                            templateId: parseInt(data.get('templateId'), 10),
                            name: data.get('name'),
                        };
                        const yearValue = data.get('year');
                        if (yearInput && yearInput.closest('tr')?.style.display !== 'none') {
                            payload.year = yearValue ? parseInt(yearValue, 10) : Domus.state.currentYear;
                        }
                        Domus.Api.startWorkflowRun(unitId, payload)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', 'Process started.'), 'success');
                                modal.close();
                                onSaved && onSaved();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function openCreateTaskModal(unitId, onSaved) {
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Title'),
                    required: true,
                    content: '<input name="title" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Description'),
                    content: '<textarea name="description"></textarea>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Due date'),
                    content: '<input name="dueDate" type="date">'
                })
            ];
            const content = '<div class="domus-form"><form id="domus-task-create-form">' +
                Domus.UI.buildFormTable(rows) +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-task-create-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Create task')) + '</button>' +
                '</div>' +
                '</form></div>';
            const modal = Domus.UI.openModal({ title: t('domus', 'New task'), content });
            const form = modal.modalEl.querySelector('#domus-task-create-form');
            modal.modalEl.querySelector('#domus-task-create-cancel')?.addEventListener('click', modal.close);
            form?.addEventListener('submit', (event) => {
                event.preventDefault();
                const data = new FormData(form);
                const payload = {
                    title: data.get('title'),
                    description: data.get('description'),
                    dueDate: data.get('dueDate')
                };
                Domus.Api.createTask(unitId, payload)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Task created.'), 'success');
                        modal.close();
                        onSaved && onSaved();
                    })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function openCreateTaskModalWithUnitSelect(onSaved) {
            Domus.Api.getUnits()
                .then(units => {
                    const options = (units || []).map(unit => {
                        const label = unit.label || `${t('domus', 'Unit')} #${unit.id}`;
                        return '<option value="' + Domus.Utils.escapeHtml(unit.id) + '">' + Domus.Utils.escapeHtml(label) + '</option>';
                    });
                    if (!options.length) {
                        Domus.UI.showNotification(t('domus', 'No {entity} available.', { entity: t('domus', 'Units') }), 'error');
                        return;
                    }
                    const rows = [
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Unit'),
                            required: true,
                            content: '<select name="unitId" required>' + options.join('') + '</select>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Title'),
                            required: true,
                            content: '<input name="title" required>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Description'),
                            content: '<textarea name="description"></textarea>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Due date'),
                            content: '<input name="dueDate" type="date">'
                        })
                    ];
                    const content = '<div class="domus-form"><form id="domus-task-create-form">' +
                        Domus.UI.buildFormTable(rows) +
                        '<div class="domus-form-actions">' +
                        '<button type="button" id="domus-task-create-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Create task')) + '</button>' +
                        '</div>' +
                        '</form></div>';
                    const modal = Domus.UI.openModal({ title: t('domus', 'New task'), content });
                    const form = modal.modalEl.querySelector('#domus-task-create-form');
                    modal.modalEl.querySelector('#domus-task-create-cancel')?.addEventListener('click', modal.close);
                    form?.addEventListener('submit', (event) => {
                        event.preventDefault();
                        const data = new FormData(form);
                        const unitId = data.get('unitId');
                        const payload = {
                            title: data.get('title'),
                            description: data.get('description'),
                            dueDate: data.get('dueDate')
                        };
                        Domus.Api.createTask(unitId, payload)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', 'Task created.'), 'success');
                                modal.close();
                                onSaved && onSaved();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function buildWorkflowStepsTable(run, options = {}) {
            const rows = (run.steps || []).map(step => {
                const dueLabel = Domus.Utils.formatDate(step.dueDate) || '—';
                const statusLabel = step.status || '';
                const actionBtn = step.status === 'open'
                    ? Domus.UI.buildIconButton('domus-icon-ok', t('domus', 'Mark done'), {
                        className: 'domus-task-close',
                        dataset: { type: 'process', id: step.id }
                    })
                    : (options.allowReopen && step.status === 'closed'
                        ? Domus.UI.buildIconButton('domus-icon-back', t('domus', 'Reopen'), {
                            className: 'domus-task-reopen-step',
                            dataset: { id: step.id }
                        })
                        : '');
                return [
                    Domus.Utils.escapeHtml(step.title || ''),
                    Domus.Utils.escapeHtml(dueLabel),
                    Domus.Utils.escapeHtml(statusLabel),
                    actionBtn
                ];
            });
            return Domus.UI.buildTable([t('domus', 'Step'), t('domus', 'Due date'), t('domus', 'Status'), ''], rows);
        }

        function openDescriptionModal(title, description, actionType, actionUrl) {
            const meta = getActionMeta(actionType);
            const actionLabel = Domus.Utils.escapeHtml(t('domus', 'Action'));
            const descriptionHtml = description
                ? '<p>' + Domus.Utils.escapeHtml(description).replace(/\n/g, '<br>') + '</p>'
                : '';
            let actionHtml = '';
            if (meta) {
                if (actionType === 'url' && actionUrl) {
                    const safeUrl = Domus.Utils.escapeHtml(actionUrl);
                    actionHtml = '<p><strong>' + actionLabel + ':</strong> ' +
                        '<a href="' + safeUrl + '" target="_blank" rel="noopener">' +
                        Domus.Utils.escapeHtml(t('domus', 'Open link')) +
                        '</a></p>';
                } else {
                    actionHtml = '<p><strong>' + actionLabel + ':</strong> ' + Domus.Utils.escapeHtml(meta.label) + '</p>';
                }
            }
            const content = '<div class="domus-form">' + descriptionHtml + actionHtml + '</div>';
            Domus.UI.openModal({ title: title || t('domus', 'Description'), content });
        }

        function openProcessTasksModal(run) {
            const rows = (run.steps || []).map(step => {
                const completedLabel = Domus.Utils.formatDate(step.closedAt ? step.closedAt * 1000 : step.closedAt) || '—';
                const actionBtn = step.description
                    ? Domus.UI.buildIconButton('domus-icon-details', t('domus', 'Description'), {
                        className: 'domus-step-description',
                        dataset: {
                            title: step.title || '',
                            description: step.description || ''
                        }
                    })
                    : '';
                return [
                    Domus.Utils.escapeHtml(step.title || ''),
                    Domus.Utils.escapeHtml(step.status || ''),
                    Domus.Utils.escapeHtml(completedLabel),
                    actionBtn
                ];
            });
            const content = Domus.UI.buildTable([t('domus', 'Step'), t('domus', 'Status'), t('domus', 'Completed'), ''], rows);
            const modal = Domus.UI.openModal({ title: run.name || t('domus', 'Process'), content });
            modal.modalEl.querySelectorAll('.domus-step-description').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const title = btn.getAttribute('data-title');
                    const description = btn.getAttribute('data-description');
                    openDescriptionModal(title || t('domus', 'Description'), description || '');
                });
            });
        }

        function buildUnitOpenItems(unitId, data) {
            const openItems = [];
            (data.runs || []).forEach(run => {
                const openStep = (run.steps || []).find(step => step.status === 'open');
                if (openStep) {
                    openItems.push({
                        type: 'process',
                        stepId: openStep.id,
                        runId: run.id,
                        unitId,
                        unitName: data.unitName || '',
                        title: openStep.title,
                        description: openStep.description,
                        actionType: openStep.actionType,
                        actionUrl: openStep.actionUrl,
                        dueDate: openStep.dueDate,
                        workflowName: run.name
                    });
                }
            });
            (data.tasks || []).filter(task => task.status === 'open').forEach(task => {
                openItems.push({
                    type: 'task',
                    taskId: task.id,
                    unitId,
                    unitName: data.unitName || '',
                    title: task.title,
                    description: task.description,
                    dueDate: task.dueDate
                });
            });
            return openItems;
        }

        function buildUnitTasksContent(unitId, data, options = {}) {
            const openItems = buildUnitOpenItems(unitId, data);

            const openTable = buildOpenTasksTable(openItems, {
                showUnit: false,
                wrapPanel: false,
                emptyMessage: t('domus', 'There is no {entity} yet. Create the first one', {
                    entity: t('domus', 'Tasks')
                }),
                emptyActionId: 'domus-unit-tasks-empty-create',
                emptyIconClass: 'domus-icon-task'
            });
            const openSection = '<h4>' + Domus.Utils.escapeHtml(t('domus', 'Open')) + '</h4>' + openTable;

            const closedItems = [];
            (data.tasks || []).filter(task => task.status === 'closed').forEach(task => {
                closedItems.push({
                    type: 'task',
                    taskId: task.id,
                    title: task.title,
                    description: task.description,
                    closedAt: task.closedAt
                });
            });
            (data.runs || []).forEach(run => {
                if (run.status === 'closed') {
                    closedItems.push({
                        type: 'processRun',
                        runId: run.id,
                        title: run.name,
                        closedAt: run.closedAt
                    });
                }
            });
            const closedRows = closedItems
                .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0))
                .map(item => {
                    const titleParts = [];
                    titleParts.push(Domus.Utils.escapeHtml(item.title || ''));
                    if (item.workflowName) {
                        titleParts.push('<div class="muted">' + Domus.Utils.escapeHtml(item.workflowName) + '</div>');
                    }
                    const descriptionBtn = item.description
                        ? Domus.UI.buildIconButton('domus-icon-details', t('domus', 'Description'), {
                            className: 'domus-task-description',
                            dataset: {
                                title: item.title || '',
                                description: item.description || ''
                            }
                        })
                        : '';
                    const closedLabel = Domus.Utils.formatDate(item.closedAt ? item.closedAt * 1000 : item.closedAt) || '—';
                    const typeBadge = buildTypeBadge(item.type === 'task' ? 'task' : 'process');
                    const actionParts = [];
                    if (item.type === 'task') {
                        actionParts.push(Domus.UI.buildIconButton('domus-icon-back', t('domus', 'Reopen'), {
                            className: 'domus-task-reopen',
                            dataset: { id: item.taskId }
                        }));
                        actionParts.push(Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), {
                            className: 'domus-task-delete',
                            dataset: { type: 'task', id: item.taskId }
                        }));
                    } else if (item.type === 'processRun') {
                        actionParts.push(Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), {
                            className: 'domus-task-delete',
                            dataset: { type: 'process', id: item.runId }
                        }));
                    }
                    return [
                        titleParts.join(''),
                        descriptionBtn,
                        Domus.Utils.escapeHtml(closedLabel),
                        typeBadge,
                        actionParts.join('')
                    ];
                });
            const closedTable = Domus.UI.buildTable([t('domus', 'Title'), t('domus', 'Description'), t('domus', 'Closed'), t('domus', 'Type'), ''], closedRows);
            const closedSection = '<h4>' + Domus.Utils.escapeHtml(t('domus', 'Closed')) + '</h4>' + closedTable;

            return '<div class="domus-task-section">' + openSection + closedSection + '</div>';
        }

        function bindUnitTaskActions(unitId, runs, options = {}) {
            bindOpenTaskActions({ onRefresh: options.onRefresh });
            document.querySelectorAll('table.domus-table tr[data-process-run-id]').forEach(row => {
                row.addEventListener('click', (event) => {
                    if (event.target.closest('a') || event.target.closest('button')) {
                        return;
                    }
                    const runId = row.getAttribute('data-process-run-id');
                    if (!runId) return;
                    const run = (runs || []).find(item => String(item.id) === String(runId));
                    if (!run) return;
                    openProcessTasksModal(run);
                });
            });
            document.querySelectorAll('.domus-task-description').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const title = btn.getAttribute('data-title');
                    const description = btn.getAttribute('data-description');
                    const actionType = btn.getAttribute('data-action-type');
                    const actionUrl = btn.getAttribute('data-action-url');
                    openDescriptionModal(title || t('domus', 'Description'), description || '', actionType || '', actionUrl || '');
                });
            });
            document.querySelectorAll('.domus-task-delete').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const type = btn.getAttribute('data-type');
                    const id = btn.getAttribute('data-id');
                    if (!id) return;
                    const entityLabel = type === 'process' ? t('domus', 'Process') : t('domus', 'Task');
                    Domus.UI.confirmAction({
                        message: t('domus', 'Delete {entity}?', { entity: entityLabel }),
                        confirmLabel: t('domus', 'Delete')
                    }).then(confirmed => {
                        if (!confirmed) {
                            return;
                        }
                        const action = type === 'process' ? Domus.Api.deleteWorkflowRun(id) : Domus.Api.deleteTask(id);
                        action.then(() => {
                            options.onRefresh && options.onRefresh();
                        }).catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                });
            });
            document.querySelectorAll('.domus-task-reopen').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    if (!id) return;
                    Domus.Api.reopenTask(id)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Task reopened.'), 'success');
                            options.onRefresh && options.onRefresh();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            });
            document.querySelectorAll('.domus-task-reopen-step').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const id = btn.getAttribute('data-id');
                    if (!id) return;
                    Domus.Api.reopenTaskStep(id)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Step reopened.'), 'success');
                            options.onRefresh && options.onRefresh();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            });
        }

        function loadUnitTasks(unitId, options = {}) {
            const body = document.getElementById('domus-unit-tasks-body');
            if (!body && typeof options.onOpenCount !== 'function') {
                return;
            }
            if (body) {
                body.innerHTML = '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'Loading tasks…')) + '</div>';
            }
            Promise.all([
                Domus.Api.getWorkflowRunsByUnit(unitId).catch(() => []),
                Domus.Api.getTasksByUnit(unitId).catch(() => []),
                Domus.Api.get('/units/' + unitId).catch(() => null)
            ])
                .then(([runs, tasks, unit]) => {
                    const unitData = { runs, tasks, unitName: unit?.label || '' };
                    const openItems = buildUnitOpenItems(unitId, unitData);
                    const openCount = openItems.length;
                    const highestStatus = getHighestDueStatus(openItems);
                    if (body) {
                        const content = buildUnitTasksContent(unitId, unitData);
                        body.innerHTML = content;
                        Domus.UI.bindCollapsibles();
                        bindUnitTaskActions(unitId, runs, { onRefresh: () => loadUnitTasks(unitId, options) });
                    }
                    if (typeof options.onOpenCount === 'function') {
                        options.onOpenCount(openCount, highestStatus);
                    }
                })
                .catch(err => {
                    if (body) {
                        body.innerHTML = '<div class="muted">' + Domus.Utils.escapeHtml(err.message || '') + '</div>';
                    }
                });
        }

        function buildUnitTasksPanel(options = {}) {
            const panelContent = '<div class="domus-section-header">' +
                '<h3>' + Domus.Utils.escapeHtml(t('domus', 'Tasks')) + '</h3>' +
                '<div class="domus-section-actions">' +
                '<button id="domus-unit-start-process">' + Domus.Utils.escapeHtml(t('domus', 'Start process')) + '</button>' +
                '<button id="domus-unit-new-task">' + Domus.Utils.escapeHtml(t('domus', 'New task')) + '</button>' +
                '</div>' +
                '</div>' +
                '<div class="domus-panel-body" id="domus-unit-tasks-body">' +
                Domus.Utils.escapeHtml(t('domus', 'Loading tasks…')) +
                '</div>';
            if (options.wrapPanel === false) {
                return panelContent;
            }
            const panelId = options.panelId || 'domus-unit-tasks-panel';
            return '<div class="domus-panel" id="' + Domus.Utils.escapeHtml(panelId) + '">' +
                panelContent +
                '</div>';
        }

        function bindUnitTaskButtons(unitId, onRefresh) {
            document.getElementById('domus-unit-start-process')?.addEventListener('click', () => {
                openStartProcessModal(unitId, onRefresh);
            });
            document.getElementById('domus-unit-new-task')?.addEventListener('click', () => {
                openCreateTaskModal(unitId, onRefresh);
            });
            document.getElementById('domus-unit-tasks-empty-create')?.addEventListener('click', () => {
                openCreateTaskModal(unitId, onRefresh);
            });
        }

        return {
            buildOpenTasksTable,
            bindOpenTaskActions,
            buildUnitTasksPanel,
            loadUnitTasks,
            bindUnitTaskButtons,
            openCreateTaskModalWithUnitSelect
        };
    })();

    /**
     * Dashboard view
     */
    Domus.TaskTemplates = (function() {
        function buildTemplateRow(template) {
            const statusLabel = template.isActive ? t('domus', 'Active') : t('domus', 'Inactive');
            const toggleLabel = template.isActive ? t('domus', 'Disable') : t('domus', 'Enable');
            const toggleIcon = template.isActive ? 'domus-icon-back' : 'domus-icon-ok';
            return {
                cells: [
                    Domus.Utils.escapeHtml(template.name || ''),
                    Domus.Utils.escapeHtml(statusLabel),
                    '<div class="domus-task-template-actions">' +
                        Domus.UI.buildIconButton('domus-icon-edit', t('domus', 'Edit'), {
                            className: 'domus-task-template-edit',
                            dataset: { id: template.id }
                        }) +
                        Domus.UI.buildIconButton(toggleIcon, toggleLabel, {
                            className: 'domus-task-template-toggle',
                            dataset: { id: template.id }
                        }) +
                        Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), {
                            className: 'domus-task-template-delete',
                            dataset: { id: template.id }
                        }) +
                        '</div>'
                ]
            };
        }

        function renderSection() {
            return '<div class="domus-panel" id="domus-task-templates-panel">' +
                '<div class="domus-section-header">' +
                '<h3>' + Domus.Utils.escapeHtml(t('domus', 'Task templates')) + '</h3>' +
                Domus.UI.buildIconButton('domus-icon-add', t('domus', 'Add template'), {
                    id: 'domus-task-template-create'
                }) +
                '</div>' +
                '<div class="domus-panel-body" id="domus-task-templates-body">' +
                Domus.Utils.escapeHtml(t('domus', 'Loading templates…')) +
                '</div>' +
                '</div>';
        }

        function loadTemplates() {
            const container = document.getElementById('domus-task-templates-body');
            if (!container) return;
            container.innerHTML = Domus.Utils.escapeHtml(t('domus', 'Loading templates…'));
            Domus.Api.getTaskTemplates(false)
                .then(templates => {
                    const rows = (templates || []).map(buildTemplateRow);
                    container.innerHTML = Domus.UI.buildTable([
                        t('domus', 'Name'),
                        t('domus', 'Status'),
                        ''
                    ], rows);
                    bindTemplateActions();
                })
                .catch(err => {
                    container.innerHTML = '<div class="muted">' + Domus.Utils.escapeHtml(err.message || '') + '</div>';
                });
        }

        function openTemplateModal(template, onSaved) {
            const isEdit = !!template?.id;
            const refreshTemplate = () => {
                if (!template?.id) {
                    return;
                }
                loadTemplateDetails(template.id);
            };
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Name'),
                    required: true,
                    content: '<input name="name" required value="' + Domus.Utils.escapeHtml(template?.name || '') + '">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Description'),
                    content: '<textarea name="description">' + Domus.Utils.escapeHtml(template?.description || '') + '</textarea>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Applies to'),
                    content: '<input name="appliesTo" value="' + Domus.Utils.escapeHtml(template?.appliesTo || 'unit') + '" readonly>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Active'),
                    content: '<input type="checkbox" name="isActive"' + (template?.isActive ? ' checked' : '') + '>'
                })
            ];
            if (!isEdit) {
                rows.unshift(Domus.UI.buildFormRow({
                    label: t('domus', 'Identifier'),
                    required: true,
                    content: '<input name="key" required value="' + Domus.Utils.escapeHtml(template?.key || '') + '">'
                }));
            }
            const stepsSection = isEdit ? '<div class="domus-task-steps">' +
                '<div class="domus-task-steps-header">' +
                '<strong>' + Domus.Utils.escapeHtml(t('domus', 'Steps')) + '</strong>' +
                '<button type="button" id="domus-task-step-add">' + Domus.Utils.escapeHtml(t('domus', 'Add step')) + '</button>' +
                '</div>' +
                '<ul id="domus-task-step-list" class="domus-task-step-list"></ul>' +
                '</div>' : '';
            const content = '<div class="domus-form"><form id="domus-task-template-form">' +
                Domus.UI.buildFormTable(rows) +
                stepsSection +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-task-template-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>' +
                '</form></div>';
            const modal = Domus.UI.openModal({ title: isEdit ? t('domus', 'Edit template') : t('domus', 'Add template'), content });
            const form = modal.modalEl.querySelector('#domus-task-template-form');
            modal.modalEl.querySelector('#domus-task-template-cancel')?.addEventListener('click', modal.close);

            if (isEdit) {
                renderStepsList(template);
                bindStepActions(template.id, () => loadTemplateDetails(template.id), refreshTemplate);
                modal.modalEl.querySelector('#domus-task-step-add')?.addEventListener('click', () => openStepModal(template.id, null, refreshTemplate));
            }

            form?.addEventListener('submit', (event) => {
                event.preventDefault();
                const data = new FormData(form);
                const payload = {
                    name: data.get('name'),
                    description: data.get('description'),
                    appliesTo: data.get('appliesTo'),
                    isActive: data.get('isActive') === 'on'
                };
                if (!isEdit) {
                    payload.key = data.get('key');
                }
                const action = isEdit
                    ? Domus.Api.updateTaskTemplate(template.id, payload)
                    : Domus.Api.createTaskTemplate(payload);
                action.then(response => {
                    Domus.UI.showNotification(t('domus', 'Template saved.'), 'success');
                    modal.close();
                    if (typeof onSaved === 'function') onSaved(response);
                }).catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function openStepModal(templateId, step, onSaved) {
            const actionOptions = [
                { value: '', label: t('domus', 'No action') },
                { value: 'booking', label: t('domus', 'Add booking') },
                { value: 'closeBookingYear', label: t('domus', 'Close booking year') },
                { value: 'document', label: t('domus', 'Add document') },
                { value: 'serviceChargeReport', label: t('domus', 'Service charge report') },
                { value: 'url', label: t('domus', 'Own link') },
            ];
            const selectedAction = step?.actionType || '';
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Title'),
                    required: true,
                    content: '<input name="title" required value="' + Domus.Utils.escapeHtml(step?.title || '') + '">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Description'),
                    content: '<textarea name="description">' + Domus.Utils.escapeHtml(step?.description || '') + '</textarea>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Default due days'),
                    content: '<input name="defaultDueDaysOffset" type="number" value="' + Domus.Utils.escapeHtml(String(step?.defaultDueDaysOffset || 0)) + '">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Action'),
                    content: '<select name="actionType">' + actionOptions.map(option => (
                        '<option value="' + Domus.Utils.escapeHtml(option.value) + '"' +
                        (option.value === selectedAction ? ' selected' : '') + '>' +
                        Domus.Utils.escapeHtml(option.label) +
                        '</option>'
                    )).join('') + '</select>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Link URL'),
                    content: '<input name="actionUrl" value="' + Domus.Utils.escapeHtml(step?.actionUrl || '') + '">'
                })
            ];
            const content = '<div class="domus-form"><form id="domus-task-step-form">' +
                Domus.UI.buildFormTable(rows) +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-task-step-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>' +
                '</form></div>';
            const modal = Domus.UI.openModal({ title: step ? t('domus', 'Edit step') : t('domus', 'Add step'), content });
            const form = modal.modalEl.querySelector('#domus-task-step-form');
            const actionSelect = modal.modalEl.querySelector('select[name="actionType"]');
            const actionUrlInput = modal.modalEl.querySelector('input[name="actionUrl"]');
            const actionUrlRow = actionUrlInput?.closest('tr');
            modal.modalEl.querySelector('#domus-task-step-cancel')?.addEventListener('click', modal.close);

            const updateActionVisibility = () => {
                const type = actionSelect?.value || '';
                const showUrl = type === 'url';
                if (actionUrlRow) {
                    actionUrlRow.style.display = showUrl ? '' : 'none';
                }
                if (!showUrl && actionUrlInput) {
                    actionUrlInput.value = '';
                }
            };
            actionSelect?.addEventListener('change', updateActionVisibility);
            updateActionVisibility();

            form?.addEventListener('submit', (event) => {
                event.preventDefault();
                const data = new FormData(form);
                const payload = {
                    title: data.get('title'),
                    description: data.get('description'),
                    defaultDueDaysOffset: parseInt(data.get('defaultDueDaysOffset') || '0', 10),
                    actionType: data.get('actionType'),
                    actionUrl: data.get('actionUrl')
                };
                const action = step
                    ? Domus.Api.updateTaskTemplateStep(step.id, Object.assign({}, payload, { templateId }))
                    : Domus.Api.addTaskTemplateStep(templateId, payload);
                action.then(() => {
                    Domus.UI.showNotification(t('domus', 'Step saved.'), 'success');
                    modal.close();
                    onSaved && onSaved();
                }).catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function renderStepsList(template) {
            const list = document.getElementById('domus-task-step-list');
            if (!list) return;
            list.innerHTML = (template.steps || []).map(step => (
                '<li class="domus-task-step-item" draggable="true" data-id="' + Domus.Utils.escapeHtml(String(step.id)) + '">' +
                '<div class="domus-task-step-main">' +
                '<strong>' + Domus.Utils.escapeHtml(step.title || '') + '</strong>' +
                '<div class="muted">' + Domus.Utils.escapeHtml(step.description || '') + '</div>' +
                '</div>' +
                '<div class="domus-task-step-meta">' +
                Domus.Utils.escapeHtml(t('domus', 'Due +{days} days', { days: step.defaultDueDaysOffset || 0 })) +
                '</div>' +
                '<div class="domus-task-step-actions">' +
                Domus.UI.buildIconButton('domus-icon-edit', t('domus', 'Edit'), {
                    className: 'domus-task-step-edit',
                    dataset: { id: step.id }
                }) +
                Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), {
                    className: 'domus-task-step-delete',
                    dataset: { id: step.id }
                }) +
                '</div>' +
                '</li>'
            )).join('');
            bindStepDrag(list, template.id);
        }

        function bindStepDrag(list, templateId) {
            let dragEl = null;
            list.querySelectorAll('.domus-task-step-item').forEach(item => {
                item.addEventListener('dragstart', (event) => {
                    dragEl = item;
                    item.classList.add('is-dragging');
                    event.dataTransfer.effectAllowed = 'move';
                });
                item.addEventListener('dragend', () => {
                    dragEl?.classList.remove('is-dragging');
                    dragEl = null;
                    const ids = Array.from(list.querySelectorAll('.domus-task-step-item')).map(el => el.getAttribute('data-id'));
                    Domus.Api.reorderTaskTemplateSteps(templateId, ids)
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
                item.addEventListener('dragover', (event) => {
                    event.preventDefault();
                    const target = event.currentTarget;
                    if (!dragEl || target === dragEl) return;
                    const rect = target.getBoundingClientRect();
                    const next = (event.clientY - rect.top) > rect.height / 2;
                    list.insertBefore(dragEl, next ? target.nextSibling : target);
                });
            });
        }

        function bindStepActions(templateId, onRefresh, reopenTemplate) {
            document.querySelectorAll('.domus-task-step-edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    const stepId = btn.getAttribute('data-id');
                    loadTemplateDetails(templateId, template => {
                        const step = (template.steps || []).find(st => String(st.id) === String(stepId));
                        if (step) {
                            openStepModal(templateId, step, reopenTemplate || onRefresh);
                        }
                    });
                });
            });
            document.querySelectorAll('.domus-task-step-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const stepId = btn.getAttribute('data-id');
                    Domus.UI.confirmAction({
                        message: t('domus', 'Delete step?'),
                        confirmLabel: t('domus', 'Delete')
                    }).then(confirmed => {
                        if (!confirmed) {
                            return;
                        }
                        Domus.Api.deleteTaskTemplateStep(stepId)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', 'Step deleted.'), 'success');
                                onRefresh && onRefresh();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                });
            });
        }

        function loadTemplateDetails(templateId, onLoaded) {
            Domus.Api.getTaskTemplate(templateId)
                .then(template => {
                    renderStepsList(template);
                    bindStepActions(templateId, () => loadTemplateDetails(templateId, onLoaded));
                    if (typeof onLoaded === 'function') onLoaded(template);
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindTemplateActions() {
            document.querySelectorAll('.domus-task-template-edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    if (!id) return;
                    Domus.Api.getTaskTemplate(id)
                        .then(template => openTemplateModal(template, () => loadTemplates()))
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            });
            document.querySelectorAll('.domus-task-template-toggle').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    if (!id) return;
                    Domus.Api.getTaskTemplate(id)
                        .then(template => Domus.Api.updateTaskTemplate(id, { isActive: !template.isActive }))
                        .then(() => {
                            Domus.UI.showNotification(t('domus', 'Template updated.'), 'success');
                            loadTemplates();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            });
            document.querySelectorAll('.domus-task-template-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    if (!id) return;
                    Domus.UI.confirmAction({
                        message: t('domus', 'Delete template?'),
                        confirmLabel: t('domus', 'Delete')
                    }).then(confirmed => {
                        if (!confirmed) {
                            return;
                        }
                        Domus.Api.deleteTaskTemplate(id)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', 'Template deleted.'), 'success');
                                loadTemplates();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                });
            });
            document.getElementById('domus-task-template-create')?.addEventListener('click', () => {
                openTemplateModal(null, () => loadTemplates());
            });
        }

        return { renderSection, loadTemplates };
    })();

    /**
     * Settings view
     */
})();

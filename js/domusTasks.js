/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Tasks = (function() {
        let processFocusContext = null;
        function parseDate(value) {
            if (!value) return null;
            const dateOnly = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
            const date = dateOnly
                ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
                : new Date(value);
            return Number.isNaN(date.getTime()) ? null : date;
        }

        function getDayOffset(dueDate, today = new Date()) {
            const parsed = parseDate(dueDate);
            if (!parsed) return null;
            const calendarDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
            return Math.round((calendarDay(parsed) - calendarDay(today)) / 86400000);
        }

        function getDueStatus(dueDate) {
            const dayOffset = getDayOffset(dueDate);
            if (dayOffset === null) {
                return 'ok';
            }
            if (dayOffset < 0) {
                return 'overdue';
            }
            if (dayOffset <= 7) {
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
            return (items || []).slice().sort((a, b) => {
                const aDate = parseDate(a.dueDate);
                const bDate = parseDate(b.dueDate);
                const aOffset = getDayOffset(a.dueDate);
                const bOffset = getDayOffset(b.dueDate);
                const aOverdue = aOffset !== null && aOffset < 0;
                const bOverdue = bOffset !== null && bOffset < 0;
                if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
                if (aDate && bDate) {
                    const diff = aDate - bDate;
                    if (diff !== 0) return diff;
                } else if (aDate || bDate) {
                    return aDate ? -1 : 1;
                }
                const entityNameA = getEntityName(a).toLowerCase();
                const entityNameB = getEntityName(b).toLowerCase();
                if (entityNameA < entityNameB) return -1;
                if (entityNameA > entityNameB) return 1;
                return 0;
            });
        }

        function buildTypeBadge(type) {
            const label = type === 'process' ? t('domus', 'Process') : t('domus', 'Task');
            return '<span class="domus-badge domus-badge-muted">' + Domus.Utils.escapeHtml(label) + '</span>';
        }

        function buildDueDateBadge(dueDate, options = {}) {
            const dueStatus = getDueStatus(dueDate);
            const parsed = parseDate(dueDate);
            const dueDateLabel = parsed ? parsed.toLocaleDateString() : (dueDate ? String(dueDate) : '—');
            let dueClass = 'domus-task-date-badge';
            if (dueStatus === 'overdue') {
                dueClass += ' domus-task-date-badge-overdue';
            } else if (dueStatus === 'warning') {
                dueClass += ' domus-task-date-badge-warning';
            }
            if (options.showRelative && !dueDate) {
                return '<span class="' + dueClass + '">' + Domus.Utils.escapeHtml(t('domus', 'No due date')) + '</span>';
            }
            if (!options.showRelative || !parsed) {
                return '<span class="' + dueClass + '">' + Domus.Utils.escapeHtml(dueDateLabel) + '</span>';
            }
            const dayOffset = getDayOffset(dueDate);
            const relativeLabel = dayOffset < -1
                ? t('domus', '{count} days overdue', { count: -dayOffset })
                : dayOffset === -1 ? t('domus', '1 day overdue')
                    : dayOffset === 0 ? t('domus', 'Due today')
                        : dayOffset === 1 ? t('domus', 'Due tomorrow')
                            : t('domus', 'In {count} days', { count: dayOffset });
            if (dueStatus === 'overdue') {
                return '<span class="' + dueClass + '">' + Domus.Utils.escapeHtml(relativeLabel) + '</span>';
            }
            return '<span class="' + dueClass + ' domus-task-date-badge-relative">' +
                '<span>' + Domus.Utils.escapeHtml(relativeLabel) + '</span>' +
                '<span class="domus-task-date-exact">' + Domus.Utils.escapeHtml(dueDateLabel) + '</span>' +
                '</span>';
        }

        function getStatusLabel(status) {
            if (!status) return '';
            const normalized = String(status).toLowerCase();
            const map = {
                open: t('domus', 'Open'),
                closed: t('domus', 'Completed'),
                new: t('domus', 'New'),
                cancelled: t('domus', 'Cancelled'),
                skipped: t('domus', 'Not needed')
            };
            return map[normalized] || status;
        }

        function translateTemplateText(value) {
            const normalized = typeof value === 'string' ? value.trim() : '';
            return normalized ? t('domus', normalized) : '';
        }

        function buildStatusBadge(status) {
            const label = getStatusLabel(status);
            if (!label) {
                return '';
            }
            const normalized = String(status || '').toLowerCase();
            const badgeClass = normalized === 'closed'
                ? 'domus-badge domus-badge-success'
                : 'domus-badge domus-task-detail-badge-outline';
            return '<span class="' + badgeClass + '">' + Domus.Utils.escapeHtml(label) + '</span>';
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

        function getFileNameFromUrl(url) {
            if (!url) {
                return '';
            }
            try {
                const parsed = new URL(url, window.location.origin);
                const path = parsed.pathname || '';
                const name = path.split('/').filter(Boolean).pop() || '';
                return decodeURIComponent(name);
            } catch (error) {
                const fallback = String(url).split('?')[0].split('#')[0];
                const name = fallback.split('/').filter(Boolean).pop() || '';
                return name;
            }
        }

        function buildDetailBadge(label, modifier = '') {
            const classes = ['domus-badge'];
            if (modifier) {
                classes.push(modifier);
            } else {
                classes.push('domus-badge-muted');
            }
            return '<span class="' + Domus.Utils.escapeHtml(classes.join(' ')) + '">' + Domus.Utils.escapeHtml(label) + '</span>';
        }

        function getEntityTypeLabel(entityType) {
            return entityType === 'property' ? t('domus', 'Property') : t('domus', 'Unit');
        }

        function getEntityName(task = {}) {
            return task.entityName || task.unitName || '';
        }

        function getEntityImageUrl(task = {}) {
            return task.entityImageUrl || task.unitImageUrl || '';
        }

        function buildTaskEntityImage(task = {}, variant = 'task', className = '') {
            const entityType = task.entityType === 'property' ? 'property' : 'unit';
            const entityName = getEntityName(task);
            return Domus.UI.buildEntityImage(entityType, {
                resolvedImageUrl: getEntityImageUrl(task),
                name: entityName,
                unitName: entityName
            }, {
                variant,
                rounded: true,
                className,
                alt: entityName || getEntityTypeLabel(entityType)
            });
        }

        function buildTaskDetailDataset(task = {}) {
            const isProcessTask = (task.type || '') === 'process' || !!(task.runId || task.workflowRunId);
            const title = isProcessTask ? (translateTemplateText(task.title) || task.title || '') : (task.title || '');
            const description = isProcessTask ? (translateTemplateText(task.description) || task.description || '') : (task.description || '');
            const workflowName = isProcessTask ? (translateTemplateText(task.workflowName) || task.workflowName || '') : (task.workflowName || '');
            return {
                'task-detail': 'true',
                'task-title': title,
                'task-description': description,
                'task-action-type': task.actionType || '',
                'task-action-url': task.actionUrl || '',
                'task-action-year': task.year || '',
                'task-id': task.taskId || '',
                'task-step-id': task.stepId || '',
                'task-run-id': task.runId || task.workflowRunId || '',
                'task-entity-type': task.entityType || 'unit',
                'task-entity-id': task.entityId || task.unitId || '',
                'task-entity-name': getEntityName(task),
                'task-entity-image-url': getEntityImageUrl(task),
                'task-workflow-name': workflowName,
                'task-due-date': task.dueDate || '',
                'task-type': task.type || 'task',
                'task-status': task.status || 'open',
                'task-completion-completed': task.completion?.completed || '',
                'task-completion-total': task.completion?.total || ''
            };
        }

        function getTaskDetailFromElement(element) {
            return {
                title: element.getAttribute('data-task-title') || '',
                description: element.getAttribute('data-task-description') || '',
                actionType: element.getAttribute('data-task-action-type') || '',
                actionUrl: element.getAttribute('data-task-action-url') || '',
                actionYear: element.getAttribute('data-task-action-year') || '',
                taskId: element.getAttribute('data-task-id') || '',
                stepId: element.getAttribute('data-task-step-id') || '',
                runId: element.getAttribute('data-task-run-id') || '',
                entityType: element.getAttribute('data-task-entity-type') || 'unit',
                entityId: element.getAttribute('data-task-entity-id') || '',
                entityName: element.getAttribute('data-task-entity-name') || '',
                entityImageUrl: element.getAttribute('data-task-entity-image-url') || '',
                workflowName: element.getAttribute('data-task-workflow-name') || '',
                dueDate: element.getAttribute('data-task-due-date') || '',
                type: element.getAttribute('data-task-type') || 'task',
                status: element.getAttribute('data-task-status') || 'open',
                completion: {
                    completed: element.getAttribute('data-task-completion-completed') || '',
                    total: element.getAttribute('data-task-completion-total') || ''
                }
            };
        }

        function wrapProcessSequenceTrigger(runId, contentHtml, title) {
            if (!runId || !contentHtml) {
                return contentHtml || '';
            }
            return '<span class="domus-task-process-trigger" data-process-sequence="' + Domus.Utils.escapeHtml(String(runId)) + '" role="button" tabindex="0" aria-label="' + Domus.Utils.escapeHtml(title || t('domus', 'Open process steps')) + '">' +
                contentHtml +
                '</span>';
        }

        function buildProcessSequenceTrigger(runId, labelHtml, completion = null) {
            if (!runId) {
                return labelHtml || '';
            }
            const title = completion
                ? t('domus', 'Open process steps ({completed}/{total})', {
                    completed: completion.completed,
                    total: completion.total
                })
                : t('domus', 'Open process steps');
            const labelButton = wrapProcessSequenceTrigger(runId, labelHtml, title);
            if (!completion) {
                return labelButton;
            }
            const safeTotal = Math.max(0, Number(completion.total) || 0);
            const safeCompleted = Math.max(0, Math.min(Number(completion.completed) || 0, safeTotal || Number(completion.completed) || 0));
            const progress = safeTotal > 0 ? Math.round((safeCompleted / safeTotal) * 100) : 0;
            const circleButton = '<span class="domus-task-process-trigger domus-task-process-trigger-circle" data-process-sequence="' + Domus.Utils.escapeHtml(String(runId)) + '" role="button" tabindex="0" aria-label="' + Domus.Utils.escapeHtml(title) + '">' +
                '<span class="domus-completion-circle" style="--domus-completion-progress: ' + Domus.Utils.escapeHtml(String(progress)) + '%">' +
                '<span class="domus-visually-hidden">' + Domus.Utils.escapeHtml(title) + '</span>' +
                '</span>' +
                '</span>';
            return '<div class="domus-task-type">' + labelButton + circleButton + '</div>';
        }

        function buildTaskDetailContent(task = {}) {
            const isProcessTask = task.type === 'process';
            const translatedTitle = isProcessTask ? (translateTemplateText(task.title) || task.title || '') : (task.title || '');
            const translatedDescription = isProcessTask ? (translateTemplateText(task.description) || task.description || '') : (task.description || '');
            const translatedWorkflowName = isProcessTask ? (translateTemplateText(task.workflowName) || task.workflowName || '') : (task.workflowName || '');
            const typeLabel = task.type === 'process' ? t('domus', 'Process') : t('domus', 'Task');
            const statusLabel = getStatusLabel(task.status) || (task.type === 'process' ? t('domus', 'Open') : '');
            const actionMeta = getActionMeta(task.actionType);
            const dueHtml = buildDueDateBadge(task.dueDate);
            const completion = task.completion || {};
            const hasCompletion = task.type === 'process' && completion.total !== '' && completion.total !== null && completion.total !== undefined;
            const badges = [
                buildDetailBadge(typeLabel),
                translatedWorkflowName ? buildDetailBadge(translatedWorkflowName, 'domus-task-detail-badge-accent') : '',
                statusLabel ? buildDetailBadge(statusLabel, String(task.status).toLowerCase() === 'closed' ? 'domus-badge-success' : 'domus-task-detail-badge-outline') : ''
            ].filter(Boolean).join('');
            const entityName = getEntityName(task);
            const imageHtml = entityName
                ? buildTaskEntityImage(task, 'table', 'domus-task-detail-avatar')
                : '';
            const actionItems = [];
            if (actionMeta) {
                actionItems.push({
                    icon: actionMeta.icon,
                    label: actionMeta.label,
                    type: 'run',
                    dataset: {
                        actionType: task.actionType || '',
                        actionUrl: task.actionUrl || '',
                        actionYear: task.actionYear || '',
                        entityType: task.entityType || 'unit',
                        entityId: task.entityId || ''
                    }
                });
            }
            if (String(task.status).toLowerCase() === 'open') {
                const isProcessTask = task.type === 'process';
                if (!isProcessTask || task.taskId || task.stepId) {
                    actionItems.push({
                        icon: 'domus-icon-task',
                        label: t('domus', 'Mark done'),
                        type: 'close',
                        dataset: {
                            taskId: task.taskId || '',
                            stepId: task.stepId || ''
                        }
                    });
                }
                if (isProcessTask && task.runId) {
                    actionItems.push({
                        icon: 'domus-icon-delete',
                        label: t('domus', 'Cancel process'),
                        type: 'cancel',
                        dataset: { runId: task.runId }
                    });
                }
            }
            if (String(task.status).toLowerCase() === 'closed') {
                if (task.type === 'task' && task.taskId) {
                    actionItems.push({
                        icon: 'domus-icon-back',
                        label: t('domus', 'Reopen'),
                        type: 'reopen',
                        dataset: {
                            taskId: task.taskId || '',
                            stepId: task.stepId || ''
                        }
                    });
                }
                if ((task.type === 'task' && task.taskId) || (task.type === 'process' && task.runId)) {
                    actionItems.push({
                        icon: 'domus-icon-delete',
                        label: t('domus', 'Delete'),
                        type: 'delete',
                        dataset: {
                            taskId: task.taskId || '',
                            runId: task.runId || ''
                        }
                    });
                }
            }
            const actionListHtml = actionItems.length
                ? '<div class="domus-task-detail-actions">' + actionItems.map(item => (
                    '<div class="domus-task-detail-action-row">' +
                    Domus.UI.buildIconButton(item.icon, item.label, {
                        className: 'domus-task-detail-action-button',
                        dataset: Object.assign({ modalAction: item.type }, item.dataset)
                    }) +
                    '<span class="domus-task-detail-action-copy">' + Domus.Utils.escapeHtml(item.label) + '</span>' +
                    '</div>'
                )).join('') + '</div>'
                : '<span class="muted">—</span>';
            const completionHtml = hasCompletion
                ? '<div class="domus-task-detail-section">' +
                    '<div class="domus-task-detail-section-title">' + Domus.Utils.escapeHtml(t('domus', 'Completion')) + '</div>' +
                    wrapProcessSequenceTrigger(task.runId, Domus.UI.buildCompletionIndicator(t('domus', 'Completion'), completion.completed, completion.total, {
                        showLabel: false,
                        showCount: true
                    }), t('domus', 'Open process steps ({completed}/{total})', {
                        completed: completion.completed,
                        total: completion.total
                    })) +
                    '</div>'
                : '';
            const descriptionHtml = translatedDescription
                ? '<div class="domus-task-detail-section">' +
                    '<div class="domus-task-detail-section-title">' + Domus.Utils.escapeHtml(t('domus', 'Description')) + '</div>' +
                    '<div class="domus-task-detail-description">' + Domus.Utils.escapeHtml(translatedDescription).replace(/\n/g, '<br>') + '</div>' +
                    '</div>'
                : '';
            const attachmentHtml = task.actionType === 'url' && task.actionUrl
                ? '<div class="domus-task-detail-section">' +
                    '<div class="domus-task-detail-section-title">' + Domus.Utils.escapeHtml(t('domus', 'Attachments')) + '</div>' +
                    '<a class="domus-task-detail-attachment" href="' + Domus.Utils.escapeHtml(task.actionUrl) + '" target="_blank" rel="noopener">' +
                    '<span class="domus-icon domus-icon-document" aria-hidden="true"></span>' +
                    '<span>' + Domus.Utils.escapeHtml(getFileNameFromUrl(task.actionUrl) || t('domus', 'Open link')) + '</span>' +
                    '</a>' +
                    '</div>'
                : '';

            return '<div class="domus-task-detail-card">' +
                '<div class="domus-task-detail-header">' +
                (imageHtml ? '<div class="domus-task-detail-media">' + imageHtml + '</div>' : '') +
                '<div class="domus-task-detail-main">' +
                '<div class="domus-task-detail-title">' + Domus.Utils.escapeHtml(translatedTitle || t('domus', 'Task details')) + '</div>' +
                (entityName ? '<div class="domus-task-detail-subtitle">' + Domus.Utils.escapeHtml(entityName) + '</div>' : '') +
                '</div>' +
                '</div>' +
                (badges ? '<div class="domus-task-detail-badges">' + badges + '</div>' : '') +
                completionHtml +
                descriptionHtml +
                '<div class="domus-task-detail-meta">' +
                '<div class="domus-task-detail-meta-card">' +
                '<div class="domus-task-detail-meta-label">' + Domus.Utils.escapeHtml(t('domus', 'Due date')) + '</div>' +
                '<div class="domus-task-detail-meta-value">' + dueHtml + '</div>' +
                '</div>' +
                '<div class="domus-task-detail-meta-card">' +
                '<div class="domus-task-detail-meta-label">' + Domus.Utils.escapeHtml(t('domus', 'Actions')) + '</div>' +
                '<div class="domus-task-detail-meta-value">' + actionListHtml + '</div>' +
                '</div>' +
                '</div>' +
                attachmentHtml +
                '</div>';
        }

        function openTaskDetailModal(task) {
            const runId = task?.runId || task?.workflowRunId;
            if (task?.type === 'process' && runId) {
                openProcessTasksModalById(runId, task);
                return;
            }
            const openModalWithTask = resolvedTask => {
                let modal;
                const headerActions = [];
                const isEditableTask = resolvedTask?.type === 'task' && resolvedTask?.taskId;
                if (isEditableTask) {
                    headerActions.push(Domus.UI.buildModalAction(t('domus', 'Edit'), () => {
                        modal?.close();
                        openEditTaskModal(resolvedTask, () => {
                            Domus.Router.navigate(Domus.state.currentView, Domus.state.currentViewArgs || []);
                        });
                    }));
                }
                modal = Domus.UI.openModal({
                    title: t('domus', 'Task Details'),
                    size: 'task-detail',
                    content: buildTaskDetailContent(resolvedTask || {}),
                    headerActions
                });
                bindProcessSequenceTriggers(modal.modalEl);
                modal.modalEl.querySelectorAll('.domus-task-detail-action-button').forEach(button => {
                    button.addEventListener('click', (event) => {
                        event.preventDefault();
                        const action = button.getAttribute('data-modal-action');
                        if (action === 'cancel') {
                            const runId = button.getAttribute('data-run-id');
                            if (!runId) {
                                return;
                            }
                            Domus.UI.confirmAction({
                                message: t('domus', 'Cancel this process and delete all its steps?'),
                                confirmLabel: t('domus', 'Cancel process')
                            }).then(confirmed => {
                                if (!confirmed) {
                                    return;
                                }
                                Domus.Api.deleteWorkflowRun(runId)
                                    .then(() => {
                                        modal.close();
                                        Domus.Router.navigate(Domus.state.currentView, Domus.state.currentViewArgs || []);
                                    })
                                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
                            });
                            return;
                        }
                        if (action === 'run') {
                            runTaskAction(
                                button.getAttribute('data-action-type'),
                                button.getAttribute('data-action-url'),
                                button.getAttribute('data-action-year'),
                                button.getAttribute('data-entity-type'),
                                button.getAttribute('data-entity-id')
                            );
                            return;
                        }
                        if (action === 'close') {
                            const stepId = button.getAttribute('data-step-id');
                            const taskId = button.getAttribute('data-task-id');
                            if (!stepId && !taskId) {
                                return;
                            }
                            const request = stepId ? Domus.Api.closeTaskStep(stepId) : Domus.Api.closeTask(taskId);
                            request.then(() => {
                                modal.close();
                                Domus.Router.navigate(Domus.state.currentView, Domus.state.currentViewArgs || []);
                            }).catch(err => Domus.UI.showNotification(err.message, 'error'));
                            return;
                        }
                        if (action === 'reopen') {
                            const taskId = button.getAttribute('data-task-id') || resolvedTask?.taskId || '';
                            const stepId = button.getAttribute('data-step-id') || resolvedTask?.stepId || '';
                            if (!taskId && !stepId) {
                                return;
                            }
                            const request = taskId ? Domus.Api.reopenTask(taskId) : Domus.Api.reopenTaskStep(stepId);
                            request
                                .then(() => {
                                    Domus.UI.showNotification(taskId ? t('domus', 'Task reopened.') : t('domus', 'Step reopened.'), 'success');
                                    modal.close();
                                    Domus.Router.navigate(Domus.state.currentView, Domus.state.currentViewArgs || []);
                                })
                                .catch(err => Domus.UI.showNotification(err.message, 'error'));
                            return;
                        }
                        if (action === 'delete') {
                            const runId = button.getAttribute('data-run-id');
                            const taskId = button.getAttribute('data-task-id');
                            if (!runId && !taskId) {
                                return;
                            }
                            const entityLabel = runId ? t('domus', 'Process') : t('domus', 'Task');
                            Domus.UI.confirmAction({
                                message: t('domus', 'Delete {entity}?', { entity: entityLabel }),
                                confirmLabel: t('domus', 'Delete')
                            }).then(confirmed => {
                                if (!confirmed) {
                                    return;
                                }
                                const request = runId ? Domus.Api.deleteWorkflowRun(runId) : Domus.Api.deleteTask(taskId);
                                request.then(() => {
                                    modal.close();
                                    Domus.Router.navigate(Domus.state.currentView, Domus.state.currentViewArgs || []);
                                }).catch(err => Domus.UI.showNotification(err.message, 'error'));
                            });
                        }
                    });
                });
                modal.modalEl.querySelectorAll('.domus-task-detail-action-copy').forEach(label => {
                    const trigger = label.previousElementSibling;
                    if (!trigger || !trigger.classList.contains('domus-task-detail-action-button')) {
                        return;
                    }
                    label.setAttribute('role', 'button');
                    label.setAttribute('tabindex', '0');
                    label.addEventListener('click', (event) => {
                        event.preventDefault();
                        trigger.click();
                    });
                    label.addEventListener('keydown', (event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') {
                            return;
                        }
                        event.preventDefault();
                        trigger.click();
                    });
                });
            };

            if (task?.type === 'process' && task?.runId && (!task.completion || task.completion.total === '' || task.completion.total === null || task.completion.total === undefined)) {
                Domus.Api.getWorkflowRun(task.runId)
                    .then(run => {
                        const steps = run?.steps || [];
                        openModalWithTask(Object.assign({}, task, {
                            completion: {
                                completed: steps.filter(step => step.status === 'closed').length,
                                total: steps.length
                            }
                        }));
                    })
                    .catch(() => openModalWithTask(task));
                return;
            }

            openModalWithTask(task);
        }

        function openEditTaskModal(task, onSaved) {
            if (!task?.taskId) {
                return;
            }

            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Title'),
                    required: true,
                    content: '<input id="domus-task-edit-title" name="title" required value="' + Domus.Utils.escapeHtml(task.title || '') + '">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Description'),
                    content: '<textarea id="domus-task-edit-description" name="description">' + Domus.Utils.escapeHtml(task.description || '') + '</textarea>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Due date'),
                    content: '<input id="domus-task-edit-due-date" name="dueDate" type="date" value="' + Domus.Utils.escapeHtml(task.dueDate || '') + '">'
                })
            ];

            const content = '<div class="domus-form"><form id="domus-task-edit-form">' +
                Domus.UI.buildFormTable(rows) +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-task-edit-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>' +
                '</form></div>';

            const modal = Domus.UI.openModal({
                title: t('domus', 'Edit {entity}', { entity: t('domus', 'Task') }),
                content
            });
            const form = modal.modalEl.querySelector('#domus-task-edit-form');
            const titleInput = modal.modalEl.querySelector('#domus-task-edit-title');
            const descriptionInput = modal.modalEl.querySelector('#domus-task-edit-description');
            const dueDateInput = modal.modalEl.querySelector('#domus-task-edit-due-date');

            modal.protectChanges();
            modal.modalEl.querySelector('#domus-task-edit-cancel')?.addEventListener('click', modal.requestClose);
            form?.addEventListener('submit', (event) => {
                event.preventDefault();
                const titleValue = (titleInput?.value || '').trim();
                if (!titleValue) {
                    Domus.UI.showNotification(t('domus', 'Title is required.'), 'error');
                    return;
                }

                Domus.Api.updateTask(task.taskId, {
                    title: titleValue,
                    description: descriptionInput?.value || '',
                    dueDate: dueDateInput?.value || ''
                })
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Task saved.'), 'success');
                        modal.close();
                        onSaved && onSaved();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function buildOpenTasksTable(items, options = {}) {
            const sorted = sortOpenItems(items || []);
            const showUnit = options.showUnit !== false;
            const showTitle = options.showTitle !== false;
            const showType = options.showType !== false;
            const showAction = options.showAction !== false;
            const showHeader = options.showHeader !== false;
            const wrapPanel = options.wrapPanel !== false;
            const titleBelowUnit = options.titleBelowUnit === true;

            if (options.layout === 'overviewCards') {
                return buildOpenTasksOverviewList(sorted, {
                    showUnit,
                    showTitle,
                    showType,
                    showAction,
                    wrapPanel,
                    titleBelowUnit,
                    showRelativeDueDate: options.showRelativeDueDate === true,
                    emptyMessage: options.emptyMessage,
                    emptyActionId: options.emptyActionId,
                    emptyIconClass: options.emptyIconClass
                });
            }

            const headers = [
                showUnit ? t('domus', 'Object') : null,
                showTitle ? t('domus', 'Title') : null,
                { label: t('domus', 'Due date'), alignRight: true, className: 'domus-task-date-cell' },
                showType ? t('domus', 'Type') : null,
                showAction ? { label: t('domus', 'Action'), alignRight: true } : null
            ].filter(item => item !== null);
            const rows = sorted.map(item => {
                const itemTitle = item.type === 'process'
                    ? translateTemplateText(item.title) || item.title || ''
                    : item.title || '';
                const workflowName = item.type === 'process'
                    ? translateTemplateText(item.workflowName) || item.workflowName || ''
                    : item.workflowName || '';
                const titleMarkup = '<span class="domus-task-title">' + Domus.Utils.escapeHtml(itemTitle) + '</span>';
                const entityType = item.entityType || 'unit';
                const entityId = item.entityId || '';
                const navigateTarget = entityType === 'property' ? 'propertyDetail' : 'unitDetail';
                const entityName = getEntityName(item);
                const unitText = titleBelowUnit
                    ? '<span class="domus-task-unit-copy">' +
                        titleMarkup +
                        (entityName ? '<span class="domus-task-unit-subtitle">' + Domus.Utils.escapeHtml(entityName) + '</span>' : '') +
                        '</span>'
                    : '<span>' + Domus.Utils.escapeHtml(entityName || '') + '</span>';
                const unitCell = showUnit
                    ? '<a class="domus-link domus-task-unit-link" href="#/' + Domus.Utils.escapeHtml(navigateTarget) + '/' + encodeURIComponent(String(entityId || '')) + '" data-navigate="' + Domus.Utils.escapeHtml(navigateTarget) + '" data-args="' + Domus.Utils.escapeHtml(String(entityId || '')) + '">' +
                        buildTaskEntityImage(item, 'task') +
                        unitText +
                        '</a>'
                    : '';
                const titleParts = [];
                titleParts.push('<button type="button" class="domus-table-action-button domus-task-detail-open">' + titleMarkup + '</button>');
                if (workflowName) {
                    titleParts.push('<div class="domus-task-subtitle">' + Domus.Utils.escapeHtml(workflowName) + '</div>');
                }
                const dueHtml = buildDueDateBadge(item.dueDate, { showRelative: options.showRelativeDueDate });
                const actionMeta = getActionMeta(item.actionType);
                const runActionBtn = showAction && actionMeta
                    ? Domus.UI.buildIconButton(actionMeta.icon, actionMeta.label, {
                        className: 'domus-task-run-action',
                        dataset: {
                            type: item.type || '',
                            actionType: item.actionType || '',
                            actionUrl: item.actionUrl || '',
                            actionYear: item.year || '',
                            entityType,
                            entityId
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
                let typeCell = showType ? buildTypeBadge(item.type) : null;
                if (showType && item.type === 'process' && item.completion) {
                    typeCell = buildProcessSequenceTrigger(item.runId || item.workflowRunId, typeCell, item.completion);
                }
                const cells = [
                    showUnit ? unitCell : null,
                    showTitle ? titleParts.join('') : null,
                    { content: dueHtml, alignRight: true, className: 'domus-task-date-cell' },
                    typeCell,
                    showAction ? actionBtn : null
                ].filter(itemCell => itemCell !== null);
                return {
                    cells,
                    dataset: buildTaskDetailDataset(item),
                    className: 'domus-task-row' + ((!showUnit && item.type === 'process') ? ' domus-task-process-row' : '')
                };
            });

            if (!rows.length && options.emptyMessage) {
                return Domus.UI.buildEmptyStateAction(options.emptyMessage, {
                    iconClass: options.emptyIconClass,
                    actionId: options.emptyActionId
                });
            }
            return Domus.UI.buildTable(headers, rows, { wrapPanel, showHeader });
        }

        function buildOpenTasksOverviewList(items, options = {}) {
            if (!(items || []).length && options.emptyMessage) {
                return Domus.UI.buildEmptyStateAction(options.emptyMessage, {
                    iconClass: options.emptyIconClass,
                    actionId: options.emptyActionId
                });
            }
            let html = '<div class="domus-overview-list domus-task-overview-list">';
            (items || []).forEach(item => {
                const itemTitle = item.type === 'process'
                    ? translateTemplateText(item.title) || item.title || ''
                    : item.title || '';
                const workflowName = item.type === 'process'
                    ? translateTemplateText(item.workflowName) || item.workflowName || ''
                    : item.workflowName || '';
                const titleMarkup = '<span class="domus-task-title">' + Domus.Utils.escapeHtml(itemTitle) + '</span>';
                const entityType = item.entityType || 'unit';
                const entityId = item.entityId || '';
                const navigateTarget = entityType === 'property' ? 'propertyDetail' : 'unitDetail';
                const entityName = getEntityName(item);
                const unitText = options.titleBelowUnit
                    ? '<span class="domus-task-unit-copy">' +
                        titleMarkup +
                        (entityName ? '<span class="domus-task-unit-subtitle">' + Domus.Utils.escapeHtml(entityName) + '</span>' : '') +
                        (workflowName ? '<span class="domus-task-subtitle">' + Domus.Utils.escapeHtml(workflowName) + '</span>' : '') +
                        '</span>'
                    : '<span>' + Domus.Utils.escapeHtml(entityName || '') + '</span>';
                const unitCell = options.showUnit
                    ? '<div class="domus-task-overview-cell domus-task-overview-cell-object">' +
                        '<span class="domus-link domus-task-unit-link" data-navigate="' + Domus.Utils.escapeHtml(navigateTarget) + '" data-args="' + Domus.Utils.escapeHtml(String(entityId || '')) + '">' +
                        buildTaskEntityImage(item, 'task') +
                        unitText +
                        '</span>' +
                        '</div>'
                    : '';
                const titleParts = [];
                titleParts.push(titleMarkup);
                if (workflowName) {
                    titleParts.push('<div class="domus-task-subtitle">' + Domus.Utils.escapeHtml(workflowName) + '</div>');
                }
                const dueHtml = buildDueDateBadge(item.dueDate, { showRelative: options.showRelativeDueDate });
                const actionMeta = getActionMeta(item.actionType);
                const runActionBtn = options.showAction && actionMeta
                    ? Domus.UI.buildIconButton(actionMeta.icon, actionMeta.label, {
                        className: 'domus-task-run-action',
                        dataset: {
                            type: item.type || '',
                            actionType: item.actionType || '',
                            actionUrl: item.actionUrl || '',
                            actionYear: item.year || '',
                            entityType,
                            entityId
                        }
                    })
                    : '';
                const actionCell = options.showAction
                    ? '<div class="domus-task-overview-cell domus-task-overview-cell-action">' +
                        '<div class="domus-task-action-buttons">' +
                        (runActionBtn || '<span class="domus-task-action-spacer"></span>') +
                        Domus.UI.buildIconButton('domus-icon-task', t('domus', 'Mark done'), {
                            className: 'domus-task-close',
                            dataset: {
                                type: item.type || '',
                                id: item.stepId || item.taskId || ''
                            }
                        }) +
                        '</div>' +
                        '</div>'
                    : '';
                let typeCell = '';
                if (options.showType) {
                    typeCell = buildTypeBadge(item.type);
                    if (item.type === 'process' && item.completion) {
                        typeCell = buildProcessSequenceTrigger(item.runId || item.workflowRunId, typeCell, item.completion);
                    }
                    typeCell = '<div class="domus-task-overview-cell domus-task-overview-cell-type">' + typeCell + '</div>';
                }

                let dataAttrs = '';
                const dataset = buildTaskDetailDataset(item);
                Object.keys(dataset).forEach(key => {
                    const value = dataset[key];
                    if (value === undefined || value === null) {
                        return;
                    }
                    dataAttrs += ' data-' + Domus.Utils.escapeHtml(key) + '="' + Domus.Utils.escapeHtml(String(value)) + '"';
                });

                html += '<article class="domus-overview-card domus-task-overview-card"' + dataAttrs + ' tabindex="0" role="button">' +
                    unitCell +
                    (options.showTitle ? '<div class="domus-task-overview-cell domus-task-overview-cell-title">' + titleParts.join('') + '</div>' : '') +
                    '<div class="domus-task-overview-cell domus-task-overview-cell-due">' + dueHtml + '</div>' +
                    typeCell +
                    actionCell +
                    '</article>';
            });
            html += '</div>';
            return html;
        }

        function buildDashboardTaskGroups(items, options = {}) {
            const sorted = sortOpenItems(items || []);
            const listOptions = Object.assign({
                showUnit: true,
                showTitle: false,
                showType: false,
                showAction: false,
                titleBelowUnit: true,
                showRelativeDueDate: true
            }, options);
            if (!sorted.length) {
                const html = buildOpenTasksOverviewList([], listOptions);
                return options.firstGroupInPanelHeader ? { html, firstGroup: null } : html;
            }
            const groups = { overdue: [], today: [], later: [] };
            sorted.forEach(item => {
                const offset = getDayOffset(item.dueDate);
                groups[offset !== null && offset < 0 ? 'overdue' : offset === 0 ? 'today' : 'later'].push(item);
            });
            let firstGroup = null;
            const html = [
                ['overdue', t('domus', 'Overdue')],
                ['today', t('domus', 'Today')],
                ['later', t('domus', 'Later')]
            ].filter(([key]) => groups[key].length).map(([key, label], index) => {
                if (index === 0) {
                    firstGroup = { key, label, count: groups[key].length };
                }
                const title = options.firstGroupInPanelHeader && index === 0 ? '' :
                    '<h3 class="domus-dashboard-task-group-title">' + Domus.Utils.escapeHtml(label) +
                    ' <span class="domus-dashboard-task-count">' + groups[key].length + '</span></h3>';
                return '<section class="domus-dashboard-task-group domus-dashboard-task-group-' + key + '">' +
                    title + buildOpenTasksOverviewList(groups[key], listOptions) + '</section>';
            }).join('');
            return options.firstGroupInPanelHeader ? { html, firstGroup } : html;
        }

        function bindOpenTaskActions(options = {}) {
            bindTaskDetailRows();
            bindTaskDetailCards();
            bindProcessSequenceTriggers();
            bindTaskUnitLinks();
            document.querySelectorAll('.domus-task-run-action').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const actionType = btn.getAttribute('data-action-type');
                    const actionUrl = btn.getAttribute('data-action-url');
                    const actionYear = btn.getAttribute('data-action-year');
                    const entityType = btn.getAttribute('data-entity-type');
                    const entityId = btn.getAttribute('data-entity-id');
                    if (!actionType) return;
                    runTaskAction(actionType, actionUrl, actionYear, entityType, entityId, options.onRefresh);
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

        function bindTaskDetailCards(root = document) {
            root.querySelectorAll('.domus-task-overview-card[data-task-detail]').forEach(card => {
                if (card.dataset.domusTaskDetailBound) {
                    return;
                }
                card.dataset.domusTaskDetailBound = 'true';
                card.addEventListener('click', (event) => {
                    if (event.target.closest('a') || event.target.closest('button') || event.target.closest('input') || event.target.closest('select') || event.target.closest('textarea') || event.target.closest('[data-navigate]') || event.target.closest('[data-process-sequence]')) {
                        return;
                    }
                    openTaskDetailModal(getTaskDetailFromElement(card));
                });
                card.addEventListener('keydown', event => {
                    if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) {
                        return;
                    }
                    event.preventDefault();
                    openTaskDetailModal(getTaskDetailFromElement(card));
                });
            });
        }

        function runTaskAction(actionType, actionUrl, actionYear, entityType, entityId, onComplete) {
            if (actionType === 'url') {
                if (!actionUrl) {
                    Domus.UI.showNotification(t('domus', 'Link URL is required.'), 'error');
                    return;
                }
                window.open(actionUrl, '_blank', 'noopener');
                return;
            }

            if (!entityType || !entityId) {
                Domus.UI.showNotification(t('domus', 'Object is required.'), 'error');
                return;
            }

            if (actionType === 'document') {
                Domus.Documents.openLinkModal(entityType, entityId, onComplete);
                return;
            }

            if (actionType === 'closeBookingYear') {
                if (entityType !== 'unit') {
                    Domus.UI.showNotification(t('domus', 'Action not supported.'), 'error');
                    return;
                }
                const yearValue = parseInt(actionYear || Domus.state.currentYear, 10);
                Domus.Api.getUnitStatistics(entityId)
                    .then(statistics => {
                        if (Domus.Units?.openYearStatusModal) {
                            Domus.Units.openYearStatusModal(entityId, statistics, onComplete, { defaultYear: yearValue });
                        } else {
                            Domus.UI.showNotification(t('domus', 'Action not supported.'), 'error');
                        }
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
                return;
            }

            if (actionType === 'booking' && entityType === 'property') {
                Domus.Bookings.openCreateModal({ propertyId: entityId }, onComplete, {
                    accountFilter: (nr) => String(nr).startsWith('2')
                });
                return;
            }

            if (entityType !== 'unit') {
                Domus.UI.showNotification(t('domus', 'Action not supported.'), 'error');
                return;
            }

            Domus.Api.get('/units/' + entityId)
                .then(unit => {
                    if (actionType === 'booking') {
                        Domus.Bookings.openCreateModal({ propertyId: unit?.propertyId, unitId: entityId }, onComplete, {
                            accountFilter: (nr) => String(nr).startsWith('2'),
                            hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                        });
                        return;
                    }
                    if (actionType === 'serviceChargeReport') {
                        Domus.UnitSettlements.openModal(entityId, onComplete);
                        return;
                    }
                    Domus.UI.showNotification(t('domus', 'Action not supported.'), 'error');
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function openNewTaskModal(options = {}) {
            const entityType = options.entityType || null;
            const entityId = options.entityId || null;
            const onSaved = options.onSaved;
            const requireEntitySelect = options.requireEntitySelect;
            const propertyId = options.propertyId || null;
            const loadData = [
                Domus.Api.getTaskTemplates(true, entityType || undefined),
                requireEntitySelect ? Promise.all([
                    Domus.Api.getProperties().catch(() => []),
                    Domus.Api.getUnits(propertyId).catch(() => [])
                ]) : Promise.resolve(null),
                !requireEntitySelect && entityId
                    ? (entityType === 'unit' ? Domus.Api.get('/units/' + entityId) : Domus.Api.getProperty(entityId)).catch(() => null)
                    : Promise.resolve(null)
            ];

            Promise.all(loadData)
                .then(([templates, entityLists, currentEntity]) => {
                    const allTemplates = templates || [];
                    const getTemplateById = (templateId, selectedEntityType) => allTemplates.find(template => (
                        String(template.id) === String(templateId)
                        && (!selectedEntityType || template.appliesTo === selectedEntityType)
                    )) || null;
                    const buildTemplateOptions = (selectedEntityType) => ['<option value="">' + Domus.Utils.escapeHtml(t('domus', 'Single task')) + '</option>']
                        .concat(allTemplates
                            .filter(template => !selectedEntityType || template.appliesTo === selectedEntityType)
                            .map(template => (
                                '<option value="' + Domus.Utils.escapeHtml(String(template.id)) + '">' +
                                Domus.Utils.escapeHtml(t('domus', 'Process from template: {name}', { name: translateTemplateText(template.name) || template.name || '' })) +
                                '</option>'
                            ))).join('');

                    let entitySelectRow = '';
                    if (requireEntitySelect) {
                        const [properties, units] = entityLists || [[], []];
                        const entityOptions = [];
                        (properties || []).forEach(property => {
                            entityOptions.push({
                                value: 'property:' + property.id,
                                entityType: 'property',
                                label: (property.name || `${t('domus', 'Property')} #${property.id}`)
                            });
                        });
                        (units || []).forEach(unit => {
                            const label = unit.label || `${t('domus', 'Unit')} #${unit.id}`;
                            entityOptions.push({
                                value: 'unit:' + unit.id,
                                entityType: 'unit',
                                label: label
                            });
                        });
                        if (!entityOptions.length) {
                            Domus.UI.showNotification(t('domus', 'No {entity} available.', { entity: t('domus', 'Objects') }), 'error');
                            return;
                        }
                        entitySelectRow = Domus.UI.buildFormRow({
                            label: t('domus', 'Object'),
                            required: true,
                            content: '<select id="domus-task-entity" name="entityRef" required>' + entityOptions.map(option => (
                                '<option value="' + Domus.Utils.escapeHtml(option.value) + '" data-entity-type="' + Domus.Utils.escapeHtml(option.entityType) + '">' +
                                Domus.Utils.escapeHtml(option.label) +
                                '</option>'
                            )).join('') + '</select>'
                        });
                    }

                    const rows = [
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Type of work'),
                            helpText: t('domus', 'A single task is one item with an optional due date. A process follows the selected template’s steps in order.'),
                            content: '<select id="domus-task-template" name="templateId">' + buildTemplateOptions(entityType || null) + '</select>'
                        }),
                        entitySelectRow,
                        Domus.UI.buildFormRow({
                            label: t('domus', 'For'),
                            content: '<div id="domus-task-target" class="domus-form-value-text"></div>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Title'),
                            required: true,
                            content: '<input id="domus-task-title" name="title" required>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Description'),
                            content: '<textarea id="domus-task-description" name="description"></textarea>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Due date'),
                            content: '<input id="domus-task-due-date" name="dueDate" type="date">'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Process preview'),
                            className: 'domus-task-create-preview-row',
                            content: '<div id="domus-task-process-preview" class="domus-task-create-preview" aria-live="polite"></div>'
                        })
                    ].filter(Boolean);

                    const content = '<div class="domus-form"><form id="domus-task-create-form">' +
                        Domus.UI.buildFormTable(rows) +
                        '<div class="domus-form-actions">' +
                        '<button type="button" id="domus-task-create-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '<button type="submit" class="primary" id="domus-task-create-submit">' + Domus.Utils.escapeHtml(t('domus', 'Create task')) + '</button>' +
                        '</div>' +
                        '</form></div>';

                    const modal = Domus.UI.openModal({ title: t('domus', 'New task'), content });
                    const form = modal.modalEl.querySelector('#domus-task-create-form');
                    const entitySelect = modal.modalEl.querySelector('#domus-task-entity');
                    const templateSelect = modal.modalEl.querySelector('#domus-task-template');
                    const titleInput = modal.modalEl.querySelector('#domus-task-title');
                    const descriptionInput = modal.modalEl.querySelector('#domus-task-description');
                    const dueDateInput = modal.modalEl.querySelector('#domus-task-due-date');
                    const descriptionRow = descriptionInput?.closest('.domus-form-row');
                    const dueDateRow = dueDateInput?.closest('.domus-form-row');
                    const submitBtn = modal.modalEl.querySelector('#domus-task-create-submit');
                    const targetEl = modal.modalEl.querySelector('#domus-task-target');
                    const previewEl = modal.modalEl.querySelector('#domus-task-process-preview');
                    const previewRow = previewEl?.closest('.domus-form-row');
                    const modalHeading = modal.modalEl.querySelector('.domus-modal-header h3');
                    let previewRequest = 0;
                    let readyTemplateId = '';
                    let automaticTitle = '';
                    let singleTaskDescription = '';
                    let previousHadTemplate = false;

                    function resolveSelectedEntity() {
                        if (!requireEntitySelect) {
                            return { entityType, entityId };
                        }
                        const value = entitySelect?.value || '';
                        const parts = value.split(':');
                        return {
                            entityType: parts[0] || '',
                            entityId: parts[1] || ''
                        };
                    }

                    function updateTemplateState() {
                        const selectedEntity = resolveSelectedEntity();
                        if (templateSelect && requireEntitySelect) {
                            const currentValue = templateSelect.value;
                            templateSelect.innerHTML = buildTemplateOptions(selectedEntity.entityType || null);
                            if (currentValue && Array.from(templateSelect.options).some(option => option.value === currentValue)) {
                                templateSelect.value = currentValue;
                            }
                        }
                        const hasTemplate = !!templateSelect?.value;
                        const selectedTemplate = hasTemplate
                            ? getTemplateById(templateSelect?.value || '', selectedEntity.entityType || null)
                            : null;
                        if (titleInput) {
                            if (hasTemplate && (!titleInput.value || titleInput.value === automaticTitle)) {
                                titleInput.value = translateTemplateText(selectedTemplate?.name) || selectedTemplate?.name || '';
                                automaticTitle = titleInput.value;
                            } else if (!hasTemplate && titleInput.value === automaticTitle) {
                                titleInput.value = '';
                                automaticTitle = '';
                            }
                        }
                        if (descriptionInput) {
                            if (hasTemplate) {
                                if (!previousHadTemplate) singleTaskDescription = descriptionInput.value;
                                descriptionInput.value = translateTemplateText(selectedTemplate?.description || '');
                            } else if (previousHadTemplate) {
                                descriptionInput.value = singleTaskDescription;
                            }
                            descriptionInput.disabled = hasTemplate;
                        }
                        previousHadTemplate = hasTemplate;
                        if (descriptionRow) {
                            descriptionRow.style.display = hasTemplate ? 'none' : '';
                        }
                        if (dueDateInput) {
                            dueDateInput.disabled = hasTemplate;
                        }
                        if (dueDateRow) {
                            dueDateRow.style.display = hasTemplate ? 'none' : '';
                        }
                        if (submitBtn) {
                            submitBtn.textContent = hasTemplate ? t('domus', 'Start process') : t('domus', 'Create task');
                        }
                        if (modalHeading) {
                            modalHeading.textContent = hasTemplate ? t('domus', 'New process') : t('domus', 'New task');
                        }
                        const selectedOption = entitySelect?.selectedOptions?.[0];
                        const entityLabel = selectedOption?.textContent?.trim()
                            || (entityType === 'unit' ? currentEntity?.label : currentEntity?.name)
                            || t('domus', '{entity} #{id}', {
                                entity: selectedEntity.entityType === 'unit' ? t('domus', 'Unit') : t('domus', 'Property'),
                                id: selectedEntity.entityId
                            });
                        if (targetEl) {
                            targetEl.textContent = entityLabel;
                        }
                        const request = ++previewRequest;
                        readyTemplateId = '';
                        if (previewRow) {
                            previewRow.style.display = hasTemplate ? '' : 'none';
                        }
                        if (!hasTemplate) {
                            if (submitBtn) submitBtn.disabled = false;
                            if (previewEl) previewEl.innerHTML = '';
                            return;
                        }
                        if (submitBtn) submitBtn.disabled = true;
                        if (previewEl) previewEl.textContent = t('domus', 'Loading process steps…');
                        Domus.Api.getTaskTemplate(selectedTemplate.id)
                            .then(template => {
                                if (request !== previewRequest) return;
                                const steps = (template.steps || []).slice().sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
                                if (!steps.length) {
                                    previewEl.textContent = t('domus', 'This template has no steps and cannot be started.');
                                    return;
                                }
                                const description = translateTemplateText(template.description || '') ||
                                    t('domus', '{name} has {count} steps, from {first} to {last}.', {
                                        name: translateTemplateText(template.name) || template.name || '',
                                        count: steps.length,
                                        first: translateTemplateText(steps[0].title) || steps[0].title || '',
                                        last: translateTemplateText(steps[steps.length - 1].title) || steps[steps.length - 1].title || ''
                                    });
                                const schedule = t('domus', 'The first step opens when you start the process. Each following step opens when the previous step is completed. Its due date is set from that opening day using the offset shown below.');
                                previewEl.innerHTML = '<p>' + Domus.Utils.escapeHtml(description) + '</p>' +
                                    '<p class="muted">' + Domus.Utils.escapeHtml(schedule) + '</p>' +
                                    '<ol>' + steps.map(step => {
                                        const offset = Number(step.defaultDueDaysOffset) || 0;
                                        const dueRule = offset === 0
                                            ? t('domus', 'Due on opening day')
                                            : offset > 0
                                                ? t('domus', 'Due {days} days after opening', { days: offset })
                                                : t('domus', 'Due {days} days before opening', { days: -offset });
                                        return '<li><strong>' + Domus.Utils.escapeHtml(translateTemplateText(step.title) || step.title || '') + '</strong>' +
                                            '<span class="muted">' + Domus.Utils.escapeHtml(dueRule) + '</span></li>';
                                    }).join('') + '</ol>';
                                readyTemplateId = String(template.id);
                                if (submitBtn) submitBtn.disabled = false;
                            })
                            .catch(err => {
                                if (request !== previewRequest) return;
                                if (previewEl) previewEl.textContent = t('domus', 'Could not load process steps: {error}', { error: err.message });
                            });
                    }

                    entitySelect?.addEventListener('change', updateTemplateState);
                    templateSelect?.addEventListener('change', updateTemplateState);
                    updateTemplateState();

                    modal.protectChanges();
                    modal.modalEl.querySelector('#domus-task-create-cancel')?.addEventListener('click', modal.requestClose);
                    form?.addEventListener('submit', (event) => {
                        event.preventDefault();
                        const selectedTemplateId = templateSelect?.value || '';
                        const selectedEntity = resolveSelectedEntity();
                        if (!selectedEntity.entityType || !selectedEntity.entityId) {
                            Domus.UI.showNotification(t('domus', 'Object is required.'), 'error');
                            return;
                        }

                        if (selectedTemplateId) {
                            if (selectedTemplateId !== readyTemplateId) return;
                            const titleValue = (titleInput?.value || '').trim();
                            const selected = templateSelect?.selectedOptions?.[0];
                            const fallbackTitle = (selected?.textContent || '').trim();
                            const payload = {
                                templateId: parseInt(selectedTemplateId, 10),
                                name: titleValue || fallbackTitle
                            };
                            Domus.Api.startWorkflowRun(selectedEntity.entityType, selectedEntity.entityId, payload)
                                .then(() => {
                                    Domus.UI.showNotification(t('domus', 'Process started.'), 'success');
                                    modal.close();
                                    onSaved && onSaved();
                                })
                                .catch(err => Domus.UI.showNotification(err.message, 'error'));
                            return;
                        }

                        const titleValue = (titleInput?.value || '').trim();
                        if (!titleValue) {
                            Domus.UI.showNotification(t('domus', 'Title is required.'), 'error');
                            return;
                        }
                        const payload = {
                            title: titleValue,
                            description: descriptionInput?.value || '',
                            dueDate: dueDateInput?.value || ''
                        };
                        Domus.Api.createTask(selectedEntity.entityType, selectedEntity.entityId, payload)
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

        function openCreateTaskModal(entityType, entityId, onSaved) {
            openNewTaskModal({ entityType, entityId, onSaved });
        }

        function openCreateTaskModalWithUnitSelect(onSaved, options = {}) {
            openNewTaskModal(Object.assign({}, options, { onSaved, requireEntitySelect: true }));
        }

        function openDescriptionModal(title, description, actionType, actionUrl) {
            const meta = getActionMeta(actionType);
            const actionLabel = Domus.Utils.escapeHtml(t('domus', 'Action'));
            const translatedTitle = translateTemplateText(title) || title || t('domus', 'Description');
            const translatedDescription = translateTemplateText(description) || description || '';
            const descriptionHtml = description
                ? '<p>' + Domus.Utils.escapeHtml(translatedDescription).replace(/\n/g, '<br>') + '</p>'
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
            Domus.UI.openModal({ title: translatedTitle, content });
        }

        function buildProcessDetailContent(run, context = {}) {
            const escape = Domus.Utils.escapeHtml;
            const steps = run.steps || [];
            const currentIndex = steps.findIndex(step => step.status === 'open');
            const completed = steps.filter(step => step.status === 'closed').length;
            const skipped = steps.filter(step => step.status === 'skipped').length;
            const firstSkippedId = steps.find(step => step.status === 'skipped')?.id;
            const progressLabel = t('domus', '{completed} of {total} completed', { completed, total: steps.length }) +
                (skipped ? ' · ' + t('domus', '{count} not needed', { count: skipped }) : '');
            const currentLabel = currentIndex >= 0
                ? t('domus', 'Step {step} of {total}', { step: currentIndex + 1, total: steps.length })
                : run.completionType === 'early' ? t('domus', 'Completed early') : getStatusLabel(run.status);
            const rows = steps.map((step, index) => {
                const actionMeta = step.status === 'open' ? getActionMeta(step.actionType) : null;
                const stepTitle = translateTemplateText(step.title) || step.title || '';
                const description = translateTemplateText(step.description) || step.description || '';
                const buildAction = (title, iconClass, action, prominent = false) => Domus.UI.buildQuickActionCard({
                    id: 'domus-process-' + run.id + '-' + step.id + '-' + action,
                    title,
                    iconClass,
                    compact: true,
                    prominent,
                    dataset: { processAction: action, stepId: step.id }
                });
                const workAction = actionMeta ? buildAction(actionMeta.label, actionMeta.icon, 'run', true) : '';
                const completionAction = step.status === 'open'
                    ? buildAction(t('domus', 'Mark done'), 'domus-icon-task', 'close', !actionMeta)
                    : step.status === 'closed' || (run.completionType === 'early' && step.id === firstSkippedId)
                        ? buildAction(t('domus', 'Reopen'), 'domus-icon-back', 'reopen')
                        : '';
                const earlyAction = step.status === 'open' && step.allowEarlyCompletion
                    ? buildAction(t('domus', 'Close early'), 'domus-icon-task', 'early') : '';
                return '<li><details class="domus-process-step" data-process-step="' + escape(String(step.id)) + '"' + (index === currentIndex ? ' open aria-current="step"' : '') + '>' +
                    '<summary tabindex="0"><span class="domus-process-step-number">' + (index + 1) + '</span><span class="domus-process-step-title">' + escape(stepTitle) + '</span>' + buildStatusBadge(step.status) + '</summary>' +
                    '<div class="domus-process-step-content">' +
                    (description ? '<div class="domus-task-detail-description">' + escape(description).replace(/\n/g, '<br>') + '</div>' : '') +
                    (step.status === 'open' ? '<div>' + buildDueDateBadge(step.dueDate) + '</div>' : '') +
                    (step.closedAt ? '<div class="muted">' + escape(t('domus', 'Completed')) + ': ' + escape(Domus.Utils.formatDate(step.closedAt * 1000)) + '</div>' : '') +
                    (workAction || completionAction || earlyAction ? '<div class="domus-process-step-actions">' + workAction + completionAction + earlyAction + '</div>' : '') +
                    '</div></details></li>';
            }).join('');
            const entityName = getEntityName(context);
            return '<div class="domus-process-detail">' +
                (entityName ? '<div class="domus-task-detail-subtitle">' + escape(entityName) + '</div>' : '') +
                '<div class="domus-process-progress" role="status" tabindex="-1"><strong>' + escape(currentLabel || t('domus', 'Process')) + '</strong><span>' + escape(progressLabel) + '</span></div>' +
                '<progress max="' + Math.max(steps.length, 1) + '" value="' + (completed + skipped) + '" aria-label="' + escape(progressLabel) + '"></progress>' +
                '<ol class="domus-process-steps">' + rows + '</ol>' +
                '<details class="domus-process-menu"><summary tabindex="0">' + escape(t('domus', 'More actions')) + '</summary>' +
                '<button type="button" data-process-action="refresh">' + escape(t('domus', 'Refresh process')) + '</button>' +
                '<button type="button" data-process-action="delete">' + escape(run.status === 'open' ? t('domus', 'Cancel process') : t('domus', 'Delete')) + '</button></details>' +
                '</div>';
        }

        function openProcessTasksModal(run, context = {}) {
            let changed = false;
            let closed = false;
            let busy = false;
            let needsRefresh = false;
            const parentView = Domus.state.currentView;
            const parentArgs = (Domus.state.currentViewArgs || []).slice();
            const refreshParent = () => {
                if (Domus.state.currentView === parentView && JSON.stringify(Domus.state.currentViewArgs || []) === JSON.stringify(parentArgs)) {
                    if (parentView === 'unitDetail') processFocusContext = { view: parentView, args: parentArgs };
                    Domus.Router.navigate(parentView, parentArgs);
                }
            };
            const modal = Domus.UI.openModal({
                title: translateTemplateText(run.name) || run.name || t('domus', 'Process'),
                size: 'process-detail',
                content: buildProcessDetailContent(run, context),
                onClose: () => {
                    closed = true;
                    if (changed) refreshParent();
                }
            });
            const body = modal.modalEl.querySelector('.domus-modal-body');
            const reload = () => Domus.Api.getWorkflowRun(run.id).then(updated => {
                run = updated;
                needsRefresh = false;
                if (closed) return;
                body.innerHTML = buildProcessDetailContent(run, context);
                bindActions();
                (body.querySelector('.domus-process-step[open] summary') || body.querySelector('.domus-process-progress'))?.focus();
            });
            const setBusy = value => {
                busy = value;
                body.setAttribute('aria-busy', String(value));
                body.querySelectorAll('button').forEach(button => {
                    button.disabled = value || (needsRefresh && ['run', 'close', 'reopen', 'early'].includes(button.dataset.processAction));
                });
            };
            const bindActions = () => {
                body.querySelectorAll('[data-process-action]').forEach(button => {
                    button.addEventListener('click', async () => {
                        if (busy) return;
                        const action = button.dataset.processAction;
                        const step = (run.steps || []).find(item => String(item.id) === button.dataset.stepId);
                        if (action === 'run' && step?.status === 'open') {
                            runTaskAction(step.actionType, step.actionUrl, run.year, run.entityType, run.entityId, () => {
                                changed = true;
                                if (closed) refreshParent();
                                // Optional work never completes a step implicitly.
                            });
                            return;
                        }
                        setBusy(true);
                        try {
                            if (action === 'refresh') {
                                await reload();
                                return;
                            }
                            if (action === 'delete') {
                                const isOpen = run.status === 'open';
                                const confirmed = await Domus.UI.confirmAction({
                                    message: isOpen ? t('domus', 'Cancel this process and delete all its steps?') : t('domus', 'Delete {entity}?', { entity: t('domus', 'Process') }),
                                    confirmLabel: isOpen ? t('domus', 'Cancel process') : t('domus', 'Delete')
                                });
                                if (!confirmed || closed) return;
                                await Domus.Api.deleteWorkflowRun(run.id);
                                changed = true;
                                modal.close();
                                return;
                            }
                            if (action === 'early' && step?.status === 'open' && step.allowEarlyCompletion) {
                                const confirmed = await Domus.UI.confirmAction({
                                    message: t('domus', 'Confirm that this process has been successfully resolved? Remaining steps will be marked as not needed.'),
                                    confirmLabel: t('domus', 'Close early')
                                });
                                if (!confirmed || closed) return;
                                await Domus.Api.closeWorkflowRunEarly(step.id);
                            } else if (action === 'close' && step?.status === 'open') {
                                await Domus.Api.closeTaskStep(step.id);
                            } else if (action === 'reopen' && ['closed', 'skipped'].includes(step?.status)) {
                                await Domus.Api.reopenTaskStep(step.id);
                            } else {
                                return;
                            }
                            changed = true;
                            needsRefresh = true;
                            if (closed) refreshParent();
                            await reload();
                        } catch (err) {
                            Domus.UI.showNotification(err.message, 'error');
                        } finally {
                            setBusy(false);
                            if (!closed && ['delete', 'early'].includes(action) && button.isConnected) button.focus();
                        }
                    });
                });
            };
            bindActions();
        }

        function openProcessTasksModalById(runId, context = {}) {
            if (!runId) return;
            Domus.Api.getWorkflowRun(runId)
                .then(run => openProcessTasksModal(run, context))
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindTaskDetailRows(root = document) {
            root.querySelectorAll('table.domus-table tr[data-task-detail]').forEach(row => {
                if (row.dataset.domusTaskDetailBound) {
                    return;
                }
                row.dataset.domusTaskDetailBound = 'true';
                row.addEventListener('click', (event) => {
                    if (event.target.closest('a') || event.target.closest('button') || event.target.closest('input') || event.target.closest('select') || event.target.closest('textarea')) {
                        return;
                    }
                    openTaskDetailModal(getTaskDetailFromElement(row));
                });
                row.querySelector('.domus-task-detail-open')?.addEventListener('click', () => {
                    openTaskDetailModal(getTaskDetailFromElement(row));
                });
            });
        }

        function bindProcessSequenceTriggers(root = document) {
            root.querySelectorAll('[data-process-sequence]').forEach(trigger => {
                if (trigger.dataset.domusProcessSequenceBound) {
                    return;
                }
                trigger.dataset.domusProcessSequenceBound = 'true';
                const openSequence = (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const taskElement = trigger.closest('[data-task-detail]');
                    openProcessTasksModalById(trigger.getAttribute('data-process-sequence'), taskElement ? getTaskDetailFromElement(taskElement) : {});
                };
                trigger.addEventListener('click', openSequence);
                trigger.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                    }
                    openSequence(event);
                });
            });
        }

        function bindTaskUnitLinks(root = document) {
            root.querySelectorAll('.domus-task-unit-link[data-navigate]').forEach(link => {
                if (link.dataset.domusTaskUnitBound) {
                    return;
                }
                link.dataset.domusTaskUnitBound = 'true';
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const target = link.getAttribute('data-navigate');
                    const argsRaw = link.getAttribute('data-args') || '';
                    const args = argsRaw ? argsRaw.split(',').filter(Boolean) : [];
                    if (target) {
                        Domus.Router.navigate(target, args);
                    }
                });
            });
        }

        function buildUnitOpenItems(unitId, data) {
            const openItems = [];
            (data.runs || []).forEach(run => {
                const steps = run.steps || [];
                const openStep = steps.find(step => step.status === 'open');
                if (openStep) {
                    const completedSteps = steps.filter(step => step.status === 'closed').length;
                    openItems.push({
                        type: 'process',
                        stepId: openStep.id,
                        runId: run.id,
                        entityType: 'unit',
                        entityId: unitId,
                        entityName: data.unitName || '',
                        entityImageUrl: data.unitImageUrl || '',
                        title: translateTemplateText(openStep.title) || openStep.title,
                        description: translateTemplateText(openStep.description) || openStep.description,
                        actionType: openStep.actionType,
                        actionUrl: openStep.actionUrl,
                        year: run.year,
                        dueDate: openStep.dueDate,
                        workflowName: translateTemplateText(run.name) || run.name,
                        status: openStep.status,
                        completion: {
                            completed: completedSteps,
                            total: steps.length
                        }
                    });
                }
            });
            (data.tasks || []).filter(task => task.status === 'open').forEach(task => {
                openItems.push({
                    type: 'task',
                    taskId: task.id,
                    entityType: 'unit',
                    entityId: unitId,
                    entityName: data.unitName || '',
                    entityImageUrl: data.unitImageUrl || '',
                    title: task.title,
                    description: task.description,
                    dueDate: task.dueDate,
                    status: task.status
                });
            });
            return openItems;
        }

        function buildUnitTasksContent(unitId, data, options = {}) {
            const openItems = buildUnitOpenItems(unitId, data);

            const openTable = buildDashboardTaskGroups(openItems, {
                showUnit: false,
                showTitle: true,
                showType: false,
                showAction: false,
                emptyMessage: t('domus', 'There is no {entity} yet. Create the first one', {
                    entity: t('domus', 'Tasks')
                }),
                emptyActionId: 'domus-unit-tasks-empty-create',
                emptyIconClass: 'domus-icon-task'
            });
            const openSection = openTable;

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
                        title: translateTemplateText(run.name) || run.name,
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
                    const closedLabel = Domus.Utils.formatDate(item.closedAt ? item.closedAt * 1000 : item.closedAt) || '—';
                    const typeValue = item.type === 'processRun' ? 'process' : 'task';
                    const dueHtml = '<span class="domus-task-date-badge domus-task-date-badge-completed">' + Domus.Utils.escapeHtml(closedLabel) + '</span>';
                    return {
                        titleParts: titleParts.join(''),
                        dueHtml,
                        dataset: buildTaskDetailDataset({
                            title: item.title,
                            description: item.description,
                            entityType: 'unit',
                            entityId: unitId,
                            entityName: data.unitName || '',
                            entityImageUrl: data.unitImageUrl || '',
                            type: typeValue,
                            status: 'closed',
                            workflowName: item.workflowName || '',
                            taskId: item.taskId || '',
                            runId: item.runId || ''
                        })
                    };
                });
            const closedCards = closedRows.length
                ? '<div class="domus-overview-list domus-task-overview-list">' + closedRows.map(row => {
                    let dataAttrs = '';
                    Object.keys(row.dataset || {}).forEach(key => {
                        const value = row.dataset[key];
                        if (value === undefined || value === null) {
                            return;
                        }
                        dataAttrs += ' data-' + Domus.Utils.escapeHtml(key) + '="' + Domus.Utils.escapeHtml(String(value)) + '"';
                    });
                    return '<article class="domus-overview-card domus-task-overview-card"' + dataAttrs + ' tabindex="0" role="button">' +
                        '<div class="domus-task-overview-cell domus-task-overview-cell-title">' + row.titleParts + '</div>' +
                        '<div class="domus-task-overview-cell domus-task-overview-cell-due">' + row.dueHtml + '</div>' +
                        '</article>';
                }).join('') + '</div>'
                : Domus.UI.buildEmptyStateAction();
            let closedSection = '';
            if (closedRows.length) {
                const closedBodyId = 'domus-closed-tasks-' + Math.random().toString(36).slice(2);
                const closedHeader = '<a href="#" class="domus-task-closed-toggle" data-target="' + Domus.Utils.escapeHtml(closedBodyId) + '" aria-expanded="false">' +
                    Domus.Utils.escapeHtml(t('domus', 'Show completed tasks')) +
                    '</a>';
                closedSection = '<div class="domus-task-closed-toggle-wrap">' + closedHeader + '</div>' +
                    '<div class="domus-task-closed-body" id="' + Domus.Utils.escapeHtml(closedBodyId) + '" hidden>' + closedCards + '</div>';
            }

            return '<div class="domus-task-section">' + openSection + closedSection + '</div>';
        }

        function bindUnitTaskActions(unitId, runs, options = {}) {
            bindOpenTaskActions({ onRefresh: options.onRefresh });
            bindClosedTaskToggles();
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

        function bindClosedTaskToggles() {
            document.querySelectorAll('.domus-task-closed-toggle').forEach(btn => {
                if (btn.dataset.domusBound) {
                    return;
                }
                btn.dataset.domusBound = 'true';
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    const targetId = btn.getAttribute('data-target');
                    const body = targetId ? document.getElementById(targetId) : null;
                    if (!body) return;
                    const isHidden = body.hasAttribute('hidden');
                    if (isHidden) {
                        body.removeAttribute('hidden');
                        btn.setAttribute('aria-expanded', 'true');
                        btn.classList.add('is-open');
                    } else {
                        body.setAttribute('hidden', '');
                        btn.setAttribute('aria-expanded', 'false');
                        btn.classList.remove('is-open');
                    }
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
                Domus.Api.getWorkflowRunsByEntity('unit', unitId).catch(() => []),
                Domus.Api.getTasksByEntity('unit', unitId).catch(() => []),
                Domus.Api.get('/units/' + unitId).catch(() => null)
            ])
                .then(([runs, tasks, unit]) => {
                    const unitData = {
                        runs,
                        tasks,
                        unitName: unit?.label || '',
                        unitImageUrl: unit?.resolvedImageUrl || ''
                    };
                    const openItems = buildUnitOpenItems(unitId, unitData);
                    const openCount = openItems.length;
                    const highestStatus = getHighestDueStatus(openItems);
                    if (body) {
                        const content = buildUnitTasksContent(unitId, unitData);
                        body.innerHTML = content;
                        Domus.UI.bindCollapsibles();
                        bindUnitTaskActions(unitId, runs, { onRefresh: () => loadUnitTasks(unitId, options) });
                        bindUnitTaskButtons(unitId, () => loadUnitTasks(unitId, options));
                        if (processFocusContext) {
                            if (Domus.state.currentView === processFocusContext.view && JSON.stringify(Domus.state.currentViewArgs || []) === JSON.stringify(processFocusContext.args)) {
                                Domus.Router.restoreContentContext();
                            }
                            processFocusContext = null;
                        }
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
            const panelContent = Domus.UI.buildSectionHeader(t('domus', 'Needs attention'), {
                id: 'domus-unit-new-task',
                title: t('domus', 'New task'),
                iconClass: 'domus-icon-add'
            }) +
                '<div class="domus-panel-body" id="domus-unit-tasks-body">' +
                Domus.Utils.escapeHtml(t('domus', 'Loading tasks…')) +
                '</div>';
            if (options.wrapPanel === false) {
                return panelContent;
            }
            const panelId = options.panelId || 'domus-unit-tasks-panel';
            return '<div class="domus-panel domus-panel-half" id="' + Domus.Utils.escapeHtml(panelId) + '">' +
                panelContent +
                '</div>';
        }

        const taskCreateButtonHandlers = new WeakMap();

        function bindUnitTaskButtons(unitId, onRefresh) {
            const openUnitTaskModal = () => {
                openNewTaskModal({ entityType: 'unit', entityId: unitId, onSaved: onRefresh });
            };
            const createButton = document.getElementById('domus-unit-new-task');
            if (createButton) {
                const previousHandler = taskCreateButtonHandlers.get(createButton);
                if (previousHandler) {
                    createButton.removeEventListener('click', previousHandler);
                }
                createButton.addEventListener('click', openUnitTaskModal);
                taskCreateButtonHandlers.set(createButton, openUnitTaskModal);
            }
            const emptyCreate = document.getElementById('domus-unit-tasks-empty-create');
            emptyCreate?.addEventListener('click', openUnitTaskModal);
            emptyCreate?.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                event.preventDefault();
                openUnitTaskModal();
            });
        }

        return {
            buildOpenTasksTable,
            buildDashboardTaskGroups,
            bindOpenTaskActions,
            buildUnitTasksPanel,
            loadUnitTasks,
            bindUnitTaskButtons,
            openCreateTaskModal,
            openCreateTaskModalWithUnitSelect
        };
    })();

    /**
     * Dashboard view
     */
    Domus.TaskTemplates = (function() {
        function translateTemplateText(value) {
            const normalized = typeof value === 'string' ? value.trim() : '';
            return normalized ? t('domus', normalized) : '';
        }

        function buildTemplateRow(template) {
            const statusLabel = template.isActive ? t('domus', 'Active') : t('domus', 'Inactive');
            const toggleLabel = template.isActive ? t('domus', 'Disable') : t('domus', 'Enable');
            const toggleIcon = template.isActive ? 'domus-icon-back' : 'domus-icon-ok';
            const templateName = translateTemplateText(template.name) || template.name || '';
            return {
                cells: [
                    Domus.Utils.escapeHtml(templateName),
                    Domus.Utils.escapeHtml(String(template.stepsCount ?? 0)),
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
            return '<div class="domus-panel domus-settings-section domus-collapsed" id="domus-task-templates-panel">' +
                '<div class="domus-section-header domus-settings-section-header" role="button" tabindex="0" aria-expanded="false">' +
                '<h3>' + Domus.Utils.escapeHtml(t('domus', 'Task Templates')) + '</h3>' +
                Domus.UI.buildIconButton('domus-icon-add', t('domus', 'Add template'), {
                    id: 'domus-task-template-create'
                }) +
                '</div>' +
                '<div class="domus-panel-body domus-settings-section-body" id="domus-task-templates-body">' +
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
                        t('domus', 'Steps'),
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
                    content: '<select name="appliesTo">' +
                        '<option value="unit"' + ((template?.appliesTo || 'unit') === 'unit' ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + '</option>' +
                        '<option value="property"' + (template?.appliesTo === 'property' ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + '</option>' +
                        '</select>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Active'),
                    className: 'domus-task-template-active-row',
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
                '<div class="domus-task-steps-title">' +
                '<strong>' + Domus.Utils.escapeHtml(t('domus', 'Steps')) + '</strong>' +
                Domus.UI.buildIconButton('domus-icon-add', t('domus', 'Add step'), {
                    id: 'domus-task-step-add',
                    className: 'domus-task-step-add-button'
                }) +
                '</div>' +
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
            modal.protectChanges();
            modal.modalEl.querySelector('#domus-task-template-cancel')?.addEventListener('click', modal.requestClose);

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
                { value: 'document', label: t('domus', 'Add document') },
                { value: 'serviceChargeReport', label: t('domus', 'Service charge report') },
                { value: 'url', label: t('domus', 'Own link') },
            ];
            const selectedAction = step?.actionType || '';
            const isSystemYearStatusAction = selectedAction === 'closeBookingYear';
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
                isSystemYearStatusAction
                    ? Domus.UI.buildFormRow({
                        label: t('domus', 'Action'),
                        helpText: t('domus', 'This action is set automatically by the system.'),
                        content: '<input type="hidden" name="actionType" value="closeBookingYear">' +
                            '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(t('domus', 'Year status (system action)')) + '</div>'
                    })
                    : Domus.UI.buildFormRow({
                        label: t('domus', 'Action'),
                        content: '<select name="actionType">' + actionOptions.map(option => (
                            '<option value="' + Domus.Utils.escapeHtml(option.value) + '"' +
                            (option.value === selectedAction ? ' selected' : '') + '>' +
                            Domus.Utils.escapeHtml(option.label) +
                            '</option>'
                        )).join('') + '</select>'
                    }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Early completion'),
                    content: '<label class="domus-task-step-early-completion"><span>' + Domus.Utils.escapeHtml(t('domus', 'Allow this process to be closed early at this step')) + '</span><input type="checkbox" name="allowEarlyCompletion"' + (step?.allowEarlyCompletion ? ' checked' : '') + '></label>'
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
            const actionUrlRow = actionUrlInput?.closest('.domus-form-row');
            modal.modalEl.querySelector('#domus-task-step-cancel')?.addEventListener('click', modal.requestClose);

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
            modal.protectChanges();

            form?.addEventListener('submit', (event) => {
                event.preventDefault();
                const data = new FormData(form);
                const payload = {
                    title: data.get('title'),
                    description: data.get('description'),
                    defaultDueDaysOffset: parseInt(data.get('defaultDueDaysOffset') || '0', 10),
                    actionType: data.get('actionType'),
                    actionUrl: data.get('actionUrl'),
                    allowEarlyCompletion: data.has('allowEarlyCompletion')
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
                '<strong>' + Domus.Utils.escapeHtml(translateTemplateText(step.title) || step.title || '') + '</strong>' +
                '<div class="muted">' + Domus.Utils.escapeHtml(translateTemplateText(step.description) || step.description || '') + '</div>' +
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

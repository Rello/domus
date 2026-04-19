/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Documents = (function() {
        function buildDocumentRow(doc, options = {}) {
            const fileName = doc.fileName || doc.fileUrl || doc.fileId || '';
            const cells = [
                {
                    className: 'domus-documents-file-cell',
                    content: '<span class="domus-documents-file-name domus-action-log-title-text">' + Domus.Utils.escapeHtml(fileName) + '</span>'
                }
            ];

            if (options.showDate) {
                const createdAt = doc?.createdAt ? Domus.Utils.formatDate(doc.createdAt * 1000) : '—';
                cells.push({
                    className: 'domus-documents-date-cell domus-action-log-cell-date',
                    content: '<span class="domus-action-log-date">' + Domus.Utils.escapeHtml(createdAt || '—') + '</span>'
                });
            }

            return {
                className: 'domus-documents-row',
                dataset: { 'doc-info': doc.id },
                cells
            };
        }

        function renderList(entityType, entityId, options = {}) {
            const containerId = `domus-documents-${entityType}-${entityId}`;
            const canManageDocuments = options.canManageDocuments !== undefined
                ? options.canManageDocuments
                : (options.showLinkAction !== undefined ? options.showLinkAction : Domus.Role.hasCapability('manageDocuments'));
            const filterYear = options.year !== undefined && options.year !== null && options.year !== ''
                ? parseInt(options.year, 10)
                : null;
            const emptyActionId = options.emptyActionId || `${containerId}-empty-create`;

            function updateContainer(html) {
                const placeholder = document.getElementById(containerId);
                if (placeholder) {
                    placeholder.outerHTML = html;
                }
            }

            Domus.Api.getDocuments(entityType, entityId)
                .then(docs => {
                    const filteredDocs = filterYear
                        ? (docs || []).filter(doc => {
                            if (!doc?.createdAt) {
                                return false;
                            }
                            const year = new Date(doc.createdAt * 1000).getFullYear();
                            return year === filterYear;
                        })
                        : (docs || []);
                    const rows = filteredDocs.map(doc => buildDocumentRow(doc));
                    const html = '<div id="' + containerId + '">' +
                        '<div class="domus-documents-table">' +
                        Domus.UI.buildTable([t('domus', 'File')], rows, { wrapPanel: false, showHeader: false }) +
                        '</div>' +
                        '</div>';
                    updateContainer(html);
                    bindDocumentActions(containerId, documentId => openDetailModal(documentId, {
                        entityType,
                        entityId,
                        onUpdated: typeof options.onUpdated === 'function'
                            ? options.onUpdated
                            : () => renderList(entityType, entityId, options)
                    }));
                    bindEmptyActionTrigger(emptyActionId, () => runEmptyAction(entityType, entityId, options));
                })
                .catch(() => {
                    const html = '<div id="' + containerId + '">' + Domus.UI.buildEmptyStateAction('', { actionId: canManageDocuments ? emptyActionId : null }) + '</div>';
                    updateContainer(html);
                    bindEmptyActionTrigger(emptyActionId, () => runEmptyAction(entityType, entityId, options));
                });
            return '<div id="' + containerId + '">' + t('domus', 'Loading {entity}…', { entity: t('domus', 'Documents') }) + '</div>';
        }

        function renderLatestList(entityType, entityId, options = {}) {
            const containerId = options.containerId || `domus-documents-latest-${entityType}-${entityId}`;
            if (!options.defer) {
                loadLatestList(entityType, entityId, {...options, containerId});
            }
            return '<div id="' + containerId + '">' + t('domus', 'Loading {entity}…', { entity: t('domus', 'Documents') }) + '</div>';
        }

        function loadLatestList(entityType, entityId, options = {}) {
            const containerId = options.containerId || `domus-documents-latest-${entityType}-${entityId}`;
            const canManageDocuments = options.canManageDocuments !== undefined
                ? options.canManageDocuments
                : (options.showLinkAction !== undefined ? options.showLinkAction : Domus.Role.hasCapability('manageDocuments'));
            const pageSize = Math.max(1, Number(options.pageSize) || 10);
            const emptyActionId = options.emptyActionId || `${containerId}-empty-create`;
            let visibleCount = pageSize;

            function updateContainer(html) {
                const placeholder = document.getElementById(containerId);
                if (placeholder) {
                    placeholder.outerHTML = html;
                }
            }

            function buildEmptyState() {
                return '<div id="' + containerId + '">' + Domus.UI.buildEmptyStateAction('', { actionId: canManageDocuments ? emptyActionId : null }) + '</div>';
            }

            function buildRows(docs) {
                return docs.slice(0, visibleCount).map(doc => buildDocumentRow(doc, { showDate: true }));
            }

            function renderView(docs) {
                if (!docs.length) {
                    updateContainer(buildEmptyState());
                    bindEmptyActionTrigger(emptyActionId, () => runEmptyAction(entityType, entityId, options));
                    return;
                }
                const rows = buildRows(docs);
                const table = '<div class="domus-documents-table">' +
                    Domus.UI.buildTable([
                        { label: t('domus', 'File'), className: 'domus-documents-file-cell' },
                        { label: t('domus', 'Date'), className: 'domus-documents-date-cell' }
                    ], rows, { wrapPanel: false, showHeader: false }) +
                    '</div>';
                const hasMore = docs.length > visibleCount;
                const moreButton = hasMore
                    ? '<div class="domus-documents-more-row">' +
                    '<button type="button" class="domus-link" id="' + containerId + '-more">' + Domus.Utils.escapeHtml(t('domus', 'More')) + '</button>' +
                    '</div>'
                    : '';
                updateContainer('<div id="' + containerId + '">' + table + moreButton + '</div>');
                bindDocumentActions(containerId, documentId => openDetailModal(documentId, {
                    entityType,
                    entityId,
                    onUpdated: typeof options.onUpdated === 'function'
                        ? options.onUpdated
                        : () => loadLatestList(entityType, entityId, options)
                }));
                const moreBtn = document.getElementById(containerId + '-more');
                if (moreBtn) {
                    moreBtn.addEventListener('click', () => {
                        visibleCount = Math.min(visibleCount + pageSize, docs.length);
                        renderView(docs);
                    });
                }
            }

            Domus.Api.getDocuments(entityType, entityId)
                .then(docs => {
                    const sortedDocs = (docs || []).slice().sort((a, b) => {
                        const aDate = Number(a?.createdAt) || 0;
                        const bDate = Number(b?.createdAt) || 0;
                        return bDate - aDate;
                    });
                    renderView(sortedDocs);
                })
                .catch(() => {
                    updateContainer(buildEmptyState());
                    bindEmptyActionTrigger(emptyActionId, () => runEmptyAction(entityType, entityId, options));
                });
        }

        function bindEmptyActionTrigger(actionId, onTrigger) {
            if (!actionId || typeof onTrigger !== 'function') {
                return;
            }
            const trigger = document.getElementById(actionId);
            if (!trigger || trigger.dataset.domusEmptyBound === '1') {
                return;
            }
            trigger.dataset.domusEmptyBound = '1';
            trigger.addEventListener('click', (event) => {
                event.preventDefault();
                onTrigger();
            });
            trigger.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                event.preventDefault();
                onTrigger();
            });
        }

        function runEmptyAction(entityType, entityId, options = {}) {
            if (typeof options.onEmptyAction === 'function') {
                options.onEmptyAction();
                return;
            }
            openLinkModal(entityType, entityId, () => {
                if (typeof options.onLinked === 'function') {
                    options.onLinked();
                    return;
                }
                renderList(entityType, entityId, options);
            });
        }

        function createAttachmentWidget(options = {}) {
            const defaultYear = options.defaultYear ?? Domus.state.currentYear;
            const includeYearInput = options.includeYearInput !== false;
            const showHeader = options.showHeader !== false;
            const largeDropZone = options.largeDropZone !== false;

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
            if (largeDropZone) {
                dropZone.element.classList.add('domus-dropzone-large');
            }

            const pickerButton = document.createElement('button');
            pickerButton.type = 'button';
            pickerButton.textContent = t('domus', 'Select existing file');
            pickerButton.className = 'domus-dropzone-picker';

            const dropZoneArea = dropZone.element.querySelector('.domus-dropzone-area');
            const dropZoneText = dropZoneArea?.querySelector('strong');
            const dropZoneFileName = dropZone.element.querySelector('.domus-dropzone-filename');
            if (dropZoneArea && dropZoneText && dropZoneFileName) {
                const icon = document.createElement('span');
                icon.className = 'domus-icon domus-icon-upload domus-dropzone-icon';
                const content = document.createElement('div');
                content.className = 'domus-dropzone-content';
                dropZoneText.textContent = t('domus', 'Drag and drop or click to upload');
                dropZoneFileName.textContent = t('domus', 'No file selected');
                dropZoneFileName.classList.remove('muted');
                content.appendChild(icon);
                content.appendChild(dropZoneText);
                content.appendChild(pickerButton);
                content.appendChild(dropZoneFileName);
                dropZoneArea.remove();
                dropZone.element.querySelector('.domus-dropzone-label')?.remove();
                dropZone.element.appendChild(content);
            } else {
                card.appendChild(pickerButton);
            }

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

            if (showHeader) {
                card.appendChild(header);
            }
            card.appendChild(dropZone.element);
            card.appendChild(uploadNameLabel);
            if (uploadYearLabel) {
                card.appendChild(uploadYearLabel);
            }

            root.appendChild(card);

            let selectedPath = '';
            function updatePickerDisplay(path) {
                selectedPath = path || '';
                const fileName = String(selectedPath || '').split('/').pop();
                if (dropZoneFileName) {
                    dropZoneFileName.textContent = fileName || t('domus', 'No file selected');
                }
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
                            year: yearValue,
                            title: uploadTitleValue || undefined
                        };
                    }
                }

                return null;
            }

            return {
                root,
                pickerButton,
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

        function bindDocumentActions(containerId, onOpenDocument) {
            document.querySelectorAll('#' + containerId + ' tr[data-doc-info]').forEach(row => {
                if (row.dataset.domusDocumentBound) {
                    return;
                }

                row.dataset.domusDocumentBound = 'true';
                row.tabIndex = 0;
                row.setAttribute('role', 'button');

                const handleOpen = event => {
                    if (event && (event.target.closest('a') || event.target.closest('button') || event.target.closest('input') || event.target.closest('select') || event.target.closest('textarea'))) {
                        return;
                    }
                    if (typeof onOpenDocument === 'function') {
                        onOpenDocument(row.getAttribute('data-doc-info'));
                    }
                };

                row.addEventListener('click', handleOpen);
                row.addEventListener('keydown', event => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                    }
                    event.preventDefault();
                    handleOpen(event);
                });
            });
        }

        function normalizeDocumentTarget(entityType) {
            const normalized = String(entityType || '').toLowerCase();
            return normalized;
        }

        function buildDocumentOnlySectionMode() {
            return {
                primary: 'document',
                booking: {
                    enabled: false,
                    required: true,
                    title: t('domus', 'Create a booking for this document')
                },
                document: {
                    enabled: true,
                    required: true,
                    title: t('domus', 'Document')
                }
            };
        }

        function openLinkModal(entityType, entityId, onLinked, focus = 'link', options = {}) {
            const targetType = normalizeDocumentTarget(entityType);
            const defaults = Object.assign({}, options.defaults || {});
            const formConfig = Object.assign({}, options.formConfig || {});
            const documentTargets = Array.isArray(formConfig.documentTargets)
                ? formConfig.documentTargets.slice()
                : [];

            if (targetType === 'property' && !defaults.propertyId) {
                defaults.propertyId = entityId;
            } else if (targetType === 'unit' && !defaults.unitId) {
                defaults.unitId = entityId;
                if (!defaults.propertyId && options.propertyId) {
                    defaults.propertyId = options.propertyId;
                }
            } else if (targetType === 'tenancy') {
                if (!defaults.unitId && options.unitId) {
                    defaults.unitId = options.unitId;
                }
                if (!defaults.propertyId && options.propertyId) {
                    defaults.propertyId = options.propertyId;
                }
            }

            if (targetType && entityId !== undefined && entityId !== null) {
                documentTargets.push({ entityType: targetType, entityId });
            }

            formConfig.createContext = 'document';
            if (formConfig.hidePropertyField === undefined) {
                formConfig.hidePropertyField = Domus.Role.getCurrentRole() === 'landlord';
            }
            if (formConfig.allowDocumentWithoutRelation === undefined) {
                formConfig.allowDocumentWithoutRelation = targetType === 'partner' || targetType === 'tenancy';
            }
            if (targetType === 'property' && formConfig.restrictUnitsToProperty === undefined) {
                formConfig.restrictUnitsToProperty = Domus.Role.isBuildingMgmtView();
            }
            if ((targetType === 'partner' || targetType === 'tenancy') && formConfig.sectionMode === undefined) {
                formConfig.sectionMode = buildDocumentOnlySectionMode();
            }
            formConfig.documentTargets = documentTargets;

            Domus.Bookings.openCreateModal(defaults, () => {
                if (typeof onLinked === 'function') {
                    onLinked();
                    return;
                }
                renderList(entityType, entityId);
            }, formConfig);
        }

        function parseEntityId(value) {
            const parsed = parseInt(value, 10);
            return Number.isNaN(parsed) ? null : parsed;
        }

        function buildDocumentSelection(detail) {
            const filePath = String(detail?.document?.filePath || '').trim();
            if (!filePath) {
                return null;
            }

            const selection = {
                type: 'link',
                filePath
            };

            const title = String(detail?.document?.fileName || '').trim();
            if (title) {
                selection.title = title;
            }

            const createdAt = Number(detail?.document?.createdAt);
            if (!Number.isNaN(createdAt) && createdAt > 0) {
                selection.year = new Date(createdAt * 1000).getFullYear();
            }

            return selection;
        }

        function resolveDocumentEditContext(documentId, detail, options = {}) {
            const linkedEntities = Array.isArray(detail?.linkedEntities) ? detail.linkedEntities : [];
            const requestedType = normalizeDocumentTarget(options.entityType);
            const requestedId = parseEntityId(options.entityId);

            let primaryLink = linkedEntities.find(link => String(link?.id) === String(documentId)) || null;
            if (!primaryLink && requestedType && requestedId !== null) {
                primaryLink = linkedEntities.find(link => (
                    normalizeDocumentTarget(link?.entityType) === requestedType
                    && parseEntityId(link?.entityId) === requestedId
                )) || null;
            }
            if (!primaryLink && linkedEntities.length) {
                [primaryLink] = linkedEntities;
            }

            const targetType = requestedType || normalizeDocumentTarget(primaryLink?.entityType);
            const targetId = requestedId !== null ? requestedId : parseEntityId(primaryLink?.entityId);

            const preferredBookingLink = linkedEntities.find(link => (
                normalizeDocumentTarget(link?.entityType) === 'booking'
                && parseEntityId(link?.entityId) === targetId
            )) || null;
            const bookingLink = preferredBookingLink || linkedEntities.find(link => normalizeDocumentTarget(link?.entityType) === 'booking') || null;

            return {
                targetType,
                targetId,
                bookingId: parseEntityId(bookingLink?.entityId),
                bookingMeta: bookingLink?.booking || null
            };
        }

        function openDetailModal(documentId, options = {}) {
            Domus.Api.getDocumentDetail(documentId)
                .then(detail => {
                    const context = resolveDocumentEditContext(documentId, detail, options);
                    const initialDocumentSelection = buildDocumentSelection(detail);
                    if (!context.targetType || context.targetId === null || !initialDocumentSelection) {
                        Domus.UI.showNotification(t('domus', 'Document link not found.'), 'error');
                        return;
                    }

                    const defaults = {};
                    if (context.targetType === 'property') {
                        defaults.propertyId = context.targetId;
                    } else if (context.targetType === 'unit') {
                        defaults.unitId = context.targetId;
                    }

                    const formConfig = {
                        createContext: 'document',
                        initialDocumentSelection,
                        initialBookingEnabled: context.bookingId !== null,
                        editDocumentLinkId: documentId,
                        documentTargets: [{ entityType: context.targetType, entityId: context.targetId }],
                        allowDocumentWithoutRelation: context.targetType === 'partner' || context.targetType === 'tenancy'
                    };
                    if (context.targetType === 'property') {
                        formConfig.restrictUnitsToProperty = Domus.Role.isBuildingMgmtView();
                    }
                    if (context.targetType === 'partner' || context.targetType === 'tenancy') {
                        formConfig.sectionMode = buildDocumentOnlySectionMode();
                        formConfig.initialBookingEnabled = false;
                    }

                    const onUpdated = typeof options.onUpdated === 'function' ? options.onUpdated : null;
                    const openEditor = (bookingDefaults = {}, initialEntries = []) => {
                        const nextDefaults = Object.assign({}, defaults, bookingDefaults);
                        if (context.bookingId !== null) {
                            formConfig.editBookingId = context.bookingId;
                            formConfig.multiEntry = false;
                            formConfig.initialBookingEnabled = true;
                            if (Array.isArray(initialEntries) && initialEntries.length) {
                                formConfig.initialEntries = initialEntries;
                            }
                        }
                        Domus.Bookings.openCreateModal(nextDefaults, () => {
                            if (onUpdated) {
                                onUpdated();
                            }
                        }, formConfig);
                    };

                    if (context.bookingId === null) {
                        openEditor();
                        return;
                    }

                    Domus.Api.get('/bookings/' + context.bookingId)
                        .then(booking => {
                            const bookingDefaults = {
                                propertyId: booking?.propertyId || undefined,
                                unitId: booking?.unitId || undefined,
                                date: booking?.date || undefined,
                                deliveryDate: booking?.deliveryDate || booking?.date || undefined,
                                distributionKeyId: booking?.distributionKeyId || undefined
                            };
                            const initialEntries = [{
                                account: booking?.account || '',
                                amount: booking?.amount !== undefined && booking?.amount !== null ? booking.amount : ''
                            }];
                            openEditor(bookingDefaults, initialEntries);
                        })
                        .catch(() => {
                            const initialEntries = context.bookingMeta
                                ? [{
                                    account: context.bookingMeta.account || '',
                                    amount: context.bookingMeta.amount !== undefined && context.bookingMeta.amount !== null
                                        ? context.bookingMeta.amount
                                        : ''
                                }]
                                : [];
                            const fallbackDefaults = context.bookingMeta?.date
                                ? { date: context.bookingMeta.date, deliveryDate: context.bookingMeta.date }
                                : {};
                            openEditor(fallbackDefaults, initialEntries);
                        });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        return { renderList, renderLatestList, loadLatestList, openLinkModal, createAttachmentWidget };
    })();

    /**
     * App initializer
     */
})();

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
            const note = options.showNotes === false ? '' : String(doc?.note || '').trim();
            const fileUrl = String(doc.fileUrl || '').trim();
            // Use the existing destination; only web URLs are file actions.
            let safeFileUrl = '';
            try {
                const url = new URL(fileUrl, window.location.href);
                if (fileUrl && ['http:', 'https:'].includes(url.protocol)) {
                    safeFileUrl = fileUrl;
                }
            } catch (error) {
                // Keep details available when a stored destination is invalid.
            }
            const fileLabel = Domus.Utils.escapeHtml(fileName);
            const fileAction = safeFileUrl
                ? '<a class="domus-documents-file-name domus-action-log-title-text" href="' + Domus.Utils.escapeHtml(safeFileUrl) + '" target="_blank" rel="noopener noreferrer">' + fileLabel + '</a>'
                : '<span class="domus-documents-file-name domus-action-log-title-text">' + fileLabel + '</span>';
            const fileCellContent = fileAction +
                (note ? '<div class="muted">' + Domus.Utils.escapeHtml(note) + '</div>' : '');
            const editAction = '<button type="button" class="domus-icon-only-button domus-document-edit" data-doc-edit="' + Domus.Utils.escapeHtml(doc.id) + '" aria-label="' +
                Domus.Utils.escapeHtml(t('domus', 'Edit document {file}', { file: fileName })) + '" title="' +
                Domus.Utils.escapeHtml(t('domus', 'Edit document')) + '">' +
                '<span class="domus-icon domus-icon-edit" aria-hidden="true"></span></button>';
            const cells = [
                {
                    className: 'domus-documents-file-cell',
                    content: fileCellContent
                }
            ];

            if (options.showDate) {
                const createdAt = doc?.createdAt ? Domus.Utils.formatDate(doc.createdAt * 1000) : '—';
                cells.push({
                    className: 'domus-documents-date-cell domus-action-log-cell-date',
                    content: '<span class="domus-action-log-date">' + Domus.Utils.escapeHtml(createdAt || '—') + '</span>'
                });
            }

            if (options.canManageDocuments !== false) {
                cells.push({ className: 'domus-documents-actions-cell', content: editAction });
            }

            return {
                className: 'domus-documents-row',
                dataset: options.canManageDocuments === false ? {} : { 'doc-info': doc.id },
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
                if (options.isCurrent && !options.isCurrent()) return;
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
                    const rows = filteredDocs.map(doc => buildDocumentRow(doc, { canManageDocuments, showNotes: options.showNotes }));
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
                if (options.isCurrent && !options.isCurrent()) return;
                const placeholder = document.getElementById(containerId);
                if (placeholder) {
                    placeholder.outerHTML = html;
                }
            }

            function buildEmptyState() {
                return '<div id="' + containerId + '">' + Domus.UI.buildEmptyStateAction('', { actionId: canManageDocuments ? emptyActionId : null }) + '</div>';
            }

            function buildRows(docs) {
                return docs.slice(0, visibleCount).map(doc => buildDocumentRow(doc, { showDate: true, canManageDocuments, showNotes: options.showNotes }));
            }

            function renderView(docs) {
                if (options.isCurrent && !options.isCurrent()) return;
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
                    if (options.isCurrent && !options.isCurrent()) return;
                    updateContainer('<div id="' + containerId + '" role="alert">' +
                        Domus.Utils.escapeHtml(t('domus', 'Documents could not be loaded. Please try again.')) + '</div>');
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
            uploadNameLabel.className = 'domus-booking-doc-title';
            uploadNameLabel.textContent = t('domus', 'Title');
            const uploadNameInput = document.createElement('input');
            uploadNameInput.type = 'text';
            uploadNameInput.name = 'title';
            uploadNameInput.placeholder = t('domus', 'Defaults to file name');
            uploadNameInput.addEventListener('input', () => { uploadNameInput.dataset.autoTitle = ''; });
            uploadNameLabel.appendChild(uploadNameInput);

            const noteLabel = document.createElement('label');
            noteLabel.className = 'domus-booking-doc-note';
            noteLabel.textContent = t('domus', 'Note');
            const noteInput = document.createElement('textarea');
            noteInput.name = 'note';
            noteLabel.appendChild(noteInput);

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
            card.appendChild(noteLabel);
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
                const noteValue = noteInput.value.trim();
                const yearValue = includeYearInput && uploadYearInput ? (Number(uploadYearInput.value) || defaultYear) : undefined;

                if (!preferredType || preferredType === 'upload') {
                    if (uploadedFile) {
                        return {
                            type: 'upload',
                            file: uploadedFile,
                            year: yearValue,
                            title: uploadTitleValue || undefined,
                            note: noteValue || undefined
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
                            title: uploadTitleValue || undefined,
                            note: noteValue || undefined
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
                noteInput,
                uploadYearInput,
                getSelection,
                setPath: updatePickerDisplay,
                reset: () => {
                    updatePickerDisplay('');
                    dropZone.reset();
                    uploadNameInput.value = '';
                    uploadNameInput.dataset.autoTitle = '';
                    noteInput.value = '';
                    if (uploadYearInput) uploadYearInput.value = defaultYear;
                }
            };
        }

        function bindDocumentActions(containerId, onOpenDocument) {
            document.querySelectorAll('#' + containerId + ' button[data-doc-edit]').forEach(button => {
                if (button.dataset.domusDocumentBound) {
                    return;
                }
                button.dataset.domusDocumentBound = 'true';
                button.addEventListener('click', () => {
                    if (typeof onOpenDocument === 'function') {
                        onOpenDocument(button.getAttribute('data-doc-edit'));
                    }
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
            const fileId = Number(detail?.document?.fileId);
            if (!Number.isNaN(fileId) && fileId > 0) {
                selection.fileId = fileId;
            }
            const fileUrl = String(detail?.document?.fileUrl || '').trim();
            if (fileUrl) {
                selection.fileUrl = fileUrl;
            }

            const title = String(detail?.document?.fileName || '').trim();
            if (title) {
                selection.title = title;
            }
            const note = String(detail?.document?.note || '').trim();
            if (note) {
                selection.note = note;
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

        function buildTenancyAssignment(tenancies, linkedEntities) {
            const linkedIds = new Set((linkedEntities || [])
                .filter(link => normalizeDocumentTarget(link?.entityType) === 'tenancy')
                .map(link => String(link.entityId)));
            const options = (Array.isArray(tenancies) ? tenancies : []).map(tenancy => {
                const partners = (tenancy.partners || []).map(partner => partner?.name).filter(Boolean).join(', ');
                const period = [tenancy.startDate, tenancy.endDate]
                    .filter(Boolean)
                    .map(date => Domus.Utils.formatDate(date))
                    .join(' – ');
                return {
                    id: tenancy.id,
                    label: [partners || tenancy.partnerName || `${t('domus', 'Tenancy')} #${tenancy.id}`, period].filter(Boolean).join(' · ')
                };
            });
            return {
                available: options.filter(option => !linkedIds.has(String(option.id))),
                existing: options.filter(option => linkedIds.has(String(option.id)))
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
                        title: t('domus', 'Edit document'),
                        multiEntry: false,
                        initialDocumentSelection,
                        lockDocumentSelection: true,
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
                        const showEditor = () => Domus.Bookings.openCreateModal(nextDefaults, () => {
                            if (onUpdated) {
                                onUpdated();
                            }
                        }, formConfig);
                        if (context.targetType === 'unit') {
                            Domus.Api.get('/units/' + context.targetId + '/tenancies')
                                .then(tenancies => {
                                    formConfig.tenancyAssignment = buildTenancyAssignment(tenancies, detail.linkedEntities);
                                })
                                .catch(err => Domus.UI.showNotification(err.message, 'error'))
                                .finally(showEditor);
                            return;
                        }
                        showEditor();
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
                                distributionKeyId: booking?.distributionKeyId || undefined,
                                description: booking?.description || undefined
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

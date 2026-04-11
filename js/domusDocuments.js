(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Documents = (function() {
        function buildDocumentRow(doc, options = {}) {
            const fileName = doc.fileName || doc.fileUrl || doc.fileId || '';
            const cells = [
                {
                    className: 'domus-documents-file-cell',
                    content: '<span class="domus-documents-file-name">' + Domus.Utils.escapeHtml(fileName) + '</span>'
                }
            ];

            if (options.showDate) {
                const createdAt = doc?.createdAt ? Domus.Utils.formatDate(doc.createdAt * 1000) : '—';
                cells.push({
                    className: 'domus-documents-date-cell',
                    content: Domus.Utils.escapeHtml(createdAt || '—')
                });
            }

            return {
                className: 'domus-documents-row',
                dataset: { docInfo: doc.id },
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
                        Domus.UI.buildTable([t('domus', 'File')], rows, { wrapPanel: false }) +
                        '</div>' +
                        '</div>';
                    updateContainer(html);
                    bindDocumentActions(containerId, documentId => openDetailModal(documentId, {
                        canDelete: canManageDocuments,
                        onDeleted: () => renderList(entityType, entityId, options)
                    }));
                })
                .catch(() => {
                    const html = '<div id="' + containerId + '">' + t('domus', 'No {entity} found.', { entity: t('domus', 'Documents') }) + '</div>';
                    updateContainer(html);
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
            let visibleCount = pageSize;

            function updateContainer(html) {
                const placeholder = document.getElementById(containerId);
                if (placeholder) {
                    placeholder.outerHTML = html;
                }
            }

            function buildEmptyState() {
                return '<div id="' + containerId + '">' +
                    Domus.Utils.escapeHtml(t('domus', 'No {entity} found.', { entity: t('domus', 'Documents') })) +
                    '</div>';
            }

            function buildRows(docs) {
                return docs.slice(0, visibleCount).map(doc => buildDocumentRow(doc, { showDate: true }));
            }

            function renderView(docs) {
                if (!docs.length) {
                    updateContainer(buildEmptyState());
                    return;
                }
                const rows = buildRows(docs);
                const table = '<div class="domus-documents-table">' +
                    Domus.UI.buildTable([
                        { label: t('domus', 'File'), className: 'domus-documents-file-cell' },
                        { label: t('domus', 'Date'), className: 'domus-documents-date-cell' }
                    ], rows, { wrapPanel: false }) +
                    '</div>';
                const hasMore = docs.length > visibleCount;
                const moreButton = hasMore
                    ? '<div class="domus-documents-more-row">' +
                    '<button type="button" class="domus-link" id="' + containerId + '-more">' + Domus.Utils.escapeHtml(t('domus', 'More')) + '</button>' +
                    '</div>'
                    : '';
                updateContainer('<div id="' + containerId + '">' + table + moreButton + '</div>');
                bindDocumentActions(containerId, documentId => openDetailModal(documentId, {
                    canDelete: canManageDocuments,
                    onDeleted: () => loadLatestList(entityType, entityId, options)
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
                });
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
                Domus.Api.linkDocument(entityType, entityId, { filePath: selection.filePath, year: selection.year, title: selection.title })
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

        function openDetailModal(documentId, options = {}) {
            Domus.Api.getDocumentDetail(documentId)
                .then(detail => {
                    const fileLink = detail.document?.fileUrl
                        ? '<a class="domus-link" target="_blank" rel="noopener" href="' + Domus.Utils.escapeHtml(detail.document.fileUrl) + '">' + Domus.Utils.escapeHtml(detail.document.fileName || detail.document.fileUrl || '') + '</a>'
                        : Domus.Utils.escapeHtml(detail.document?.fileName || '');
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

                    let modal;
                    const headerActions = [];
                    if (options.canDelete !== false) {
                        headerActions.push(Domus.UI.buildModalAction(t('domus', 'Remove'), () => {
                            Domus.UI.confirmAction({
                                message: t('domus', 'Remove document?'),
                                confirmLabel: t('domus', 'Delete')
                            }).then(confirmed => {
                                if (!confirmed) {
                                    return;
                                }
                                Domus.Api.unlinkDocument(documentId)
                                    .then(() => {
                                        Domus.UI.showNotification(t('domus', 'Document removed.'), 'success');
                                        modal?.close();
                                        if (typeof options.onDeleted === 'function') {
                                            options.onDeleted();
                                        }
                                    })
                                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
                            });
                        }, 'domus-icon-delete'));
                    }

                    modal = Domus.UI.openModal({
                        title: t('domus', 'Document links'),
                        content: '<div class="domus-doc-detail">' +
                            '<p><strong>' + Domus.Utils.escapeHtml(t('domus', 'File')) + ':</strong> ' + fileLink + '</p>' +
                            '<ul>' + list + '</ul>' +
                            '</div>',
                        headerActions
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

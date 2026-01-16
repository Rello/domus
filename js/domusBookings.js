(function() {
    'use strict';

    window.Domus = window.Domus || {};

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
                        Domus.UI.buildScopeAddButton('domus-icon-booking', t('domus', 'Add {entity}', { entity: t('domus', 'Booking') }), {
                            id: 'domus-booking-create',
                            className: 'primary'
                        }) +
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
            document.getElementById('domus-booking-create')?.addEventListener('click', () => openCreateModal());
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
            ], rows, { wrapPanel: false });
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
                        initialEntries: defaults && (defaults.account || defaults.amount) ? [{ account: defaults.account, amount: defaults.amount }] : [],
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
                        Domus.UI.confirmAction({
                            message: t('domus', 'Delete {entity}?', { entity: t('domus', 'Booking') }),
                            confirmLabel: t('domus', 'Delete')
                        }).then(confirmed => {
                            if (!confirmed) {
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
            const entries = initialEntries && initialEntries.length ? initialEntries : [{ amount: 0, isDefaultAmount: true }];
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
                if (entry.isDefaultAmount) {
                    amountInput.dataset.defaultAmount = '1';
                }
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
            const isDefaultAmount = amountInput?.dataset?.defaultAmount === '1';
            if (amountInput && amountInput.value !== '' && !(isDefaultAmount && amountInput.value === '0')) {
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
                const amountInput = row.querySelector('[data-role="amount"]');
                const amountValue = (amountInput?.value || '').trim();
                const isDefaultAmount = amountInput?.dataset?.defaultAmount === '1';
                const hasAmount = amountValue !== '' && !(isDefaultAmount && amountValue === '0' && account === '');
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
     * Task templates (settings)
     */
})();

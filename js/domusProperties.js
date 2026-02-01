(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Properties = (function() {
        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Properties') }));
            Domus.Api.getProperties()
                .then(properties => {
                    const header = '<div class="domus-toolbar">' +
                        Domus.UI.buildScopeAddButton('domus-icon-property', t('domus', 'Add {entity}', { entity: t('domus', 'Property') }), {
                            id: 'domus-property-create-btn',
                            className: 'primary'
                        }) +
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

        function getPropertyWorkflowSteps() {
            const steps = [
                { label: t('domus', 'Create property') }
            ];
            if (Domus.Distributions.canManageDistributions()) {
                steps.push({ label: t('domus', 'Create distribution key') });
            }
            steps.push({ label: t('domus', 'Create unit') });
            return steps;
        }

        function openPropertyCreateForm(defaults = {}, onCreated, modalOptions = {}) {
            const content = buildPropertyForm(defaults);
            const wrappedContent = typeof modalOptions.wrapContent === 'function' ? modalOptions.wrapContent(content) : content;
            const modal = Domus.UI.openModal({
                title: modalOptions.title || t('domus', 'Add {entity}', { entity: t('domus', 'Property') }),
                content: wrappedContent,
                size: modalOptions.size
            });
            bindPropertyForm(modal, data => Domus.Api.createProperty(data)
                .then(created => {
                    Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Property') }), 'success');
                    modal.close();
                    if (typeof onCreated === 'function') {
                        onCreated(created);
                    } else {
                        renderList();
                    }
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error')));
        }

        function openGuidedDistributionStep(property, steps, onFinished) {
            if (!Domus.Distributions.canManageDistributions()) {
                openGuidedUnitStep(property, steps, onFinished);
                return;
            }
            Domus.Distributions.openCreateKeyModal(
                property?.id,
                null,
                {
                    allowMultiple: true,
                    onContinue: () => openGuidedUnitStep(property, steps, onFinished),
                    wrapContent: content => Domus.UI.buildGuidedWorkflowLayout(steps, 1, content),
                    size: 'large'
                }
            );
        }

        function openGuidedUnitStep(property, steps, onFinished) {
            Domus.Units.openCreateModal(
                { propertyId: property?.id, lockProperty: true },
                createdUnit => {
                    if (typeof onFinished === 'function') {
                        onFinished(createdUnit);
                        return;
                    }
                    if (property?.id) {
                        renderDetail(property.id);
                        return;
                    }
                    renderList();
                }
            );
        }

        function openGuidedCreateWorkflow(defaults = {}, onFinished) {
            const steps = getPropertyWorkflowSteps();
            openPropertyCreateForm(
                defaults,
                createdProperty => openGuidedDistributionStep(createdProperty, steps, onFinished),
                {
                    title: t('domus', 'Create property'),
                    wrapContent: content => Domus.UI.buildGuidedWorkflowLayout(steps, 0, content),
                    size: 'large'
                }
            );
        }

        function openCreateModal() {
            openGuidedCreateWorkflow();
        }

        function isValueFilled(value) {
            return value !== undefined && value !== null && value !== '';
        }

        function getPropertyMasterdataStatus(property) {
            let total = 0;
            let completed = 0;

            const addField = (value) => {
                total += 1;
                if (isValueFilled(value)) {
                    completed += 1;
                }
            };

            addField(property?.name);
            addField(property?.usageRole);
            addField(property?.street);
            addField(property?.zip);
            addField(property?.city);
            addField(property?.country);
            addField(property?.type);
            addField(property?.description);

            return { completed, total };
        }

        function renderDetail(id) {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Property') }));
            Domus.Api.getProperty(id)
                .then(property => Promise.all([
                    Promise.resolve(property),
                    Domus.Distributions.loadForProperty(id).catch(() => []),
                    Domus.Api.getPropertyPartners(id).catch(() => [])
                ]))
                .then(([property, distributions, partners]) => {

                    const visibleDistributions = Domus.Distributions.filterList(distributions, { excludeSystemDefaults: false });
                    const cityLine = [property.zip, property.city].filter(Boolean).join(' ');
                    const addressParts = [property.street, cityLine, property.country].filter(Boolean);
                    const address = addressParts.length ? addressParts.join(', ') : (property.address || '');
                    const showBookingFeatures = Domus.Role.hasCapability('manageBookings');
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const canManageDistributions = Domus.Distributions.canManageDistributions();
                    const isBuildingManagement = Domus.Role.isBuildingMgmtView();
                    const masterdataStatus = getPropertyMasterdataStatus(property);
                    const masterdataIndicator = Domus.UI.buildCompletionIndicator(t('domus', 'Masterdata'), masterdataStatus.completed, masterdataStatus.total, {
                        id: 'domus-property-masterdata'
                    });
                    const standardActions = [
                        masterdataIndicator,
                        Domus.UI.buildIconButton('domus-icon-settings', t('domus', 'Document location'), { id: 'domus-property-document-location' }),
                        Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), { id: 'domus-property-delete' })
                    ];
                    const contextActions = isBuildingManagement
                        ? [
                            canManageDistributions ? '<button id="domus-property-distribution-report">' + Domus.Utils.escapeHtml(t('domus', 'Distribution Report')) + '</button>' : ''
                        ].filter(Boolean)
                        : [
                            '<button id="domus-add-unit">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Unit') })) + '</button>',
                            showBookingFeatures ? '<button id="domus-add-booking">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Booking') })) + '</button>' : '',
                            canManageDistributions ? '<button id="domus-add-distribution">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') })) + '</button>' : ''
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

                    const unitsHeader = Domus.UI.buildSectionHeader(t('domus', 'Units'), {
                        id: 'domus-add-unit-inline',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Unit') }),
                        iconClass: 'domus-icon-add'
                    });
                    const distributionsHeader = Domus.UI.buildSectionHeader(t('domus', 'Distribution'), canManageDistributions ? {
                        id: 'domus-add-distribution-inline',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') }),
                        iconClass: 'domus-icon-add'
                    } : null);
                    const bookingsHeader = showBookingFeatures ? Domus.UI.buildSectionHeader(t('domus', 'Bookings'), {
                        id: 'domus-add-booking-inline',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Booking') }),
                        iconClass: 'domus-icon-add'
                    }) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-property-link-doc',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        label: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        iconClass: 'domus-icon-add',
                        dataset: { entityType: 'property', entityId: id }
                    } : null);

                    const partnersPanel = Domus.PartnerRelations.renderSection(partners || [], { entityType: 'property', entityId: id });

                    const content = '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('properties') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid domus-dashboard-grid-single">' +
                        '<div class="domus-dashboard-main">' +
                        (canManageDistributions ? '<div class="domus-panel">' + distributionsHeader + '<div class="domus-panel-body" id="domus-property-distributions">' +
                        Domus.Distributions.renderTable(visibleDistributions, { excludeSystemDefaults: false, wrapPanel: false }) + '</div></div>' : '') +
                        '<div class="domus-panel">' + unitsHeader + '<div class="domus-panel-body">' +
                        Domus.Units.renderListInline(property.units || []) + '</div></div>' +
                        partnersPanel +
                        (showBookingFeatures ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(property.bookings || [], { refreshView: 'propertyDetail', refreshId: id }) + '</div></div>' : '') +
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
                    Domus.PartnerRelations.bindSection({ entityType: 'property', entityId: id, onRefresh: () => renderDetail(id) });
                    bindDetailActions(id, property);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, property) {
            const detailsBtn = document.getElementById('domus-property-masterdata');
            const deleteBtn = document.getElementById('domus-property-delete');
            detailsBtn?.addEventListener('click', () => openPropertyModal(id, 'view'));
            document.getElementById('domus-property-document-location')?.addEventListener('click', () => {
                openDocumentLocationModal(property);
            });
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    Domus.Api.getPropertyDeletionSummary(id)
                        .then(summary => openPropertyDeleteModal(property, summary, () => {
                            Domus.Api.deleteProperty(id)
                                .then(() => {
                                    Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: t('domus', 'Property') }), 'success');
                                    Domus.UI.renderSidebar('');
                                    renderList();
                                })
                                .catch(err => Domus.UI.showNotification(err.message, 'error'));
                        }))
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            }

            document.getElementById('domus-add-unit')?.addEventListener('click', () => {
                Domus.Units.openCreateModal({ propertyId: id, lockProperty: true }, () => renderDetail(id));
            });
            document.getElementById('domus-add-unit-inline')?.addEventListener('click', () => {
                Domus.Units.openCreateModal({ propertyId: id, lockProperty: true }, () => renderDetail(id));
            });
            document.getElementById('domus-add-booking')?.addEventListener('click', () => {
                const bookingFormConfig = Domus.Role.isBuildingMgmtView() ? { restrictUnitsToProperty: true } : {};
                Domus.Bookings.openCreateModal({ propertyId: id }, () => renderDetail(id), bookingFormConfig);
            });
            document.getElementById('domus-add-booking-inline')?.addEventListener('click', () => {
                const bookingFormConfig = Domus.Role.isBuildingMgmtView() ? { restrictUnitsToProperty: true } : {};
                Domus.Bookings.openCreateModal({ propertyId: id }, () => renderDetail(id), bookingFormConfig);
            });
            document.getElementById('domus-property-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('property', id, () => renderDetail(id));
            });
            document.getElementById('domus-add-distribution')?.addEventListener('click', () => {
                Domus.Distributions.openCreateKeyModal(id, () => renderDetail(id));
            });
            document.getElementById('domus-add-distribution-inline')?.addEventListener('click', () => {
                Domus.Distributions.openCreateKeyModal(id, () => renderDetail(id));
            });
            document.getElementById('domus-property-distribution-report')?.addEventListener('click', () => {
                Domus.DistributionReports.openModal({
                    propertyId: id,
                    year: Domus.state.currentYear
                });
            });
        }

        function openEditModal(id) {
            openPropertyModal(id, 'edit');
        }

        function openPropertyDeleteModal(property, summary, onConfirm) {
            const expectedTitle = property?.name || '';
            const content = document.createElement('div');
            const warning = document.createElement('p');
            warning.className = 'domus-modal-message';
            warning.textContent = `${t('domus', 'Deleting this property will remove the linked data listed below.')} ${t('domus', 'This action cannot be undone.')}`;
            content.appendChild(warning);

            const summaryTitle = document.createElement('h4');
            summaryTitle.textContent = t('domus', 'Linked objects');
            content.appendChild(summaryTitle);

            const summaryList = document.createElement('ul');
            summaryList.className = 'domus-delete-summary';
            [
                { label: t('domus', 'Units'), value: summary?.units },
                { label: t('domus', 'Distribution keys'), value: summary?.distributionKeys },
                { label: t('domus', 'Distribution values'), value: summary?.distributionValues },
                { label: t('domus', 'Partner relations'), value: summary?.partnerRelations }
            ].forEach(item => {
                const listItem = document.createElement('li');
                const label = document.createElement('span');
                label.className = 'domus-delete-summary-label';
                label.textContent = item.label;
                const value = document.createElement('span');
                value.className = 'domus-delete-summary-value';
                value.textContent = String(item.value || 0);
                listItem.appendChild(label);
                listItem.appendChild(value);
                summaryList.appendChild(listItem);
            });
            content.appendChild(summaryList);

            const form = document.createElement('form');
            form.className = 'domus-form';
            form.addEventListener('submit', event => event.preventDefault());

            const inputId = 'domus-property-delete-confirm-title';
            const row = document.createElement('div');
            row.className = 'domus-form-row domus-form-row-full';
            const labelWrap = document.createElement('div');
            labelWrap.className = 'domus-form-label';
            labelWrap.classList.add('domus-delete-confirm-field');
            const label = document.createElement('label');
            label.setAttribute('for', inputId);
            label.textContent = t('domus', 'Type the property title to confirm.');
            const help = document.createElement('div');
            help.className = 'domus-form-help';
            help.textContent = t('domus', 'Expected title: {title}', { title: expectedTitle });
            labelWrap.appendChild(label);
            labelWrap.appendChild(help);
            const valueWrap = document.createElement('div');
            valueWrap.className = 'domus-form-value';
            valueWrap.classList.add('domus-delete-confirm-field');
            const input = document.createElement('input');
            input.type = 'text';
            input.id = inputId;
            input.required = true;
            input.autocomplete = 'off';
            valueWrap.appendChild(input);
            row.appendChild(labelWrap);
            row.appendChild(valueWrap);
            form.appendChild(row);
            content.appendChild(form);

            const footer = document.createElement('div');
            footer.className = 'domus-modal-footer';
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.textContent = t('domus', 'Cancel');
            const confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.textContent = t('domus', 'Delete');
            confirmButton.className = 'primary';
            confirmButton.disabled = true;
            footer.appendChild(cancelButton);
            footer.appendChild(confirmButton);
            content.appendChild(footer);

            let modal;
            const closeModal = () => modal?.close();

            const checkInput = () => {
                const value = input.value.trim();
                confirmButton.disabled = value !== expectedTitle.trim();
            };
            input.addEventListener('input', checkInput);
            checkInput();

            modal = Domus.UI.openModal({
                title: t('domus', 'Delete {entity}?', { entity: t('domus', 'Property') }),
                content
            });
            cancelButton.addEventListener('click', closeModal);
            confirmButton.addEventListener('click', () => {
                closeModal();
                if (typeof onConfirm === 'function') {
                    onConfirm();
                }
            });
        }

        function openDocumentLocationModal(property) {
            const currentPath = property.documentPath || '';
            const pickerId = 'domus-property-document-location-picker';
            const displayId = 'domus-property-document-location-display';
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Current location'),
                    content: '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(currentPath || '—') + '</div>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Folder path'),
                    required: true,
                    content: '<div class="domus-doc-picker-row">' +
                        '<button type="button" class="domus-ghost" id="' + Domus.Utils.escapeHtml(pickerId) + '">' + Domus.Utils.escapeHtml(t('domus', 'Select folder')) + '</button>' +
                        '<div class="domus-doc-picker-display muted" id="' + Domus.Utils.escapeHtml(displayId) + '">' + Domus.Utils.escapeHtml(currentPath || t('domus', 'No folder selected')) + '</div>' +
                        '<input type="hidden" name="documentPath" value="' + Domus.Utils.escapeHtml(currentPath) + '" required>' +
                        '</div>'
                })
            ];
            const modal = Domus.UI.openModal({
                title: t('domus', 'Change document location'),
                content: '<div class="domus-form">' +
                    '<form id="domus-property-document-location-form">' +
                    Domus.UI.buildFormTable(rows) +
                    '<div class="domus-form-actions">' +
                    '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                    '<button type="button" id="domus-property-document-location-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                    '</div>' +
                    '</form>' +
                    '</div>'
            });

            const form = modal.modalEl.querySelector('#domus-property-document-location-form');
            const documentPathInput = form?.querySelector('input[name="documentPath"]');
            const pickerButton = modal.modalEl.querySelector('#' + pickerId);
            const pickerDisplay = modal.modalEl.querySelector('#' + displayId);
            if (pickerButton && typeof OC !== 'undefined' && OC.dialogs?.filepicker) {
                pickerButton.addEventListener('click', function(e) {
                    e.preventDefault();
                    OC.dialogs.filepicker(t('domus', 'Select folder'), function(path) {
                        if (documentPathInput) {
                            documentPathInput.value = path || '';
                        }
                        if (pickerDisplay) {
                            pickerDisplay.textContent = path || t('domus', 'No folder selected');
                        }
                    }, false, 'httpd/unix-directory', true, 1);
                });
            }
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const value = documentPathInput?.value?.trim() || '';
                if (!value) {
                    Domus.UI.showNotification(t('domus', 'Document location is required.'), 'error');
                    return;
                }
                Domus.Api.updateProperty(property.id, { documentPath: value })
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Document location updated.'), 'success');
                        modal.close();
                        renderDetail(property.id);
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
            modal.modalEl.querySelector('#domus-property-document-location-cancel')?.addEventListener('click', modal.close);
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
            openCreateModal,
            renderListInline: (units) => Domus.Units.renderListInline(units)
        };
    })();

    /**
     * Units view
     */
})();

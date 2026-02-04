(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Partners = (function() {
        function getPartnerTypeOptions() {
            return [
                { value: 'tenant', label: t('domus', 'Tenant') },
                { value: 'owner', label: t('domus', 'Owner') },
                { value: 'buildingManagement', label: t('domus', 'Building Management') },
                { value: 'contractor', label: t('domus', 'Contractor') },
                { value: 'facilities', label: t('domus', 'Facilities') }
            ];
        }

        function getPartnerTypeLabel(type) {
            const match = getPartnerTypeOptions().find(option => option.value === type);
            return match?.label || type || t('domus', 'Partner');
        }

        function isValueFilled(value) {
            return value !== undefined && value !== null && value !== '';
        }

        function getPartnerMasterdataStatus(partner) {
            let total = 0;
            let completed = 0;

            const addField = (value) => {
                total += 1;
                if (isValueFilled(value)) {
                    completed += 1;
                }
            };

            addField(partner?.name);
            addField(partner?.partnerType);
            addField(partner?.street);
            addField(partner?.zip);
            addField(partner?.city);
            addField(partner?.country);
            addField(partner?.email);
            addField(partner?.phone);

            return { completed, total };
        }

        function normalizePartnerList(partners, fallbackName) {
            const normalized = (partners || [])
                .filter(partner => partner && (partner.name || partner.email || partner.phone))
                .map(partner => partner);
            if (normalized.length) {
                return normalized;
            }
            return fallbackName ? [{ name: fallbackName }] : [];
        }

        function renderPartnerContact(partner, options = {}) {
            const name = Domus.Utils.escapeHtml(partner?.name || options.fallbackName || '');
            if (!name) {
                return '';
            }
            const email = partner?.email || '';
            const phone = partner?.phone || '';
            const actions = [];
            if (email) {
                const mailto = 'mailto:' + encodeURIComponent(email);
                const label = t('domus', 'Email');
                actions.push(
                    '<a class="domus-partner-action domus-icon-only-button" href="' + Domus.Utils.escapeHtml(mailto) + '"' +
                    ' aria-label="' + Domus.Utils.escapeHtml(label) + '" title="' + Domus.Utils.escapeHtml(label) + '">' +
                    '<span class="domus-icon domus-icon-mail" aria-hidden="true"></span>' +
                    '<span class="domus-visually-hidden">' + Domus.Utils.escapeHtml(label) + '</span>' +
                    '</a>'
                );
            }
            if (phone) {
                const label = t('domus', 'Show phone number');
                actions.push(
                    '<button type="button" class="domus-partner-action domus-icon-only-button domus-partner-phone-button"' +
                    ' aria-expanded="false"' +
                    ' aria-label="' + Domus.Utils.escapeHtml(label) + '" title="' + Domus.Utils.escapeHtml(label) + '">' +
                    '<span class="domus-icon domus-icon-call" aria-hidden="true"></span>' +
                    '<span class="domus-visually-hidden">' + Domus.Utils.escapeHtml(label) + '</span>' +
                    '</button>'
                );
            }
            const phoneLabel = phone
                ? '<span class="domus-partner-phone" aria-live="polite">' + Domus.Utils.escapeHtml(phone) + '</span>'
                : '';
            const actionsHtml = actions.length ? '<span class="domus-partner-actions">' + actions.join('') + '</span>' : '';
            return '<span class="domus-partner-contact">' +
                '<span class="domus-partner-name">' + name + '</span>' +
                actionsHtml +
                phoneLabel +
                '</span>';
        }

        function renderPartnerContactList(partners, options = {}) {
            const normalized = normalizePartnerList(partners, options.fallbackName);
            if (!normalized.length) {
                return options.emptyLabel ? Domus.Utils.escapeHtml(options.emptyLabel) : '';
            }
            return '<span class="domus-partner-list">' +
                normalized.map(partner => renderPartnerContact(partner)).join('') +
                '</span>';
        }

        function bindContactActions(container = document) {
            container.querySelectorAll('.domus-partner-phone-button').forEach(button => {
                if (button.dataset.domusBound === 'true') {
                    return;
                }
                button.dataset.domusBound = 'true';
                button.addEventListener('click', () => {
                    const wrapper = button.closest('.domus-partner-contact');
                    const phoneLabel = wrapper?.querySelector('.domus-partner-phone');
                    if (!phoneLabel) {
                        return;
                    }
                    phoneLabel.classList.toggle('is-visible');
                    const expanded = phoneLabel.classList.contains('is-visible');
                    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
                });
            });
        }

        function renderInline(partners) {
            const rows = (partners || []).map(partner => [
                renderPartnerContact(partner),
                Domus.Utils.escapeHtml(getPartnerTypeLabel(partner.partnerType)),
                Domus.Utils.escapeHtml(partner.email || '')
            ]);
            return Domus.UI.buildTable([
                t('domus', 'Name'),
                t('domus', 'Type'),
                t('domus', 'Email')
            ], rows, { wrapPanel: false });
        }

        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Partners') }));
            const typeOptions = [{ value: '', label: t('domus', 'All types') }].concat(getPartnerTypeOptions());
            Domus.Api.getPartners()
                .then(partners => {
                    const toolbar = '<div class="domus-toolbar">' +
                        Domus.UI.buildScopeAddButton('domus-icon-partner', t('domus', 'Add {entity}', { entity: t('domus', 'Partner') }), {
                            id: 'domus-partner-create',
                            className: 'primary'
                        }) +
                        '<label class="domus-inline-label">' + Domus.Utils.escapeHtml(t('domus', 'Type')) + ' <select id="domus-partner-filter">' +
                        typeOptions.map(option => '<option value="' + Domus.Utils.escapeHtml(option.value) + '">' + Domus.Utils.escapeHtml(option.label) + '</option>').join('') +
                        '</select></label>' +
                        '</div>';
                    const rows = (partners || []).map(p => ({
                        cells: [
                            renderPartnerContact(p),
                            Domus.Utils.escapeHtml(getPartnerTypeLabel(p.partnerType)),
                            Domus.Utils.escapeHtml(p.email || '')
                        ],
                        dataset: { navigate: 'partnerDetail', args: p.id }
                    }));
                    const hasRows = rows.length > 0;
                    const table = Domus.UI.buildTable([
                        t('domus', 'Name'), t('domus', 'Type'), t('domus', 'Email')
                    ], rows);
                    const emptyState = Domus.UI.buildEmptyStateAction(
                        t('domus', 'There is no {entity} yet. Create the first one', {
                            entity: t('domus', 'Partners')
                        }),
                        {
                            iconClass: 'domus-icon-partner',
                            actionId: 'domus-partners-empty-create'
                        }
                    );
                    Domus.UI.renderContent(toolbar + (hasRows ? table : emptyState));
                    bindList();
                    bindContactActions();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            document.getElementById('domus-partner-create')?.addEventListener('click', openCreateModal);
            bindEmptyCreateAction();
            document.getElementById('domus-partner-filter')?.addEventListener('change', function() {
                Domus.Api.getPartners(this.value).then(renderPartnersTable).catch(err => Domus.UI.showError(err.message));
            });
            Domus.UI.bindRowNavigation();
        }

        function bindEmptyCreateAction() {
            document.getElementById('domus-partners-empty-create')?.addEventListener('click', openCreateModal);
        }

        function renderPartnersTable(partners) {
            const rows = (partners || []).map(p => ({
                cells: [
                    renderPartnerContact(p),
                    Domus.Utils.escapeHtml(getPartnerTypeLabel(p.partnerType)),
                    Domus.Utils.escapeHtml(p.email || '')
                ],
                dataset: { navigate: 'partnerDetail', args: p.id }
            }));
            const hasRows = rows.length > 0;
            const table = Domus.UI.buildTable([
                t('domus', 'Name'), t('domus', 'Type'), t('domus', 'Email')
            ], rows);
            const emptyState = Domus.UI.buildEmptyStateAction(
                t('domus', 'There is no {entity} yet. Create the first one', {
                    entity: t('domus', 'Partners')
                }),
                {
                    iconClass: 'domus-icon-partner',
                    actionId: 'domus-partners-empty-create'
                }
            );
            const content = document.getElementById('app-content');
            if (content) {
                const tables = content.querySelectorAll('.domus-table');
                if (tables.length) {
                    tables[0].outerHTML = hasRows ? table : emptyState;
                } else {
                    const panels = content.querySelectorAll('.domus-empty-state');
                    if (panels.length) {
                        panels[0].outerHTML = hasRows ? table : emptyState;
                    }
                }
            }
            Domus.UI.bindRowNavigation();
            bindEmptyCreateAction();
            bindContactActions();
        }

        function openCreateModal(defaults = {}, onCreated, options = {}) {
            const title = options.title || t('domus', 'Add {entity}', { entity: t('domus', 'Partner') });
            const successMessage = options.successMessage || t('domus', '{entity} created.', { entity: t('domus', 'Partner') });
            const content = buildPartnerForm(defaults, {
                partnerTypeConfig: options.partnerTypeConfig,
                partnerTypeOptions: options.partnerTypeOptions
            });
            const wrappedContent = typeof options.wrapContent === 'function' ? options.wrapContent(content) : content;
            const modal = Domus.UI.openModal({
                title,
                content: wrappedContent,
                size: options.size
            });
            bindPartnerForm(modal, data => Domus.Api.createPartner(data)
                .then(created => {
                    Domus.UI.showNotification(successMessage, 'success');
                    modal.close();
                    if (typeof onCreated === 'function') {
                        onCreated(created);
                    } else {
                        renderList();
                    }
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
                    const masterdataStatus = getPartnerMasterdataStatus(partner);
                    const masterdataIndicator = Domus.UI.buildCompletionIndicator(t('domus', 'Masterdata'), masterdataStatus.completed, masterdataStatus.total, {
                        id: 'domus-partner-masterdata'
                    });
                    const stats = Domus.UI.buildStatCards([
                        { label: tenancyLabels.plural, value: tenancies.length, hint: t('domus', 'Linked contracts'), formatValue: false },
                        { label: t('domus', 'Type'), value: getPartnerTypeLabel(partner.partnerType) || '—', hint: t('domus', 'Partner category') }
                    ]);
                    const menuActions = [
                        Domus.UI.buildIconLabelButton('domus-icon-delete', t('domus', 'Delete'), {
                            id: 'domus-partner-delete',
                            className: 'domus-action-menu-item'
                        })
                    ];
                    const actionMenu = Domus.UI.buildActionMenu(menuActions, {
                        label: t('domus', 'Settings'),
                        ariaLabel: t('domus', 'Settings')
                    });
                    const contextActions = [
                        (canManageTenancies && tenancyLabels.action ? '<button id="domus-add-partner-tenancy" data-partner-id="' + id + '">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : '')
                    ].filter(Boolean);

                    const contactMeta = [partner.phone, partner.email].filter(Boolean).join(' • ');
                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-content">' +
                        '<div class="domus-hero-indicator"><span class="domus-icon domus-icon-partner" aria-hidden="true"></span></div>' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(getPartnerTypeLabel(partner.partnerType)) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(partner.name || '') + '</h2>' +
                        (contactMeta ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(contactMeta) + '</p>' : '') +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        '<div class="domus-hero-actions-row domus-hero-actions-indicator">' + masterdataIndicator + '</div>' +
                        (actionMenu ? '<div class="domus-hero-actions-row domus-hero-actions-more">' + actionMenu + '</div>' : '') +
                        (contextActions.length ? '<div class="domus-hero-actions-row">' + contextActions.join('') + '</div>' : '') +
                        '</div>' +
                        '</div>';

                    const tenanciesHeader = Domus.UI.buildSectionHeader(tenancyLabels.plural, (canManageTenancies && tenancyLabels.action) ? {
                        id: 'domus-add-partner-tenancy-inline',
                        title: tenancyLabels.action,
                        iconClass: 'domus-icon-add'
                    } : null);
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-partner-link-doc',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        label: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        iconClass: 'domus-icon-add',
                        dataset: { entityType: 'partner', entityId: id }
                    } : null);
                    const infoList = Domus.UI.buildInfoList([
                        { label: t('domus', 'Type'), value: getPartnerTypeLabel(partner.partnerType) },
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
                        '<div class="domus-dashboard-grid domus-dashboard-grid-single">' +
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
                    Domus.UI.bindActionMenus();
                    bindDetailActions(id);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id) {
            const detailsBtn = document.getElementById('domus-partner-masterdata');
            const deleteBtn = document.getElementById('domus-partner-delete');

            detailsBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                openPartnerModal(id, 'view');
            });
            deleteBtn?.addEventListener('click', () => {
                Domus.UI.confirmAction({
                    message: t('domus', 'Delete {entity}?', { entity: t('domus', 'Partner') }),
                    confirmLabel: t('domus', 'Delete')
                }).then(confirmed => {
                    if (!confirmed) {
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
            });

            document.getElementById('domus-add-partner-tenancy')?.addEventListener('click', () => {
                Domus.Tenancies.openCreateModal({ partnerId: id }, () => renderDetail(id));
            });
            document.getElementById('domus-add-partner-tenancy-inline')?.addEventListener('click', () => {
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
                if (!data.partnerType) {
                    Domus.UI.showNotification(t('domus', 'Partner type is required.'), 'error');
                    return;
                }
                onSubmit(data);
            });
        }

        function renderDisplay(value) {
            const safeValue = value || value === 0 ? String(value) : '';
            return '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(safeValue) + '</div>';
        }

        function inputField(name, label, value, opts = {}) {
            const isView = opts.isView;
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
                content: isView ? renderDisplay(value) : content,
                className: opts.className
            });
        }

        function selectField(name, label, options, selected, opts = {}) {
            const isView = opts.isView;
            const current = selected || options[0]?.value;
            const attrs = ['name="' + Domus.Utils.escapeHtml(name) + '"'];
            if (opts.disabled) {
                attrs.push('disabled');
            }
            if (opts.required && !isView) {
                attrs.push('required');
            }
            const content = isView
                ? renderDisplay(options.find(opt => opt.value === current)?.label || current)
                : '<select ' + attrs.join(' ') + '>' +
                options.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (opt.value === current ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select>';
            return Domus.UI.buildFormRow({
                label,
                required: opts.required && !isView,
                content,
                className: opts.className
            });
        }

        function buildPartnerFields(partner, options = {}) {
            const mode = options.mode || 'edit';
            const isView = mode === 'view';
            const rowClassName = options.rowClassName;
            const partnerTypeConfig = options.partnerTypeConfig || Domus.Permission.getPartnerTypeConfig();
            const partnerTypeOptions = options.partnerTypeOptions || getPartnerTypeOptions();
            const defaultPartnerType = partner?.partnerType || partnerTypeConfig.defaultType;
            const hiddenFields = [];

            if (partnerTypeConfig.hideField && defaultPartnerType) {
                hiddenFields.push('<input type="hidden" name="partnerType" value="' + Domus.Utils.escapeHtml(defaultPartnerType) + '">');
            }

            const rows = [
                inputField('name', t('domus', 'Name'), partner?.name || '', { required: true, isView, className: rowClassName }),
                ...(partnerTypeConfig.hideField ? [] : [selectField('partnerType', t('domus', 'Type'), partnerTypeOptions, defaultPartnerType, {
                    disabled: partnerTypeConfig.disabled,
                    required: true,
                    isView,
                    className: rowClassName
                })]),
                inputField('street', t('domus', 'Street'), partner?.street || '', { isView, className: rowClassName }),
                inputField('zip', t('domus', 'ZIP'), partner?.zip || '', { isView, className: rowClassName }),
                inputField('city', t('domus', 'City'), partner?.city || '', { isView, className: rowClassName }),
                inputField('country', t('domus', 'Country'), partner?.country || '', { isView, className: rowClassName }),
                inputField('email', t('domus', 'Email'), partner?.email || '', { type: 'email', isView, className: rowClassName }),
                inputField('phone', t('domus', 'Phone'), partner?.phone || '', { isView, className: rowClassName })
            ];

            return { rows, hiddenFields };
        }

        function buildPartnerForm(partner, options = {}) {
            const mode = options.mode || 'edit';
            const isView = mode === 'view';
            const fields = buildPartnerFields(partner, {
                mode,
                partnerTypeConfig: options.partnerTypeConfig,
                partnerTypeOptions: options.partnerTypeOptions
            });

            const actions = isView
                ? '<div class="domus-form-actions"><button type="button" id="domus-partner-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button></div>'
                : '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-partner-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-partner-form" data-mode="' + Domus.Utils.escapeHtml(mode) + '">' +
                fields.hiddenFields.join('') +
                Domus.UI.buildFormTable(fields.rows) +
                actions +
                '</form>' +
                '</div>';
        }

        return {
            renderList,
            renderDetail,
            renderInline,
            renderPartnerContact,
            renderPartnerContactList,
            bindContactActions,
            getPartnerTypeOptions,
            getPartnerTypeLabel,
            buildPartnerFields,
            openCreateModal
        };
    })();

    /**
     * Partner relations
     */
    Domus.PartnerRelations = (function() {
        function renderSection(partners, options = {}) {
            const entityType = options.entityType || 'unit';
            const addId = `domus-${entityType}-add-partner`;
            const emptyAddId = `domus-${entityType}-add-partner-empty`;
            const header = Domus.UI.buildSectionHeader(t('domus', 'Partners'), {
                id: addId,
                title: t('domus', 'Add {entity}', { entity: t('domus', 'Partner') }),
                iconClass: 'domus-icon-add'
            });
            const rows = (partners || []).map(partner => {
                const contact = [partner.email, partner.phone].filter(Boolean).join(' • ');
                return {
                    cells: [
                        Domus.Partners.renderPartnerContact(partner),
                        Domus.Utils.escapeHtml(Domus.Partners.getPartnerTypeLabel(partner.partnerType)),
                        Domus.Utils.escapeHtml(contact || '—')
                    ],
                    dataset: { navigate: 'partnerDetail', args: partner.id }
                };
            });
            const body = rows.length
                ? Domus.UI.buildTable([t('domus', 'Name'), t('domus', 'Type'), t('domus', 'Contact')], rows, { wrapPanel: false })
                : '<div class="domus-empty-state">' +
                '<p>' + Domus.Utils.escapeHtml(t('domus', 'No partners linked yet.')) + '</p>' +
                Domus.UI.buildIconButton('domus-icon-add', t('domus', 'Add {entity}', { entity: t('domus', 'Partner') }), { id: emptyAddId }) +
                '</div>';

            return '<div class="domus-panel">' + header + '<div class="domus-panel-body">' + body + '</div></div>';
        }

        function bindSection(options = {}) {
            const entityType = options.entityType || 'unit';
            const entityId = options.entityId;
            const onRefresh = options.onRefresh;
            const addBtn = document.getElementById(`domus-${entityType}-add-partner`);
            const emptyBtn = document.getElementById(`domus-${entityType}-add-partner-empty`);
            const openModal = () => openAddModal(entityType, entityId, onRefresh);
            addBtn?.addEventListener('click', openModal);
            emptyBtn?.addEventListener('click', openModal);
            Domus.Partners.bindContactActions();
        }

        function openAddModal(entityType, entityId, onRefresh) {
            Domus.Api.getPartners()
                .then(partners => {
                    const existingPartners = (partners || []).filter(partner => !['tenant', 'owner'].includes(partner.partnerType));
                    const partnerOptions = [{ value: '', label: t('domus', 'Create new partner') }].concat(existingPartners.map(partner => ({
                        value: partner.id,
                        label: partner.name || `${t('domus', 'Partner')} #${partner.id}`,
                        partnerType: partner.partnerType
                    })));
                    const existingSelect = '<select name="partnerId">' +
                        partnerOptions.map(option => '<option value="' + Domus.Utils.escapeHtml(option.value) + '">' + Domus.Utils.escapeHtml(option.label) + '</option>').join('') +
                        '</select>';
                    const existingRow = Domus.UI.buildFormRow({
                        label: t('domus', 'Existing partner'),
                        content: existingSelect
                    });
                    const partnerTypeOptions = (entityType === 'unit' || entityType === 'property')
                        ? Domus.Partners.getPartnerTypeOptions().filter(option => !['tenant', 'owner'].includes(option.value))
                        : Domus.Partners.getPartnerTypeOptions();
                    const fields = Domus.Partners.buildPartnerFields({}, {
                        mode: 'edit',
                        rowClassName: 'domus-partner-new-field',
                        partnerTypeOptions
                    });
                    const content = '<div class="domus-form">' +
                        '<form id="domus-partner-relation-form">' +
                        fields.hiddenFields.join('') +
                        Domus.UI.buildFormTable([existingRow].concat(fields.rows)) +
                        '<div class="domus-form-actions">' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                        '<button type="button" id="domus-partner-relation-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '</div>' +
                        '</form>' +
                        '</div>';

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Partner') }),
                        content
                    });
                    bindRelationForm(modal, { entityType, entityId, onRefresh, partnerOptions });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindRelationForm(modalContext, options) {
            const form = modalContext.modalEl.querySelector('#domus-partner-relation-form');
            const cancel = modalContext.modalEl.querySelector('#domus-partner-relation-cancel');
            const existingSelect = form?.querySelector('select[name="partnerId"]');
            const newRows = form?.querySelectorAll('.domus-partner-new-field') || [];
            const newInputs = form?.querySelectorAll('.domus-partner-new-field input, .domus-partner-new-field select, .domus-partner-new-field textarea') || [];

            function toggleNewFields() {
                const hasExisting = Boolean(existingSelect?.value);
                newRows.forEach(row => row.classList.toggle('domus-hidden', hasExisting));
                newInputs.forEach(input => {
                    if (hasExisting) {
                        input.setAttribute('disabled', 'disabled');
                    } else {
                        input.removeAttribute('disabled');
                    }
                });
            }

            existingSelect?.addEventListener('change', toggleNewFields);
            toggleNewFields();
            cancel?.addEventListener('click', modalContext.close);

            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = {};
                const selectedPartner = existingSelect?.value;
                if (selectedPartner) {
                    data.partnerId = selectedPartner;
                } else {
                    Array.prototype.forEach.call(form.elements, el => {
                        if (!el.name || el.disabled || el.name === 'partnerId') {
                            return;
                        }
                        data[el.name] = el.value;
                    });
                    if (!data.name) {
                        Domus.UI.showNotification(t('domus', 'Name is required.'), 'error');
                        return;
                    }
                    if (!data.partnerType) {
                        Domus.UI.showNotification(t('domus', 'Partner type is required.'), 'error');
                        return;
                    }
                }

                const request = options.entityType === 'property'
                    ? Domus.Api.createPropertyPartner(options.entityId, data)
                    : Domus.Api.createUnitPartner(options.entityId, data);

                request
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Partner linked.'), 'success');
                        modalContext.close();
                        options.onRefresh?.();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        return { renderSection, bindSection };
    })();

    /**
     * Tenancies view
     */
})();

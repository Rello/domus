(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Tenancies = (function() {
        function formatPartnerNames(partners) {
            return (partners || [])
                .map(p => p.name)
                .filter(Boolean)
                .join(', ');
        }

        function formatUnitLabel(tenancy) {
            if (tenancy.unitLabel) {
                return tenancy.unitLabel;
            }
            if (tenancy.unitId) {
                return `${t('domus', 'Unit')} #${tenancy.unitId}`;
            }
            return '';
        }

        function formatStatusLabel(status) {
            if (!status) return '';
            const normalized = String(status).toLowerCase();
            if (normalized === 'active') return t('domus', 'Active');
            if (normalized === 'future' || normalized === 'historical') return t('domus', 'Inactive');
            return String(status);
        }

        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: Domus.Role.getTenancyLabels().plural }));
            Domus.Api.getTenancies()
                .then(tenancies => {
                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const canManageTenancies = Domus.Role.hasCapability('manageTenancies');
                    const toolbar = '<div class="domus-toolbar">' +
                        (canManageTenancies && tenancyLabels.action ? Domus.UI.buildIconButton('domus-icon-add', tenancyLabels.action, { id: 'domus-tenancy-create' }) : '') +
                        '</div>';
                    const rows = (tenancies || []).map(tn => {
                        const partnerLabel = Domus.Partners.renderPartnerContactList(tn.partners, {
                            fallbackName: tn.partnerName,
                            emptyLabel: '—'
                        });
                        return {
                            cells: [
                                Domus.Utils.escapeHtml(formatUnitLabel(tn)),
                                partnerLabel || Domus.Utils.escapeHtml(''),
                                Domus.Utils.escapeHtml(formatStatusLabel(tn.status))
                            ],
                            dataset: { navigate: 'tenancyDetail', args: tn.id }
                        };
                    });
                    const hasRows = rows.length > 0;
                    const table = Domus.UI.buildTable([
                        t('domus', 'Unit'), t('domus', 'Partner'), t('domus', 'Status')
                    ], rows);
                    const emptyState = Domus.UI.buildEmptyStateAction(
                        t('domus', 'There is no {entity} yet. Create the first one', {
                            entity: tenancyLabels.plural
                        }),
                        {
                            iconClass: 'domus-icon-tenancy',
                            actionId: 'domus-tenancies-empty-create'
                        }
                    );
                    Domus.UI.renderContent(toolbar + (hasRows ? table : emptyState));
                    bindList();
                    Domus.Partners.bindContactActions();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            document.getElementById('domus-tenancy-create')?.addEventListener('click', () => openCreateModal());
            document.getElementById('domus-tenancies-empty-create')?.addEventListener('click', () => openCreateModal());
            Domus.UI.bindRowNavigation();
        }

        function renderInline(tenancies, options = {}) {
            const rows = (tenancies || []).map(tn => ({
                cells: [
                    Domus.Utils.escapeHtml(formatUnitLabel(tn)),
                    Domus.Partners.renderPartnerContactList(tn.partners, {
                        fallbackName: tn.partnerName,
                        emptyLabel: '—'
                    }) || Domus.Utils.escapeHtml(''),
                    Domus.Utils.escapeHtml(formatStatusLabel(tn.status)),
                    Domus.Utils.escapeHtml(tn.period || '')
                ],
                dataset: tn.id ? { navigate: 'tenancyDetail', args: tn.id } : null
            }));
            if (!rows.length && options.emptyMessage) {
                return Domus.UI.buildEmptyStateAction(options.emptyMessage, {
                    iconClass: options.emptyIconClass,
                    actionId: options.emptyActionId
                });
            }
            return Domus.UI.buildTable([
                t('domus', 'Unit'), t('domus', 'Partners'), t('domus', 'Status'), t('domus', 'Period')
            ], rows, { wrapPanel: false });
        }

        function openCreateModal(prefill = {}, onCreated, submitFn = Domus.Api.createTenancy, title, successMessage, modalOptions = {}) {
            const tenancyLabels = Domus.Role.getTenancyLabels();
            const effectiveTitle = title || t('domus', 'Add {entity}', { entity: tenancyLabels.singular });
            const effectiveSuccessMessage = successMessage || t('domus', '{entity} created.', { entity: Domus.Role.getTenancyLabels().singular });
            const partnerTypeFilter = Domus.Role.isBuildingMgmtView() ? 'owner' : 'tenant';
            Promise.all([
                Domus.Api.getUnits(),
                Domus.Api.getPartners(partnerTypeFilter)
            ])
                .then(([units, partners]) => {
                    const unitOptions = (units || []).map(u => ({
                        value: u.id,
                        label: u.label || `${t('domus', 'Unit')} #${u.id}`
                    }));
                    const partnerOptions = (partners || [])
                        .filter(p => p.partnerType === partnerTypeFilter)
                        .map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Partner')} #${p.id}`
                    }));

                    const content = buildTenancyForm(unitOptions, partnerOptions, prefill, { hideFinancialFields: Domus.Permission.hideTenancyFinancialFields() });
                    const wrappedContent = typeof modalOptions.wrapContent === 'function' ? modalOptions.wrapContent(content) : content;
                    const modal = Domus.UI.openModal({
                        title: effectiveTitle,
                        content: wrappedContent,
                        size: modalOptions.size
                    });
                    bindTenancyForm(modal, data => submitFn(data)
                        .then(created => {
                            Domus.UI.showNotification(effectiveSuccessMessage, 'success');
                            modal.close();
                            (onCreated || renderList)(created);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { requireFinancialFields: !Domus.Permission.hideTenancyFinancialFields() });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function renderDetail(id) {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: Domus.Role.getTenancyLabels().singular }));
            Domus.Api.get('/tenancies/' + id)
                .then(tenancy => {
                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const partnerLabel = formatPartnerNames(tenancy.partners);
                    const stats = Domus.UI.buildStatCards([
                        { label: t('domus', 'Base rent'), value: Domus.Utils.formatCurrency(tenancy.baseRent), hint: t('domus', 'Monthly base rent') },
                        { label: t('domus', 'Service charge'), value: Domus.Utils.formatCurrency(tenancy.serviceCharge), hint: t('domus', 'Service charge') },
                        { label: t('domus', 'Deposit'), value: Domus.Utils.formatCurrency(tenancy.deposit), hint: t('domus', 'Security deposit') }
                    ]);
                    const menuActions = [
                        Domus.UI.buildIconLabelButton('domus-icon-details', t('domus', 'Details'), {
                            id: 'domus-tenancy-details',
                            className: 'domus-action-menu-item'
                        }),
                        Domus.UI.buildIconLabelButton('domus-icon-delete', t('domus', 'Delete'), {
                            id: 'domus-tenancy-delete',
                            className: 'domus-action-menu-item'
                        })
                    ];
                    const actionMenu = Domus.UI.buildActionMenu(menuActions, {
                        label: t('domus', 'Settings'),
                        ariaLabel: t('domus', 'Settings')
                    });
                    const contextActions = [
                        '<button id="domus-tenancy-change">' + Domus.Utils.escapeHtml(t('domus', 'Change conditions')) + '</button>'
                    ];

                    const statusTag = tenancy.status ? '<span class="domus-badge">' + Domus.Utils.escapeHtml(formatStatusLabel(tenancy.status)) + '</span>' : '';
                    const heroMeta = [Domus.Utils.formatDate(tenancy.startDate), Domus.Utils.formatDate(tenancy.endDate)].filter(Boolean).join(' • ');
                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-content">' +
                        '<div class="domus-hero-indicator"><span class="domus-icon domus-icon-tenancy" aria-hidden="true"></span></div>' +
                        '<div class="domus-hero-main">' +
                        '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(tenancy.unitLabel || `${tenancyLabels.singular} #${id}`) + '</div>' +
                        '<h2>' + Domus.Utils.escapeHtml(tenancyLabels.singular) + ' #' + Domus.Utils.escapeHtml(id) + '</h2>' +
                        (heroMeta ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(heroMeta) + '</p>' : '') +
                        '<div class="domus-hero-tags">' + statusTag + '</div>' +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        (actionMenu ? '<div class="domus-hero-actions-row domus-hero-actions-more">' + actionMenu + '</div>' : '') +
                        (contextActions.length ? '<div class="domus-hero-actions-row">' + contextActions.join('') + '</div>' : '') +
                        '</div>' +
                        '</div>';

                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-tenancy-link-doc',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        label: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        iconClass: 'domus-icon-add',
                        dataset: { entityType: 'tenancy', entityId: id }
                    } : null);
                    const detailsHeader = Domus.UI.buildSectionHeader(t('domus', 'Details'));
                    const partnersHeader = Domus.UI.buildSectionHeader(t('domus', 'Partners'));
                    const conditionsHeader = Domus.UI.buildSectionHeader(t('domus', 'Conditions'));

                    const infoList = Domus.UI.buildInfoList([
                        { label: t('domus', 'Unit'), value: formatUnitLabel(tenancy) },
                        { label: t('domus', 'Partners'), value: partnerLabel || t('domus', 'None') },
                        { label: t('domus', 'Start date'), value: Domus.Utils.formatDate(tenancy.startDate) },
                        { label: t('domus', 'End date'), value: Domus.Utils.formatDate(tenancy.endDate) }
                    ]);

                    const content = '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('tenancies') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid">' +
                        '<div class="domus-dashboard-main">' +
                        '<div class="domus-panel">' + detailsHeader + '<div class="domus-panel-body">' + infoList + '</div></div>' +
                        '<div class="domus-panel">' + partnersHeader + '<div class="domus-panel-body">' +
                        Domus.Partners.renderInline(tenancy.partners || []) + '</div></div>' +
                        '<div class="domus-panel">' + conditionsHeader + '<div class="domus-panel-body">' +
                        '<p>' + Domus.Utils.escapeHtml(tenancy.conditions || t('domus', 'No conditions provided.')) + '</p></div></div>' +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('tenancy', id, { showLinkAction: documentActionsEnabled }) + '</div></div>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    Domus.UI.bindRowNavigation();
                    Domus.UI.bindActionMenus();
                    Domus.Partners.bindContactActions();
                    bindDetailActions(id, tenancy);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, tenancy) {
            document.getElementById('domus-tenancy-details')?.addEventListener('click', () => openTenancyModal(id, tenancy, 'view'));
            document.getElementById('domus-tenancy-delete')?.addEventListener('click', () => {
                Domus.UI.confirmAction({
                    message: t('domus', 'Delete {entity}?', { entity: Domus.Role.getTenancyLabels().singular }),
                    confirmLabel: t('domus', 'Delete')
                }).then(confirmed => {
                    if (!confirmed) {
                        return;
                    }
                    Domus.Api.deleteTenancy(id)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: Domus.Role.getTenancyLabels().singular }), 'success');
                            Domus.UI.renderSidebar('');
                            renderList();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            });

            document.getElementById('domus-tenancy-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('tenancy', id, () => renderDetail(id));
            });
            document.getElementById('domus-tenancy-change')?.addEventListener('click', () => openChangeConditionsModal(tenancy));
        }

        function bindTenancyForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-tenancy-form');
            const cancel = modalContext.modalEl.querySelector('#domus-tenancy-cancel');
            const closeBtn = modalContext.modalEl.querySelector('#domus-tenancy-close');
            const mode = (form?.getAttribute('data-mode')) || 'edit';
            const requireFinancialFields = options.requireFinancialFields !== false;
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
                Array.prototype.forEach.call(form.elements, el => {
                    if (!el.name) return;
                    if (el.type === 'checkbox') {
                        data[el.name] = el.checked ? 1 : 0;
                    } else if (el.multiple) {
                        data[el.name] = Array.from(el.selectedOptions).map(opt => opt.value);
                    } else {
                        data[el.name] = el.value;
                    }
                });
                if (!data.unitId || !data.partnerIds || data.partnerIds.length === 0) {
                    Domus.UI.showNotification(t('domus', 'Unit and at least one partner are required.'), 'error');
                    return;
                }
                if (!requireFinancialFields) {
                    delete data.baseRent;
                    delete data.serviceCharge;
                    delete data.deposit;
                }
                const missingStartDate = !data.startDate;
                const missingBaseRent = requireFinancialFields && !data.baseRent;
                if (missingStartDate || missingBaseRent) {
                    const message = missingBaseRent
                        ? t('domus', 'Start date and base rent are required.')
                        : t('domus', 'Start date is required.');
                    Domus.UI.showNotification(message, 'error');
                    return;
                }
                onSubmit(data);
            });
        }

        function openEditModal(id, tenancy) {
            openTenancyModal(id, tenancy, 'edit');
        }

        function openTenancyModal(id, tenancy, mode = 'edit') {
            const partnerTypeFilter = Domus.Role.isBuildingMgmtView() ? 'owner' : 'tenant';
            Promise.all([
                Domus.Api.getUnits(),
                Domus.Api.getPartners(partnerTypeFilter)
            ])
                .then(([units, partners]) => {
                    const unitOptions = (units || []).map(u => ({
                        value: u.id,
                        label: u.label || `${t('domus', 'Unit')} #${u.id}`
                    }));
                    const partnerOptions = (partners || [])
                        .filter(p => p.partnerType === partnerTypeFilter)
                        .map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Partner')} #${p.id}`
                    }));

                    let modal;
                    const headerActions = [];
                    if (mode === 'view') {
                        headerActions.push(Domus.UI.buildModalAction(t('domus', 'Edit'), () => {
                            modal?.close();
                            openTenancyModal(id, tenancy, 'edit');
                        }));
                    }

                    modal = Domus.UI.openModal({
                        title: mode === 'view' ? t('domus', 'Tenancy details') : t('domus', 'Edit {entity}', { entity: Domus.Role.getTenancyLabels().singular }),
                        content: buildTenancyForm(unitOptions, partnerOptions, tenancy, { mode, hideFinancialFields: Domus.Permission.hideTenancyFinancialFields() }),
                        headerActions
                    });
                    bindTenancyForm(modal, data => Domus.Api.updateTenancy(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: Domus.Role.getTenancyLabels().singular }), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { mode, requireFinancialFields: !Domus.Permission.hideTenancyFinancialFields() });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function openChangeConditionsModal(tenancy) {
            const today = new Date().toISOString().split('T')[0];
            const prefill = Object.assign({}, tenancy, { startDate: today, endDate: '' });

            openCreateModal(prefill, created => {
                const targetId = created?.id || tenancy.id;
                renderDetail(targetId);
            }, data => Domus.Api.changeTenancyConditions(tenancy.id, data), t('domus', 'Change conditions'), t('domus', 'Conditions changed.'));
        }

        function buildTenancyForm(unitOptions, partnerOptions, tenancy, options = {}) {
            const tn = tenancy || {};
            const mode = options.mode || 'edit';
            const isView = mode === 'view';
            const hideFinancialFields = options.hideFinancialFields || false;
            if (tn.partnerId && !tn.partnerIds) {
                tn.partnerIds = [tn.partnerId];
            }
            const partnerIds = (tn.partnerIds || []).map(String);
            const selectedUnitId = tn.unitId !== undefined && tn.unitId !== null ? String(tn.unitId) : '';
            const startDate = tn.startDate ? Domus.Utils.escapeHtml(tn.startDate) : new Date().toISOString().split('T')[0];
            const unitLocked = Boolean(selectedUnitId);

            function renderDisplay(value) {
                const safeValue = value || value === 0 ? String(value) : '';
                return '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(safeValue) + '</div>';
            }

            function selectDisplay(options, selected) {
                const found = options.find(opt => String(opt.value) === String(selected));
                return renderDisplay(found?.label || selected);
            }

            function inputField(name, label, value, opts = {}) {
                const required = opts.required && !isView;
                const attrs = [`name="${Domus.Utils.escapeHtml(name)}"`];
                if (opts.type) attrs.push(`type="${Domus.Utils.escapeHtml(opts.type)}"`);
                if (opts.step) attrs.push(`step="${Domus.Utils.escapeHtml(opts.step)}"`);
                if (required) attrs.push('required');
                if (isView || opts.disabled) attrs.push('disabled');
                const content = opts.isTextarea
                    ? `<textarea ${attrs.join(' ')}>${value ? Domus.Utils.escapeHtml(String(value)) : ''}</textarea>`
                    : `<input ${attrs.join(' ')} value="${value ? Domus.Utils.escapeHtml(String(value)) : ''}">`;
                return Domus.UI.buildFormRow({ label, required, content: isView ? renderDisplay(value) : content });
            }

            const unitSelect = isView
                ? selectDisplay(unitOptions, selectedUnitId)
                : '<select name="unitId"' + (unitLocked ? ' disabled' : '') + ' required>' +
                unitOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (selectedUnitId === String(opt.value) ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select>' + (unitLocked ? '<input type="hidden" name="unitId" value="' + Domus.Utils.escapeHtml(selectedUnitId) + '">' : '');

            const partnerSelect = isView
                ? renderDisplay(partnerOptions.filter(opt => partnerIds.includes(String(opt.value))).map(opt => opt.label).join(', '))
                : '<select name="partnerIds" multiple required size="4">' +
                partnerOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (partnerIds.includes(String(opt.value)) ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select>';

            const rows = [
                Domus.UI.buildFormRow({ label: t('domus', 'Unit'), required: !isView, content: unitSelect }),
                Domus.UI.buildFormRow({ label: t('domus', 'Partners'), required: !isView, content: partnerSelect }),
                inputField('startDate', t('domus', 'Start date'), startDate, { type: 'date', required: true }),
                inputField('endDate', t('domus', 'End date'), tn.endDate || '', { type: 'date' })
            ];

            if (!hideFinancialFields) {
                rows.push(
                    inputField('baseRent', t('domus', 'Base rent'), tn.baseRent || '', { type: 'number', step: '0.01', required: true, viewFormatter: Domus.Utils.formatCurrency }),
                    inputField('serviceCharge', t('domus', 'Service charge'), tn.serviceCharge || '', { type: 'number', step: '0.01' }),
                    inputField('deposit', t('domus', 'Deposit'), tn.deposit || '', { type: 'number', step: '0.01' })
                );
            }

            rows.push(
                inputField('conditions', t('domus', 'Conditions'), tn.conditions || '', { isTextarea: true, fullWidth: true })
            );

            const actions = isView
                ? '<div class="domus-form-actions"><button type="button" id="domus-tenancy-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button></div>'
                : '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-tenancy-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-tenancy-form" data-mode="' + Domus.Utils.escapeHtml(mode) + '">' +
                Domus.UI.buildFormTable(rows) +
                actions +
                '</form>' +
                '</div>';
        }

        return { renderList, renderDetail, renderInline, openCreateModal };
    })();

    /**
     * Bookings view
     */
})();

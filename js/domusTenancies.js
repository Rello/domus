/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Tenancies = (function() {
        let previewRequest = 0;

        // Owner-only UI simulation: keep using the existing owner-scoped APIs.
        // Account assignment and renter authorization are deliberately not enabled here.
        function renderRenterPreview(partnerId = '', tenancyId = '') {
            const request = ++previewRequest;
            const isCurrent = () => request === previewRequest && Domus.state.currentView === 'renterPreview';
            const escape = Domus.Utils.escapeHtml;
            let header = '<section class="domus-panel domus-renter-preview">' +
                '<div class="domus-panel-body"><h2>' + escape(t('domus', 'Renter preview')) + '</h2>' +
                '<p class="muted">' + escape(t('domus', 'Temporary preview using your own data. No renter account access is granted.')) + '</p>' +
                '<button type="button" id="domus-renter-preview-exit">' + escape(t('domus', 'Exit preview')) + '</button></div></section>';
            const bindControls = () => {
                document.getElementById('domus-renter-preview-exit')?.addEventListener('click', () => Domus.Router.navigate('dashboard'));
                document.getElementById('domus-preview-renter')?.addEventListener('change', event => {
                    Domus.Router.navigate('renterPreview', [event.target.value]);
                });
                document.getElementById('domus-preview-tenancy')?.addEventListener('change', event => {
                    Domus.Router.navigate('renterPreview', [partnerId, event.target.value]);
                });
            };
            const showMessage = (message, error = false) => {
                if (!isCurrent()) return;
                Domus.UI.renderContent(header + '<p class="' + (error ? 'domus-error' : 'domus-empty-state') + '" role="status">' + escape(message) + '</p>');
                bindControls();
            };
            showMessage(t('domus', 'Loading…'));
            return Promise.all([Domus.Api.getPartners('tenant'), Domus.Api.getTenancies()])
                .then(([partners, tenancies]) => {
                    if (!isCurrent()) return;
                    const renters = (partners || []).filter(partner => partner.partnerType === 'tenant')
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    const partner = renters.find(item => String(item.id) === String(partnerId));
                    const assigned = partner ? (tenancies || []).filter(tenancy =>
                        (tenancy.partnerIds || []).some(id => String(id) === String(partner.id))) : [];
                    const selected = assigned.find(tenancy => String(tenancy.id) === String(tenancyId)) || assigned[0];
                    const renterOptions = '<option value="">' + escape(t('domus', 'Select a renter')) + '</option>' +
                        renters.map(item => '<option value="' + escape(item.id) + '"' + (item === partner ? ' selected' : '') + '>' + escape(item.name) + '</option>').join('');
                    const tenancyOptions = assigned.map(item => '<option value="' + escape(item.id) + '"' + (item === selected ? ' selected' : '') + '>' +
                        escape(formatUnitLabel(item) + ' · ' + Domus.Utils.formatDate(item.startDate) + ' – ' +
                            (item.endDate ? Domus.Utils.formatDate(item.endDate) : t('domus', 'Ongoing'))) + '</option>').join('');
                    header = '<section class="domus-panel domus-renter-preview"><div class="domus-panel-body">' +
                        '<h2>' + escape(t('domus', 'Renter preview')) + '</h2>' +
                        '<p class="muted">' + escape(t('domus', 'Temporary preview using your own data. No renter account access is granted.')) + '</p>' +
                        '<div class="domus-renter-preview-controls"><div class="domus-renter-preview-field"><label for="domus-preview-renter">' + escape(t('domus', 'Simulate renter')) + '</label>' +
                        '<select id="domus-preview-renter">' + renterOptions + '</select></div>' +
                        (assigned.length > 1 ? '<div class="domus-renter-preview-field"><label for="domus-preview-tenancy">' + escape(t('domus', 'My tenancies')) + '</label>' +
                            '<select id="domus-preview-tenancy">' + tenancyOptions + '</select></div>' : '') +
                        '<button type="button" id="domus-renter-preview-exit">' + escape(t('domus', 'Exit preview')) + '</button></div></div></section>';
                    if (!renters.length) return showMessage(t('domus', 'No renter contacts available to preview.'));
                    if (!partner) return showMessage(t('domus', 'Select a renter to preview their tenancy.'));
                    if (!selected) return showMessage(t('domus', 'No tenancies are assigned to this renter.'));
                    return renderDetail(selected.id, { previewPartner: partner, header, isCurrent, onRendered: bindControls });
                })
                .catch(error => showMessage(error.message, true));
        }

        function renderRenterContact(partner) {
            const escape = Domus.Utils.escapeHtml;
            const fields = [
                [t('domus', 'Name'), partner.name],
                [t('domus', 'Address'), [partner.street, [partner.zip, partner.city].filter(Boolean).join(' '), partner.country].filter(Boolean).join(', ')],
                [t('domus', 'Email'), partner.email],
                [t('domus', 'Phone'), partner.phone]
            ];
            return '<dl class="domus-renter-contact">' + fields.map(([label, value]) =>
                '<dt>' + escape(label) + '</dt><dd>' + escape(value || '—') + '</dd>').join('') + '</dl>';
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

        function renderStatusBadge(status) {
            const label = formatStatusLabel(status);
            if (!label) {
                return '';
            }
            const normalized = String(status || '').toLowerCase();
            const badgeClass = normalized === 'active' ? 'domus-badge domus-badge-success' : 'domus-badge domus-badge-muted';
            return '<span class="' + badgeClass + '">' + Domus.Utils.escapeHtml(label) + '</span>';
        }

        function formatPartnerNames(partners) {
            return (partners || [])
                .map(partner => partner?.name)
                .filter(Boolean)
                .join(', ');
        }

        function buildTenancyLink(tenancy, content) {
            if (!tenancy.id) {
                return content;
            }
            const label = Domus.Role.getTenancyLabels().singular + ' #' + tenancy.id;
            return '<a class="domus-table-action-link" data-domus-row-link href="#/tenancyDetail/' +
                encodeURIComponent(String(tenancy.id)) + '" aria-label="' + Domus.Utils.escapeHtml(label) + '">' +
                content + '</a>';
        }

        function renderList() {
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
                                buildTenancyLink(tn, Domus.Utils.escapeHtml(formatUnitLabel(tn))),
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
            const hideUnitColumn = Boolean(options.hideUnitColumn);
            const hidePartnersColumn = Boolean(options.hidePartnersColumn);
            const statusAsBadge = Boolean(options.statusAsBadge);
            const headers = [];
            if (!hideUnitColumn) {
                headers.push(t('domus', 'Unit'));
            }
            if (!hidePartnersColumn) {
                headers.push(t('domus', 'Partners'));
            }
            headers.push(t('domus', 'Status'), t('domus', 'Period'));

            const rows = (tenancies || []).map(tn => {
                const cells = [];
                if (!hideUnitColumn) {
                    cells.push(buildTenancyLink(tn, Domus.Utils.escapeHtml(formatUnitLabel(tn))));
                }
                if (!hidePartnersColumn) {
                    cells.push(
                        Domus.Partners.renderPartnerContactList(tn.partners, {
                            fallbackName: tn.partnerName,
                            emptyLabel: '—'
                        }) || Domus.Utils.escapeHtml('')
                    );
                }
                const statusContent = statusAsBadge
                    ? renderStatusBadge(tn.status)
                    : Domus.Utils.escapeHtml(formatStatusLabel(tn.status));
                cells.push(
                    hideUnitColumn && hidePartnersColumn ? buildTenancyLink(tn, statusContent) : statusContent,
                    Domus.Utils.escapeHtml([Domus.Utils.formatDate(tn.startDate), tn.endDate ? Domus.Utils.formatDate(tn.endDate) : t('domus', 'Ongoing')].filter(Boolean).join(' – '))
                );
                return {
                    cells,
                    dataset: tn.id ? { navigate: 'tenancyDetail', args: tn.id } : null
                };
            });
            if (!rows.length && options.emptyMessage) {
                return Domus.UI.buildEmptyStateAction(options.emptyMessage, {
                    iconClass: options.emptyIconClass,
                    actionId: options.emptyActionId
                });
            }
            return Domus.UI.buildTable(headers, rows, { wrapPanel: false });
        }

        function openTenancyCreateForm(prefill = {}, onCreated, submitFn = Domus.Api.createTenancy, title, successMessage, modalOptions = {}) {
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

                    const content = buildTenancyForm(unitOptions, partnerOptions, prefill, {
                        hideFinancialFields: Domus.Permission.hideTenancyFinancialFields(),
                        lockPartnerIds: modalOptions.lockPartnerIds === true,
                        hideUnitField: modalOptions.hideUnitField === true,
                        hidePartnerField: modalOptions.hidePartnerField === true
                    });
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
                    {
                        requireFinancialFields: !Domus.Permission.hideTenancyFinancialFields(),
                        requireAssignmentFields: modalOptions.requireAssignmentFields !== false
                    });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function getTenancyWorkflowSteps(partnerTypeLabel) {
            return [
                { label: t('domus', 'Create {partnerType}', { partnerType: partnerTypeLabel }) },
                { label: t('domus', 'Create tenancy') }
            ];
        }

        function openGuidedPartnerStep(prefill, steps, partnerType, partnerTypeLabel, onFinished) {
            const partnerTypeConfig = {
                defaultType: partnerType,
                hideField: true,
                disabled: true
            };
            Domus.Api.getPartners(partnerType)
                .then(partners => {
                    const existingPartners = (partners || []).filter(partner => partner.partnerType === partnerType);
                    const existingSelect = '<select name="existingPartnerId">' +
                        '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'Create new {partnerType}', { partnerType: partnerTypeLabel })) + '</option>' +
                        existingPartners.map(partner => '<option value="' + Domus.Utils.escapeHtml(partner.id) + '">' + Domus.Utils.escapeHtml(partner.name || `${partnerTypeLabel} #${partner.id}`) + '</option>').join('') +
                        '</select>';
                    const existingRow = Domus.UI.buildFormRow({
                        label: t('domus', 'Existing {partnerType}', { partnerType: partnerTypeLabel }),
                        content: existingSelect
                    });
                    const fields = Domus.Partners.buildPartnerFields(
                        { partnerType },
                        {
                            mode: 'edit',
                            rowClassName: 'domus-guided-partner-field',
                            partnerTypeConfig
                        }
                    );

                    const content = '<div class="domus-form">' +
                        '<form id="domus-guided-partner-form">' +
                        fields.hiddenFields.join('') +
                        Domus.UI.buildFormTable([existingRow].concat(fields.rows)) +
                        '<div class="domus-form-actions">' +
                        '<button type="button" id="domus-guided-partner-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Next')) + '</button>' +
                        '</div>' +
                        '</form>' +
                        '</div>';

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Create {partnerType}', { partnerType: partnerTypeLabel }),
                        content: Domus.UI.buildGuidedWorkflowLayout(steps, 0, content),
                        size: 'large'
                    });
                    bindGuidedPartnerStep(modal, {
                        prefill,
                        steps,
                        onFinished,
                        existingPartners
                    });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function bindGuidedPartnerStep(modalContext, options) {
            const form = modalContext.modalEl.querySelector('#domus-guided-partner-form');
            const cancel = modalContext.modalEl.querySelector('#domus-guided-partner-cancel');
            const existingSelect = form?.querySelector('select[name="existingPartnerId"]');
            const partnerFields = form?.querySelectorAll('.domus-guided-partner-field input, .domus-guided-partner-field select, .domus-guided-partner-field textarea') || [];
            const existingPartnersById = {};
            (options.existingPartners || []).forEach(partner => {
                existingPartnersById[String(partner.id)] = partner;
            });

            function setFieldValue(name, value) {
                const input = form?.querySelector('[name="' + name + '"]');
                if (input) {
                    input.value = value || '';
                }
            }

            function toggleFields() {
                const selectedId = String(existingSelect?.value || '');
                const selectedPartner = existingPartnersById[selectedId];
                const hasExisting = Boolean(selectedPartner);

                if (hasExisting) {
                    setFieldValue('name', selectedPartner.name);
                    setFieldValue('street', selectedPartner.street);
                    setFieldValue('zip', selectedPartner.zip);
                    setFieldValue('city', selectedPartner.city);
                    setFieldValue('country', selectedPartner.country);
                    setFieldValue('email', selectedPartner.email);
                    setFieldValue('phone', selectedPartner.phone);
                }

                partnerFields.forEach(field => {
                    if (hasExisting) {
                        field.setAttribute('disabled', 'disabled');
                    } else {
                        field.removeAttribute('disabled');
                    }
                });
            }

            existingSelect?.addEventListener('change', toggleFields);
            toggleFields();
            modalContext.protectChanges();
            cancel?.addEventListener('click', modalContext.requestClose);

            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const selectedId = String(existingSelect?.value || '');
                const selectedPartner = existingPartnersById[selectedId];

                if (selectedPartner) {
                    modalContext.close();
                    openGuidedTenancyStep(options.prefill, selectedPartner, options.steps, options.onFinished);
                    return;
                }

                const data = {};
                Array.prototype.forEach.call(form.elements, el => {
                    if (!el.name || el.disabled || el.name === 'existingPartnerId') {
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

                Domus.Api.createPartner(data)
                    .then(createdPartner => {
                        Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Partner') }), 'success');
                        modalContext.close();
                        openGuidedTenancyStep(options.prefill, createdPartner, options.steps, options.onFinished);
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function openGuidedTenancyStep(prefill, partner, steps, onFinished) {
            const effectivePrefill = Object.assign({}, prefill, {
                partnerName: partner?.name || prefill?.partnerName || '',
                partnerIds: partner?.id ? [partner.id] : (prefill?.partnerIds || (prefill?.partnerId ? [prefill.partnerId] : []))
            });
            openTenancyCreateForm(
                effectivePrefill,
                created => {
                    if (typeof onFinished === 'function') {
                        onFinished(created);
                        return;
                    }
                    renderList();
                },
                Domus.Api.createTenancy,
                t('domus', 'Create tenancy'),
                null,
                {
                    wrapContent: content => Domus.UI.buildGuidedWorkflowLayout(steps, 1, content),
                    lockPartnerIds: true,
                    size: 'large'
                }
            );
        }

        function openGuidedCreateWorkflow(prefill = {}, onFinished) {
            const partnerType = Domus.Role.isBuildingMgmtView() ? 'owner' : 'tenant';
            const partnerTypeLabel = Domus.Partners.getPartnerTypeLabel(partnerType);
            const steps = getTenancyWorkflowSteps(partnerTypeLabel);
            openGuidedPartnerStep(prefill, steps, partnerType, partnerTypeLabel, onFinished);
        }

        function openCreateModal(prefill = {}, onCreated, submitFn = Domus.Api.createTenancy, title, successMessage, modalOptions = {}) {
            const hasPartnerPrefill = Boolean(prefill?.partnerId || (prefill?.partnerIds && prefill.partnerIds.length));
            if (modalOptions.useGuidedWorkflow === false || hasPartnerPrefill) {
                openTenancyCreateForm(prefill, onCreated, submitFn, title, successMessage, modalOptions);
                return;
            }
            openGuidedCreateWorkflow(prefill, onCreated);
        }

        function renderDetail(id, options = {}) {
            const previewPartner = options.previewPartner;
            const route = JSON.stringify([Domus.state.currentView, Domus.state.currentViewArgs]);
            const isCurrent = options.isCurrent || (() => route === JSON.stringify([Domus.state.currentView, Domus.state.currentViewArgs]));
            const loadingMessage = t('domus', 'Loading {entity}…', { entity: t('domus', 'Tenancy') });
            if (options.header) {
                Domus.UI.renderContent(options.header + '<p role="status">' + Domus.Utils.escapeHtml(loadingMessage) + '</p>');
                options.onRendered?.();
            } else {
                Domus.UI.showLoading(loadingMessage);
            }
            return Domus.Api.get('/tenancies/' + id)
                .then(tenancy => {
                    if (!isCurrent()) return;
                    if (previewPartner && !(tenancy.partnerIds || []).some(partnerId => String(partnerId) === String(previewPartner.id))) {
                        throw new Error(t('domus', 'No tenancies are assigned to this renter.'));
                    }
                    const tenancyLabels = previewPartner ? { singular: t('domus', 'Tenancy') } : Domus.Role.getTenancyLabels();
                    const canManageTenancies = !previewPartner && Domus.Role.hasCapability('manageTenancies');
                    const documentActionsEnabled = !previewPartner && Domus.Role.hasCapability('manageDocuments');
                    const menuActions = canManageTenancies ? [
                        Domus.UI.buildIconLabelButton('domus-icon-details', t('domus', 'Details'), {
                            id: 'domus-tenancy-details',
                            className: 'domus-action-menu-item'
                        }),
                        Domus.UI.buildIconLabelButton('domus-icon-delete', t('domus', 'Delete'), {
                            id: 'domus-tenancy-delete',
                            className: 'domus-action-menu-item'
                        })
                    ] : [];
                    const actionMenu = menuActions.length ? Domus.UI.buildActionMenu(menuActions, {
                        label: t('domus', 'More actions'),
                        ariaLabel: t('domus', 'More actions')
                    }) : '';
                    const statusTag = renderStatusBadge(tenancy.status);
                    const tenancyPeriod = [Domus.Utils.formatDate(tenancy.startDate), tenancy.endDate ? Domus.Utils.formatDate(tenancy.endDate) : t('domus', 'Ongoing')].filter(Boolean).join(' – ');
                    const partnerSummary = previewPartner ? previewPartner.name : formatPartnerNames(tenancy.partners) || tenancy.partnerName || '';
                    const heroMetaLines = [
                        tenancyPeriod ? Domus.UI.buildHeroMetaLine('domus-icon-booking', tenancyPeriod) : '',
                        Domus.UI.buildHeroMetaLine('domus-icon-partner', partnerSummary || t('domus', 'No tenant assigned'))
                    ].filter(Boolean).join('');
                    const hero = Domus.UI.buildDetailHero({
                        indicator: '<div class="domus-hero-indicator domus-tenancy-hero-indicator">' +
                            '<span class="domus-icon domus-icon-tenancy" aria-hidden="true"></span></div>',
                        kicker: `${tenancyLabels.singular} #${id}`,
                        title: tenancy.unitLabel || tenancyLabels.singular,
                        badges: statusTag,
                        meta: heroMetaLines,
                        actions: actionMenu
                    });

                    const kpiTiles = '<div class="domus-kpi-tiles domus-kpi-tiles-tenancy-detail domus-panel-row domus-panel-row-thirds">' +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Base rent'),
                            value: Domus.Utils.formatCurrency(tenancy.baseRent) || '—',
                            subline: t('domus', 'Monthly base rent')
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Service charge'),
                            value: Domus.Utils.formatCurrency(tenancy.serviceCharge) || '—',
                            subline: t('domus', 'Monthly service charge')
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Deposit'),
                            value: Domus.Utils.formatCurrency(tenancy.deposit) || '—',
                            subline: t('domus', 'Security deposit')
                        }) +
                        '</div>';
                    const conditionsPanel = '<div class="domus-panel domus-tenancy-conditions-panel">' +
                        Domus.UI.buildSectionHeader(t('domus', 'Conditions')) +
                        '<div class="domus-panel-body">' +
                        '<div class="domus-tenancy-conditions-copy">' + Domus.Utils.escapeHtml(tenancy.conditions || t('domus', 'No conditions provided.')) + '</div>' +
                        '</div>' +
                        '</div>';

                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-tenancy-document-create',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        iconClass: 'domus-icon-add'
                    } : null);
                    const partnersHeader = Domus.UI.buildSectionHeader(previewPartner ? t('domus', 'My details') : t('domus', 'Tenant'));
                    const tenantPanel = '<div class="domus-panel domus-tenancy-tenant-panel">' + partnersHeader + '<div class="domus-panel-body">' +
                        (previewPartner ? renderRenterContact(previewPartner) : Domus.Partners.renderInline(tenancy.partners || [], { linkNameToDetail: true, includeTypeColumn: false, includeEmailColumn: false, showHeader: false })) + '</div></div>';
                    const documentsPanel = '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        (previewPartner ? '<p class="muted">' + Domus.Utils.escapeHtml(t('domus', 'This preview shows all documents linked to this tenancy.')) + '</p>' : '') +
                        Domus.Documents.renderLatestList('tenancy', id, {
                            pageSize: 10,
                            canManageDocuments: documentActionsEnabled,
                            showNotes: !previewPartner,
                            isCurrent,
                            containerId: `domus-tenancy-documents-${id}`,
                            emptyActionId: 'domus-tenancy-documents-empty-create',
                            onEmptyAction: () => {
                                Domus.Documents.openLinkModal('tenancy', id, () => renderDetail(id), 'link', {
                                    unitId: tenancy?.unitId
                                });
                            }
                        }) + '</div></div>';

                    const content = (options.header || '') + '<div class="domus-detail domus-dashboard domus-tenancy-detail">' +
                        (previewPartner ? '' : Domus.UI.buildBackButton('tenancies')) +
                        hero +
                        (canManageTenancies ? '<div class="domus-tenancy-direct-actions">' +
                        Domus.UI.buildQuickActionCard({
                            iconClass: 'domus-icon-edit', title: t('domus', 'Change conditions'),
                            id: 'domus-tenancy-change', compact: true
                        }) +
                        '</div>' : '') +
                        kpiTiles +
                        '<div class="domus-panel-row domus-panel-row-thirds domus-tenancy-detail-row">' +
                        conditionsPanel +
                        tenantPanel +
                        documentsPanel +
                        '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    Domus.UI.bindRowNavigation();
                    Domus.UI.bindActionMenus();
                    Domus.Partners.bindContactActions();
                    if (!previewPartner) bindDetailActions(id, tenancy);
                    options.onRendered?.();
                })
                .catch(err => {
                    if (!isCurrent()) return;
                    Domus.UI.renderContent((options.header || '') + '<p class="domus-error" role="alert">' + Domus.Utils.escapeHtml(err.message) + '</p>');
                    options.onRendered?.();
                });
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
                            Domus.Router.back('tenancies');
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            });

            document.getElementById('domus-tenancy-document-create')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('tenancy', id, () => renderDetail(id), 'link', {
                    unitId: tenancy?.unitId
                });
            });
            document.getElementById('domus-tenancy-change')?.addEventListener('click', () => openChangeConditionsModal(tenancy));
        }

        function bindTenancyForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-tenancy-form');
            const cancel = modalContext.modalEl.querySelector('#domus-tenancy-cancel');
            const closeBtn = modalContext.modalEl.querySelector('#domus-tenancy-close');
            const mode = (form?.getAttribute('data-mode')) || 'edit';
            const requireFinancialFields = options.requireFinancialFields !== false;
            const requireAssignmentFields = options.requireAssignmentFields !== false;
            if (mode === 'view') {
                closeBtn?.addEventListener('click', modalContext.close);
                form?.addEventListener('submit', function(e) {
                    e.preventDefault();
                    modalContext.close();
                });
                return;
            }
            modalContext.protectChanges();
            cancel?.addEventListener('click', modalContext.requestClose);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = {};
                Array.prototype.forEach.call(form.elements, el => {
                    if (!el.name) return;
                    if (el.disabled) return;
                    if (el.name === 'partnerIds' && !el.multiple) {
                        data.partnerIds = data.partnerIds || [];
                        if (el.value) {
                            data.partnerIds.push(el.value);
                        }
                        return;
                    }
                    if (el.type === 'checkbox') {
                        data[el.name] = el.checked ? 1 : 0;
                    } else if (el.multiple) {
                        data[el.name] = Array.from(el.selectedOptions).map(opt => opt.value);
                    } else {
                        data[el.name] = el.value;
                    }
                });
                if (requireAssignmentFields && (!data.unitId || !data.partnerIds || data.partnerIds.length === 0)) {
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
            }, data => Domus.Api.changeTenancyConditions(tenancy.id, data), t('domus', 'Change conditions'), t('domus', 'Conditions changed.'), {
                hideUnitField: true,
                hidePartnerField: true,
                lockPartnerIds: true,
                requireAssignmentFields: false,
                useGuidedWorkflow: false
            });
        }

        function buildTenancyForm(unitOptions, partnerOptions, tenancy, options = {}) {
            const tn = tenancy || {};
            const mode = options.mode || 'edit';
            const isView = mode === 'view';
            const hideFinancialFields = options.hideFinancialFields || false;
            const hideUnitField = options.hideUnitField === true;
            const hidePartnerField = options.hidePartnerField === true;
            const lockPartnerIds = options.lockPartnerIds === true;
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

            const selectedPartnerLabel = partnerOptions.filter(opt => partnerIds.includes(String(opt.value))).map(opt => opt.label).join(', ') || tn.partnerName || '';
            const lockedPartnerInputs = partnerIds.map(partnerId => '<input type="hidden" name="partnerIds" value="' + Domus.Utils.escapeHtml(partnerId) + '">').join('');
            const partnerSelect = (isView || lockPartnerIds)
                ? renderDisplay(selectedPartnerLabel) + lockedPartnerInputs
                : '<select name="partnerIds" multiple required size="4">' +
                partnerOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (partnerIds.includes(String(opt.value)) ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                '</select>';

            const hiddenFields = [];
            const rows = [];

            if (hideUnitField) {
                if (selectedUnitId) {
                    hiddenFields.push('<input type="hidden" name="unitId" value="' + Domus.Utils.escapeHtml(selectedUnitId) + '">');
                }
            } else {
                rows.push(Domus.UI.buildFormRow({ label: t('domus', 'Unit'), required: !isView, content: unitSelect }));
            }

            if (hidePartnerField) {
                hiddenFields.push(lockedPartnerInputs);
            } else {
                rows.push(Domus.UI.buildFormRow({ label: t('domus', 'Partners'), required: !isView, content: partnerSelect }));
            }

            rows.push(
                inputField('startDate', t('domus', 'Start date'), startDate, { type: 'date', required: true }),
                inputField('endDate', t('domus', 'End date'), tn.endDate || '', { type: 'date' })
            );

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
                '<button type="button" id="domus-tenancy-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-tenancy-form" data-mode="' + Domus.Utils.escapeHtml(mode) + '">' +
                hiddenFields.join('') +
                Domus.UI.buildFormTable(rows) +
                actions +
                '</form>' +
                '</div>';
        }

        return { renderList, renderDetail, renderRenterPreview, renderInline, openCreateModal };
    })();

    /**
     * Bookings view
     */
})();

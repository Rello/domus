/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Tenancies = (function() {
        const contactLabels = () => ({ name: t('domus', 'Name'), email: t('domus', 'Email'), phone: t('domus', 'Phone'),
            street: t('domus', 'Street'), zip: t('domus', 'ZIP'), city: t('domus', 'City'), country: t('domus', 'Country') });
        const correctionState = state => ({ pending: t('domus', 'Pending review'), approved: t('domus', 'Approved'),
            rejected: t('domus', 'Rejected'), conflict: t('domus', 'Contact details changed; request not applied') })[state] || '';

        function renderRenter(teamId = '', tenancyId = '') {
            const { isCurrent } = Domus.Router.beginView();
            const escape = Domus.Utils.escapeHtml;
            const show = (message, error = false) => {
                if (!isCurrent()) return;
                Domus.UI.renderContent('<p role="' + (error ? 'alert' : 'status') + '">' + escape(message) + '</p>');
            };
            show(t('domus', 'Loading…'));
            return Domus.Api.get('/renter/me').then(identity => {
                if (!isCurrent()) return;
                Domus.state.renterIdentity = identity;
                const tenancies = identity.tenancies || [];
                if (!tenancies.length) return show(t('domus', 'No tenancies are linked to your account. Contact your property manager.'));
                const selected = tenancies.find(item => item.teamId === teamId && String(item.id) === String(tenancyId));
                if (!selected && tenancies.length > 1) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const rows = tenancies.map(item => ({
                        ...item,
                        status: item.startDate && new Date(item.startDate + 'T00:00:00') > today ? 'future'
                            : item.endDate && new Date(item.endDate + 'T00:00:00') < today ? 'historical' : 'active'
                    }));
                    Domus.UI.renderContent('<div class="domus-panel domus-panel-table">' + renderInline(rows, {
                        hidePartnersColumn: true,
                        hideRentPerSquareMeter: true,
                        statusAsBadge: true,
                        navigation: item => ({ navigate: 'renter', args: item.teamId + ',' + item.id })
                    }) + '</div>');
                    Domus.UI.bindRowNavigation();
                    return;
                }
                if (!selected && teamId) return show(t('domus', 'This tenancy is no longer available to you.'));
                const tenancy = selected || tenancies[0];
                return Domus.Api.get('/renter/teams/' + encodeURIComponent(tenancy.teamId) + '/tenancies/' + tenancy.id).then(payload => {
                    if (!isCurrent()) return;
                    const detailHeader = tenancies.length > 1 ? Domus.UI.buildBackButton('renter') : '';
                    return renderDetail(tenancy.id, { renterPayload: payload, teamId: tenancy.teamId, header: detailHeader, isCurrent });
                });
            }).catch(error => show(error.message, true));
        }

        function renderPendingCorrections(requests) {
            const escape = Domus.Utils.escapeHtml;
            const labels = contactLabels();
            return requests.filter(request => request.state === 'pending').map(request => '<div class="domus-correction-request"><p>' + escape(correctionState(request.state)) + ' · ' +
                escape(Domus.Utils.formatDate(request.createdAt * 1000)) + '</p><dl class="domus-renter-contact">' +
                Object.entries(request.proposed).map(([field, value]) => '<dt>' + escape(labels[field] || field) + '</dt><dd>' +
                    escape(request.original[field] || '—') + ' → ' + escape(value || '—') + '</dd>').join('') + '</dl></div>').join('');
        }

        function renderRenterContacts(payload, preview = false) {
            const escape = Domus.Utils.escapeHtml;
            return payload.contacts.map(contact => '<div>' + renderRenterContact(contact) +
                (!preview ? '<button type="button" data-renter-correct="' + contact.id + '">' + escape(t('domus', 'Request a correction')) + '</button>' : '') +
                renderPendingCorrections((payload.corrections || []).filter(request => request.partnerId === contact.id)) + '</div>').join('');
        }

        function bindCorrectionRequests(payload, teamId, isCurrent) {
            document.querySelectorAll('[data-renter-correct]').forEach(button => button.addEventListener('click', () => {
                const contact = payload.contacts.find(item => String(item.id) === button.dataset.renterCorrect);
                const escape = Domus.Utils.escapeHtml;
                const labels = contactLabels();
                const content = '<form id="domus-renter-correction-form"><p>' + escape(t('domus', 'Your property manager will review these changes before updating your contact details.')) + '</p>' +
                    Object.entries(labels).map(([field, label]) => '<label class="domus-renter-correction-field">' + escape(label) +
                        '<input name="' + field + '" value="' + escape(contact[field] || '') + '" maxlength="' + (field === 'zip' ? 32 : 190) + '"' + (field === 'email' ? ' type="email"' : '') + (field === 'name' ? ' required' : '') + '></label>').join('') +
                    '<p data-correction-error role="alert"></p><div class="domus-form-actions"><button type="submit" class="primary">' + escape(t('domus', 'Submit for review')) + '</button></div></form>';
                const modal = Domus.UI.openModal({ title: t('domus', 'Request a correction'), content });
                const form = modal.modalEl.querySelector('#domus-renter-correction-form');
                modal.protectChanges();
                form.addEventListener('submit', async event => {
                    event.preventDefault();
                    const proposed = Object.fromEntries(new FormData(form));
                    const submit = modal.modalEl.querySelector('button[type="submit"]');
                    submit.disabled = true;
                    try {
                        await Domus.Api.post('/renter/teams/' + encodeURIComponent(teamId) + '/partners/' + contact.id + '/corrections', { proposed });
                        modal.close();
                        if (isCurrent()) Domus.Router.navigate('renter', [teamId, payload.tenancy.id]);
                    } catch (error) {
                        if (form.isConnected) { form.querySelector('[data-correction-error]').textContent = error.message; submit.disabled = false; }
                    }
                });
            }));
        }

        async function renderCorrectionReview(partnerId, panel, teamId) {
            const escape = Domus.Utils.escapeHtml;
            try {
                const requests = (await Domus.Api.get('/teams/' + encodeURIComponent(teamId) + '/partners/' + partnerId + '/corrections'))
                    .filter(request => request.state === 'pending');
                if (!panel.isConnected) return;
                panel.closest('section').classList.toggle('domus-hidden', !requests.length);
                panel.innerHTML = requests.length ? requests.map(request => '<div class="domus-correction-request">' + renderPendingCorrections([request]) +
                    (request.state === 'pending' ? '<button type="button" data-correction-approve="' + request.id + '">' + escape(t('domus', 'Approve')) + '</button> ' +
                        '<button type="button" data-correction-reject="' + request.id + '">' + escape(t('domus', 'Reject')) + '</button>' : '') + '</div>').join('') :
                    '<p>' + escape(t('domus', 'No correction requests.')) + '</p>';
                panel.querySelectorAll('[data-correction-approve], [data-correction-reject]').forEach(button => button.addEventListener('click', async () => {
                    const approve = Boolean(button.dataset.correctionApprove);
                    const id = button.dataset.correctionApprove || button.dataset.correctionReject;
                    panel.querySelectorAll('button').forEach(item => { item.disabled = true; });
                    try {
                        const result = await Domus.Api.post('/teams/' + encodeURIComponent(teamId) + '/corrections/' + id, { approve });
                        if (!panel.isConnected) return;
                        Domus.UI.showNotification(correctionState(result.state));
                        Domus.Router.navigate('partnerDetail', [partnerId]);
                    } catch (error) {
                        if (panel.isConnected) { panel.textContent = error.message; }
                    }
                }));
            } catch (error) { if (panel.isConnected) panel.textContent = error.message; }
        }

        // Owner-only UI simulation: keep using the existing owner-scoped APIs.
        // Personal preview stays a management simulation; Team preview uses the renter serializer.
        function renderRenterPreview(partnerId = '', tenancyId = '') {
            const { isCurrent } = Domus.Router.beginView();
            const escape = Domus.Utils.escapeHtml;
            let header = '<section class="domus-panel domus-renter-preview">' +
                '<div class="domus-panel-body"><h2>' + escape(t('domus', 'Renter preview')) + '</h2>' +
                '<p class="muted">' + escape(t('domus', 'Management preview. Renter access follows the contact’s linked Nextcloud account.')) + '</p>' +
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
                        '<p class="muted">' + escape(t('domus', 'Management preview. Renter access follows the contact’s linked Nextcloud account.')) + '</p>' +
                        '<div class="domus-renter-preview-controls"><div class="domus-renter-preview-field"><label for="domus-preview-renter">' + escape(t('domus', 'Simulate renter')) + '</label>' +
                        '<select id="domus-preview-renter">' + renterOptions + '</select></div>' +
                        (assigned.length > 1 ? '<div class="domus-renter-preview-field"><label for="domus-preview-tenancy">' + escape(t('domus', 'My tenancies')) + '</label>' +
                            '<select id="domus-preview-tenancy">' + tenancyOptions + '</select></div>' : '') +
                        '<button type="button" id="domus-renter-preview-exit">' + escape(t('domus', 'Exit preview')) + '</button></div></div></section>';
                    if (!renters.length) return showMessage(t('domus', 'No renter contacts available to preview.'));
                    if (!partner) return showMessage(t('domus', 'Select a renter to preview their tenancy.'));
                    if (!selected) return showMessage(t('domus', 'No tenancies are assigned to this renter.'));
                    const teamId = Domus.state.managementContext?.activeTeamId;
                    if (teamId) {
                        return Domus.Api.get('/teams/' + encodeURIComponent(teamId) + '/tenancies/' + selected.id + '/renter-preview/' + partner.id)
                            .then(payload => { if (isCurrent()) return renderDetail(selected.id, { renterPayload: payload, previewPartner: partner, header, isCurrent, onRendered: bindControls }); });
                    }
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

        function formatRentPerSquareMeter(tenancy) {
            if (tenancy?.baseRent === null || tenancy?.baseRent === undefined || tenancy?.baseRent === '') return '—';
            const rent = Number(tenancy?.baseRent);
            const livingArea = Number(tenancy?.unitLivingArea);
            if (!Number.isFinite(rent) || !Number.isFinite(livingArea) || livingArea <= 0) return '—';
            return Domus.Utils.formatCurrency(rent / livingArea) + ' / m²';
        }

        function buildTenancyLink(tenancy, content, navigation) {
            if (!tenancy.id) {
                return content;
            }
            if (navigation) {
                const href = Domus.Router.url(navigation.navigate, String(navigation.args).split(','));
                return '<a class="domus-table-action-link" data-domus-row-link href="' +
                    Domus.Utils.escapeHtml(href) + '">' + content + '</a>';
            }
            const label = Domus.Role.getTenancyLabels().singular + ' #' + tenancy.id;
            return '<a class="domus-table-action-link" data-domus-row-link href="' +
                Domus.Utils.escapeHtml(Domus.Router.url('tenancyDetail', [tenancy.id])) + '" aria-label="' + Domus.Utils.escapeHtml(label) + '">' +
                content + '</a>';
        }

        function sortByStartDate(tenancies) {
            return (tenancies || []).slice().sort((a, b) =>
                (b.startDate || '').localeCompare(a.startDate || ''));
        }

        function renderList() {
            const view = Domus.Router.beginView();
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: Domus.Role.getTenancyLabels().plural }));
            Domus.Api.getTenancies()
                .then(tenancies => {
                    if (!view.isCurrent()) return;
                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const canManageTenancies = Domus.Role.hasCapability('manageTenancies');
                    const toolbar = '<div class="domus-toolbar">' +
                        (canManageTenancies && tenancyLabels.action ? Domus.UI.buildIconButton('domus-icon-add', tenancyLabels.action, { id: 'domus-tenancy-create' }) : '') +
                        '</div>';
                    const rows = sortByStartDate(tenancies).map(tn => {
                        const partnerLabel = Domus.Partners.renderPartnerContactList(tn.partners, {
                            fallbackName: tn.partnerName,
                            emptyLabel: '—'
                        });
                        return {
                            cells: [
                                buildTenancyLink(tn, Domus.Utils.escapeHtml(formatUnitLabel(tn))),
                                partnerLabel || Domus.Utils.escapeHtml(''),
                                Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(tn.baseRent) || '—'),
                                Domus.Utils.escapeHtml(formatRentPerSquareMeter(tn)),
                                Domus.Utils.escapeHtml(formatStatusLabel(tn.status))
                            ],
                            dataset: { navigate: 'tenancyDetail', args: tn.id }
                        };
                    });
                    const hasRows = rows.length > 0;
                    const table = Domus.UI.buildTable([
                        t('domus', 'Unit'), t('domus', 'Partner'), t('domus', 'Base rent'), t('domus', 'Base rent per m²'), t('domus', 'Status')
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
                .catch(err => { if (view.isCurrent()) Domus.UI.showError(err.message); });
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
            const hideRentPerSquareMeter = Boolean(options.hideRentPerSquareMeter);
            const headers = [];
            if (!hideUnitColumn) {
                headers.push(t('domus', 'Unit'));
            }
            if (!hidePartnersColumn) {
                headers.push(t('domus', 'Partners'));
            }
            headers.push(t('domus', 'Base rent'));
            if (!hideRentPerSquareMeter) {
                headers.push(t('domus', 'Base rent per m²'));
            }
            headers.push(t('domus', 'Status'), t('domus', 'Period'));

            const rows = sortByStartDate(tenancies).map(tn => {
                const navigation = options.navigation ? options.navigation(tn) : { navigate: 'tenancyDetail', args: tn.id };
                const cells = [];
                if (!hideUnitColumn) {
                    cells.push(buildTenancyLink(tn, Domus.Utils.escapeHtml(formatUnitLabel(tn)), options.navigation ? navigation : null));
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
                cells.push(Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(tn.baseRent) || '—'));
                if (!hideRentPerSquareMeter) {
                    cells.push(Domus.Utils.escapeHtml(formatRentPerSquareMeter(tn)));
                }
                cells.push(
                    hideUnitColumn && hidePartnersColumn ? buildTenancyLink(tn, statusContent, options.navigation ? navigation : null) : statusContent,
                    Domus.Utils.escapeHtml([Domus.Utils.formatDate(tn.startDate), tn.endDate ? Domus.Utils.formatDate(tn.endDate) : t('domus', 'Ongoing')].filter(Boolean).join(' – '))
                );
                return {
                    cells,
                    dataset: tn.id ? navigation : null
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
                        hidePartnerField: modalOptions.hidePartnerField === true,
                        conditionsRows: modalOptions.conditionsRows
                    });
                    const wrappedContent = typeof modalOptions.wrapContent === 'function' ? modalOptions.wrapContent(content) : content;
                    const modal = Domus.UI.openModal({
                        title: effectiveTitle,
                        description: modalOptions.description,
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

        function getTenancyMasterdataStatus(tenancy) {
            const values = [tenancy.unitId, (tenancy.partnerIds || []).length || null, tenancy.startDate, tenancy.conditions];
            // An ongoing tenancy has no end date, so it is not a missing detail.
            if (!Domus.Permission.hideTenancyFinancialFields()) {
                values.push(tenancy.baseRent, tenancy.serviceCharge, tenancy.deposit);
            }
            return { completed: values.filter(Domus.Utils.isValueFilled).length, total: values.length };
        }

        function renderDetail(id, options = {}) {
            const renterPayload = options.renterPayload;
            const previewPartner = options.previewPartner || renterPayload?.contacts?.[0];
            const isCurrent = options.isCurrent || Domus.Router.beginView().isCurrent;
            const loadingMessage = t('domus', 'Loading {entity}…', { entity: t('domus', 'Tenancy') });
            if (options.header) {
                Domus.UI.renderContent(options.header + '<p role="status">' + Domus.Utils.escapeHtml(loadingMessage) + '</p>');
                options.onRendered?.();
            } else {
                Domus.UI.showLoading(loadingMessage);
            }
            return (renterPayload ? Promise.resolve(renterPayload.tenancy) : Domus.Api.get('/tenancies/' + id))
                .then(tenancy => {
                    if (!isCurrent()) return;
                    if (previewPartner && !(tenancy.partnerIds || []).some(partnerId => String(partnerId) === String(previewPartner.id))) {
                        throw new Error(t('domus', 'No tenancies are assigned to this renter.'));
                    }
                    const tenancyLabels = previewPartner ? { singular: t('domus', 'Tenancy') } : Domus.Role.getTenancyLabels();
                    const canManageTenancies = !previewPartner && Domus.Role.hasCapability('manageTenancies');
                    const documentActionsEnabled = !previewPartner && Domus.Role.hasCapability('manageDocuments');
                    const menuActions = canManageTenancies ? [
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
                    const addressLine = [tenancy.unitStreet, tenancy.unitCity].filter(Boolean).join(', ');
                    const heroMetaLines = [
                        addressLine ? Domus.UI.buildHeroMetaLine('domus-icon-location', addressLine) : '',
                        tenancyPeriod ? Domus.UI.buildHeroMetaLine('domus-icon-booking', tenancyPeriod) : '',
                    ].filter(Boolean).join('');
                    const masterdataStatus = getTenancyMasterdataStatus(tenancy);
                    const masterdataIndicator = canManageTenancies
                        ? Domus.UI.buildCompletionIndicator(t('domus', 'Tenancy details'), masterdataStatus.completed, masterdataStatus.total, {
                            id: 'domus-tenancy-details'
                        }) : '';
                    const hero = Domus.UI.buildDetailHero({
                        indicator: '<div class="domus-hero-indicator domus-tenancy-hero-indicator">' +
                            '<span class="domus-icon domus-icon-tenancy" aria-hidden="true"></span></div>',
                        title: tenancy.unitLabel || tenancyLabels.singular,
                        badges: statusTag,
                        meta: heroMetaLines,
                        actions: actionMenu,
                        status: masterdataIndicator
                    });

                    const kpiTiles = '<div class="domus-kpi-tiles domus-kpi-tiles-tenancy-detail domus-panel-row domus-panel-row-thirds">' +
                        Domus.UI.buildTypedKpiTile('money', {
                            headline: t('domus', 'Base rent'),
                            value: tenancy.baseRent,
                            subline: `${t('domus', 'Monthly base rent')} · ${t('domus', 'Base rent per m²')}: ${formatRentPerSquareMeter(tenancy)}`
                        }) +
                        Domus.UI.buildTypedKpiTile('money', {
                            headline: t('domus', 'Service charge'),
                            value: tenancy.serviceCharge,
                            subline: t('domus', 'Monthly service charge')
                        }) +
                        Domus.UI.buildTypedKpiTile('money', {
                            headline: t('domus', 'Deposit'),
                            value: tenancy.deposit,
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
                        (renterPayload ? renderRenterContacts(renterPayload, Boolean(options.previewPartner)) : previewPartner ? renderRenterContact(previewPartner) : Domus.Partners.renderInline(tenancy.partners || [], { linkNameToDetail: true, includeTypeColumn: false, includeEmailColumn: false, showHeader: false })) + '</div></div>';
                    const documentsPanel = '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        (options.previewPartner ? '<p class="muted">' + Domus.Utils.escapeHtml(t('domus', 'This preview shows all documents linked to this tenancy.')) + '</p>' : '') +
                        Domus.Documents.renderLatestList('tenancy', id, {
                            documents: renterPayload ? (renterPayload.documents || []) : undefined,
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
                            iconClass: 'domus-icon-cycle', title: t('domus', 'Change conditions'),
                            id: 'domus-tenancy-change', compact: true
                        }) +
                        (String(tenancy.status).toLowerCase() === 'active' ? Domus.UI.buildQuickActionCard({
                            iconClass: 'domus-icon-calculator', title: t('domus', 'Calculate rent increase'),
                            id: 'domus-tenancy-rent-increase', compact: true
                        }) : '') +
                        '</div>' : '') +
                        kpiTiles +
                        '<div class="domus-panel-row domus-panel-row-thirds domus-tenancy-detail-row">' +
                        conditionsPanel +
                        tenantPanel +
                        documentsPanel +
                        '</div>' +
                        (renterPayload ? '<section class="domus-panel">' + Domus.UI.buildSectionHeader(t('domus', 'Activity')) +
                            '<div class="domus-panel-body">' + Domus.ActionLog.renderList('partner', previewPartner.id, {
                                containerId: 'domus-renter-activity', entries: renterPayload.activities || [], readOnly: true
                            }) + '</div></section>' : '') +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    Domus.UI.bindRowNavigation();
                    Domus.UI.bindActionMenus();
                    Domus.Partners.bindContactActions();
                    if (!previewPartner) bindDetailActions(id, tenancy);
                    if (renterPayload && !options.previewPartner) bindCorrectionRequests(renterPayload, options.teamId, isCurrent);
                    options.onRendered?.();
                })
                .catch(err => {
                    if (!isCurrent()) return;
                    Domus.UI.renderContent((options.header || '') + '<p class="domus-error" role="alert">' + Domus.Utils.escapeHtml(err.message) + '</p>');
                    options.onRendered?.();
                });
        }

        function bindDetailActions(id, tenancy) {
            document.getElementById('domus-tenancy-details')?.addEventListener('click', event => {
                event.preventDefault();
                openTenancyModal(id, tenancy, 'view');
            });
            document.getElementById('domus-tenancy-delete')?.addEventListener('click', () => {
                Domus.UI.confirmAction({
                    message: t('domus', 'Delete {entity}?', { entity: Domus.Role.getTenancyLabels().singular }),
                    confirmLabel: t('domus', 'Delete')
                }).then(confirmed => {
                    if (!confirmed) {
                        return;
                    }
                    Domus.Api.deleteTenancy(id)
                        .then(async result => {
                            for (const partner of result?.unlinkedPartners || []) {
                                const remove = await Domus.UI.confirmAction({
                                    message: t('domus', '{name} has no remaining relations. Also delete this Domus contact? A linked Nextcloud account will be kept.', { name: partner.name }),
                                    confirmLabel: t('domus', 'Delete'),
                                    cancelLabel: t('domus', 'Keep contact')
                                });
                                if (remove) {
                                    try {
                                        await Domus.Api.deletePartner(partner.id);
                                    } catch (error) {
                                        Domus.UI.showNotification(error.message, 'error');
                                    }
                                }
                            }
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
            document.getElementById('domus-tenancy-rent-increase')?.addEventListener('click', () => openRentIncreaseModal(tenancy));
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
                        if (el.value && (el.type !== 'checkbox' || el.checked)) {
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

        function openRentIncreaseModal(tenancy) {
            if (!Domus.Role.hasCapability('manageTenancies') || String(tenancy.status).toLowerCase() !== 'active') return;
            const escape = Domus.Utils.escapeHtml;
            const label = escape;
            const field = (name, text, value, min, max) => Domus.UI.buildFormRow({
                label: text,
                content: `<input id="rent-${name}" type="number" inputmode="decimal" step="any" value="${value}" min="${min}"${max === undefined ? '' : ` max="${max}"`} required>`
            });
            const row = (text, id) => `<div class="domus-rent-value"><span>${label(text)}</span><strong id="rent-${id}">—</strong></div>`;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const startDate = /^\d{4}-\d{2}-\d{2}$/.test(tenancy.startDate || '')
                ? new Date(tenancy.startDate + 'T00:00:00') : null;
            const anniversary = startDate && new Date(startDate);
            if (anniversary) {
                anniversary.setFullYear(anniversary.getFullYear() + 3);
                // A leap-day anniversary falls on the last day of February.
                if (anniversary.getMonth() !== startDate.getMonth()) anniversary.setDate(0);
            }
            const recentTenancy = startDate && startDate <= today && today < anniversary;
            const costYear = today.getFullYear() - 1;
            const content = `<div class="domus-rent-calculator domus-form">
                ${recentTenancy ? '<div class="domus-rent-warning" role="alert">' + label(t('domus', 'Rent can only be adjusted by 20% within 3 years.')) + '</div>' : ''}
                <section class="domus-rent-step"><h4>${label(t('domus', '1. Current rent'))}</h4>
                    ${row(t('domus', 'Construction year'), 'year')}${row(t('domus', 'Living area'), 'area')}
                    ${row(t('domus', 'Current base rent per m²'), 'current')}${row(t('domus', 'Current monthly base rent'), 'old-total')}
                    <p id="rent-source-status" role="status">${label(t('domus', 'Loading unit data…'))}</p>
                    <button type="button" id="rent-retry" hidden>${label(t('domus', 'Retry'))}</button>
                </section>
                <section class="domus-rent-step"><h4>${label(t('domus', '2. Rent index'))}</h4>
                    <div class="domus-rent-inputs domus-form-table">
                    ${field('index', t('domus', 'Base rent per m²'), '', 0.01)}
                    ${field('adjustment', t('domus', 'Total surcharges and deductions (%)'), 0, -99.99)}
                    ${field('spread', t('domus', 'Rent index range (±%)'), 23, 0, 100)}
                    ${field('limit', t('domus', 'Increase limit (%)'), 15, 0)}
                    </div>
                </section>
                <div class="domus-rent-branches">
                    <section class="domus-rent-step"><h4>${label(t('domus', '3. Rent index range'))}</h4>
                        <div class="domus-rent-range-summary">
                            <div aria-label="${label(t('domus', 'Lower / mean / upper per m²'))}"><strong id="rent-lower">—</strong> ← <strong id="rent-mean">—</strong> → <strong id="rent-upper">—</strong></div>
                        </div>
                    </section>
                    <section class="domus-rent-step"><h4>${label(t('domus', '4. Increase limit'))}</h4>
                        ${row(t('domus', 'Maximum rent per m²'), 'cap')}
                    </section>
                </div>
                <section class="domus-rent-step"><h4>${label(t('domus', '5. Service charge'))}</h4>
                    ${row(t('domus', 'Current monthly service charge'), 'service-current')}
                    ${row(t('domus', 'Maint. fee (allocable) & property tax ({year}) per month', {year: costYear}), 'service-cost')}
                    ${row(t('domus', 'Recommended monthly service charge'), 'service-recommended')}
                    <p id="rent-service-status" role="status"></p>
                    <button type="button" id="rent-service-retry" hidden>${label(t('domus', 'Retry'))}</button>
                </section>
                <section class="domus-rent-step domus-rent-result"><h4>${label(t('domus', '6. New rent calculation'))}</h4>
                    ${row(t('domus', 'Possible base rate range per m²'), 'range')}
                    <p id="rent-result-status" role="status"></p>
                    <div class="domus-rent-inputs domus-form-table">
                        ${field('selected', t('domus', 'New base rent (€ / m²)'), '', 0)}
                        ${field('service-selected', t('domus', 'New service charge (€ / month)'), '', 0)}
                    </div>
                    <div aria-live="polite" aria-atomic="true">${row(t('domus', 'Total monthly rent'), 'combined-total')}${row(t('domus', 'Monthly change'), 'increase')}</div>
                </section>
                <div class="domus-form-actions"><button type="button" id="rent-close">${label(t('domus', 'Close'))}</button>${Domus.Role.hasCapability('manageDocuments') ? '<button type="button" id="rent-letter" disabled>' + label(t('domus', 'Create rent increase letter')) + '</button>' : ''}<button type="button" id="rent-continue" class="primary" disabled>${label(t('domus', 'Apply changes to tenancy'))}</button></div>
            </div>`;
            const modal = Domus.UI.openModal({ title: t('domus', 'Calculate rent increase'), content, size: 'large' });
            const root = modal.modalEl;
            const element = name => root.querySelector('#rent-' + name);
            const show = (name, value) => { element(name).textContent = value; };
            const currency = value => Domus.Utils.formatCurrency(value);
            let area = null;
            let currentUnit = null;
            let letterValues = null;
            let documentEffectiveDate = null;
            const rent = tenancy.baseRent === null || tenancy.baseRent === '' ? NaN : Number(tenancy.baseRent);
            let selectedManually = false;
            let serviceSelectedManually = false;
            let calculatedConditions = null;
            // Automatic recommendations may arrive after the user starts editing.
            // Track their manual overrides without making background loads dirty.
            modal.protectChanges(() => ({
                inputs: ['index', 'adjustment', 'spread', 'limit'].map(name => element(name).value),
                selected: selectedManually ? element('selected').value : null,
                service: serviceSelectedManually ? element('service-selected').value : null,
                effectiveDate: documentEffectiveDate
            }));
            const currentService = tenancy.serviceCharge == null || tenancy.serviceCharge === '' ? NaN : Number(tenancy.serviceCharge);
            const number = name => {
                const input = element(name);
                return input.value.trim() !== '' && input.validity.valid ? input.valueAsNumber : NaN;
            };
            function update() {
                calculatedConditions = null;
                letterValues = null;
                if (element('letter')) element('letter').disabled = true;
                element('continue').disabled = true;
                const current = rent / area;
                const hasSource = Number.isFinite(current) && rent > 0 && area > 0;
                show('current', hasSource ? currency(current) : '—');
                const limit = number('limit');
                const cap = current * (1 + limit / 100);
                const validLimit = Number.isFinite(cap) && Number.isFinite(limit);
                show('cap', hasSource && validLimit ? currency(cap) : '—');
                const mean = number('index') * (1 + number('adjustment') / 100);
                const spread = number('spread') / 100;
                const lower = mean * (1 - spread);
                const upper = mean * (1 + spread);
                const valid = Number.isFinite(lower) && Number.isFinite(upper) && mean > 0;
                for (const [name, value] of [['lower', lower], ['mean', mean], ['upper', upper]]) show(name, valid ? currency(value) : '—');
                // Selectable prices use whole cents; never round the cap upwards.
                const maximum = Math.floor((Math.min(upper, cap) + 1e-9) * 100) / 100;
                const minimum = Math.min(maximum, Math.ceil((Math.max(lower, current) - 1e-9) * 100) / 100);
                const singleValue = minimum === maximum;
                const possible = hasSource && valid && validLimit && maximum >= minimum && maximum > current;
                const selected = element('selected');
                selected.disabled = !possible;
                show('range', possible ? (singleValue ? currency(maximum) : currency(minimum) + ' – ' + currency(maximum)) : '—');
                show('result-status', !hasSource ? t('domus', 'A positive living area and current base rent are required.') : !valid || !validLimit
                    ? t('domus', 'Enter a positive rent index value and valid percentages.') : !possible
                        ? t('domus', 'No increase is possible within this range and the selected limit.')
                        : '');
                show('increase', '—');
                show('combined-total', '—');
                if (!possible) { selected.value = ''; selectedManually = false; return; }
                selected.min = (singleValue ? Math.ceil((current - 1e-9) * 100) / 100 : minimum).toFixed(2);
                selected.max = maximum.toFixed(2);
                selected.step = '0.01';
                if (!selectedManually) {
                    const suggested = Math.floor((Math.min(mean, cap) + 1e-9) * 100) / 100;
                    selected.value = suggested > current ? suggested.toFixed(2) : '';
                }
                const price = number('selected');
                if (!Number.isFinite(price)) {
                    show('result-status', t('domus', 'The selected price must be within the possible range.'));
                    return;
                }
                const service = number('service-selected');
                if (Number.isFinite(service)) {
                    const monthlyBase = Math.round((price * area + Number.EPSILON) * 100) / 100;
                    const combined = Math.round((monthlyBase + service) * 100) / 100;
                    if (!Number.isFinite(monthlyBase) || !Number.isFinite(combined)) return;
                    const formatNumber = value => Domus.Utils.formatNumber(value, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                    const reason = Math.abs(price - maximum) < 0.000001 && cap <= upper
                        ? t('domus', 'Base rent capped by the {limit}% increase limit.', {limit: formatNumber(limit)})
                        : price >= lower && price <= upper
                            ? t('domus', 'Base rent within the rent index range.')
                            : t('domus', 'Base rent manually selected below the rent index range.');
                    const calculationNote = [
                        t('domus', 'Rent calculation: rent index {index}/m²; {adjustment}% adjustments applied; range ±{spread}%.', {
                            index: currency(number('index')), adjustment: formatNumber(number('adjustment')), spread: formatNumber(number('spread'))
                        }),
                        reason,
                        t('domus', 'New base rent: {price}/m² × {area} m² = {rent}/month.', {
                            price: currency(price), area: formatNumber(area), rent: currency(monthlyBase)
                        }),
                        t('domus', 'New service charge: {service}/month; total: {total}/month.', {
                            service: currency(service), total: currency(combined)
                        })
                    ].join('\n');
                    calculatedConditions = {
                        baseRent: monthlyBase, serviceCharge: service,
                        conditions: [tenancy.conditions, calculationNote].filter(Boolean).join('\n\n')
                    };
                    letterValues = { baseRent: monthlyBase, serviceCharge: service, lower, upper,
                        index: number('index'), adjustment: number('adjustment'), spread: number('spread'), limit, price,
                        currentBaseRent: rent, livingArea: area };
                    if (element('letter')) element('letter').disabled = false;
                    element('continue').disabled = false;
                    show('combined-total', currency(combined));
                    if (Number.isFinite(currentService)) show('increase', currency(combined - rent - currentService));
                }
            }
            ['index', 'adjustment', 'spread', 'limit'].forEach(name => element(name).addEventListener('input', () => {
                selectedManually = false;
                update();
            }));
            element('selected').addEventListener('input', () => { selectedManually = true; update(); });
            element('service-selected').step = '0.01';
            element('service-selected').addEventListener('input', () => { serviceSelectedManually = true; update(); });
            element('letter')?.addEventListener('click', () => {
                update();
                if (letterValues && currentUnit && Domus.Role.hasCapability('manageDocuments')) {
                    openRentIncreaseDocument(tenancy, currentUnit, letterValues, {
                        effectiveDate: documentEffectiveDate,
                        onEffectiveDate: value => { documentEffectiveDate = value; }
                    });
                }
            });
            element('continue').addEventListener('click', () => {
                update();
                if (!calculatedConditions || !Domus.Role.hasCapability('manageTenancies')) return;
                const prefill = Object.assign({}, tenancy, calculatedConditions);
                modal.close();
                openChangeConditionsModal(prefill, documentEffectiveDate);
            });
            element('close').addEventListener('click', modal.requestClose);
            async function loadUnit() {
                element('retry').hidden = true;
                show('source-status', t('domus', 'Loading unit data…'));
                try {
                    const unit = await Domus.Api.get('/units/' + tenancy.unitId);
                    if (!root.isConnected) return;
                    currentUnit = unit;
                    area = Number(unit.livingArea);
                    show('year', unit.constructionYear || '—');
                    show('area', area > 0 ? Domus.Utils.formatNumber(area) + ' m²' : '—');
                    show('source-status', '');
                } catch (error) {
                    if (!root.isConnected) return;
                    show('source-status', t('domus', 'Unable to load unit data.'));
                    element('retry').hidden = false;
                }
                update();
            }
            async function loadServiceCosts() {
                element('service-retry').hidden = true;
                show('service-status', t('domus', 'Loading…'));
                try {
                    const statistics = await Domus.Api.getUnitStatistics(tenancy.unitId);
                    if (!root.isConnected) return;
                    const cost = statistics?.cost?.rows?.find(entry => Number(entry.year) === costYear);
                    const annual = cost?.allocableCosts;
                    if (annual === null || annual === undefined || annual === '' || !Number.isFinite(Number(annual)) || Number(annual) < 0) {
                        show('service-status', t('domus', 'No cost report is available for {year}.', {year: costYear}));
                    } else {
                        const monthlyCost = Number(annual) / 12;
                        const recommendation = Number(monthlyCost.toFixed(2));
                        show('service-cost', currency(monthlyCost));
                        show('service-recommended', currency(recommendation));
                        show('service-status', '');
                        if (!serviceSelectedManually) element('service-selected').value = recommendation.toFixed(2);
                    }
                } catch (error) {
                    if (!root.isConnected) return;
                    show('service-status', t('domus', 'Unable to load the cost report.'));
                    element('service-retry').hidden = false;
                }
                update();
            }
            show('service-current', Number.isFinite(currentService) ? currency(currentService) : '—');
            if (Number.isFinite(currentService) && currentService >= 0) element('service-selected').value = currentService.toFixed(2);
            element('service-retry').addEventListener('click', loadServiceCosts);
            loadServiceCosts();
            show('old-total', Number.isFinite(rent) ? currency(rent) : '—');
            element('retry').addEventListener('click', loadUnit);
            update();
            loadUnit();
        }

        function openRentIncreaseDocument(tenancy, unit, calculation, options = {}) {
            const escape = Domus.Utils.escapeHtml;
            const statusModal = Domus.UI.openModal({title: t('domus', 'Rent increase letter'), content: '<p role="status">' + escape(t('domus', 'Loading…')) + '</p>'});
            Domus.Api.get('/settings/rent-increase-template').then(status => {
                if (!statusModal.modalEl.isConnected) return;
                statusModal.close();
                if (status?.ready) openRentIncreaseWord(tenancy, calculation, status, options);
                else if (!status?.fileId) openRentIncreaseLetter(tenancy, unit, calculation);
                else {
                    const modal = Domus.UI.openModal({title: t('domus', 'Rent increase letter'), content:
                        '<p role="alert">' + escape(status.error || t('domus', 'The assigned template is missing or inaccessible.')) + '</p>' +
                        '<button type="button" id="rent-use-markdown">' + escape(t('domus', 'Use Markdown instead')) + '</button>'});
                    modal.modalEl.querySelector('#rent-use-markdown').onclick = () => { modal.close(); openRentIncreaseLetter(tenancy, unit, calculation); };
                }
            }).catch(error => {
                if (!statusModal.modalEl.isConnected) return;
                statusModal.modalEl.querySelector('[role="status"]').textContent = error.message;
            });
        }

        function openRentIncreaseWord(tenancy, calculation, template, options = {}) {
            const escape = Domus.Utils.escapeHtml;
            const now = new Date();
            const dateValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const today = dateValue(now);
            // The template consent deadline uses this editable effective date.
            const suggestedDates = value => {
                const [year, month] = value.split('-').map(Number);
                const effectiveDate = dateValue(new Date(year, month + 2, 1));
                return {effectiveDate};
            };
            let defaults = suggestedDates(today);
            const field = (name, label, type, value = '', extra = '') => Domus.UI.buildFormRow({label, required: true,
                content: `<input name="${name}" type="${type}" value="${value}" ${extra} required>`});
            const modal = Domus.UI.openModal({title: t('domus', 'Rent increase letter'), content:
                '<div class="domus-form"><form id="rent-word-form"><p>' + escape(t('domus', 'Template used: {name}', {name: template.name})) + '</p>' +
                Domus.UI.buildFormTable([
                    field('documentDate', t('domus', 'Document date'), 'date', today),
                    field('receiptDate', t('domus', 'Receipt date (expected)'), 'date', today),
                    field('rentIndexYear', t('domus', 'Rent index year'), 'number', String(now.getFullYear()), 'min="1" max="9999" step="1"'),
                    field('effectiveDate', t('domus', 'Effective date'), 'date', options.effectiveDate || defaults.effectiveDate)
                ]) +
                '<p class="domus-muted">' + escape(t('domus', 'Dates use the expected receipt date. Check local public holidays and adjust for actual receipt.')) + '</p>' +
                '<p id="rent-word-status" role="status"></p><div id="rent-word-result"></div><div class="domus-form-actions">' +
                '<button type="button" id="rent-word-close">' + escape(t('domus', 'Close')) + '</button>' +
                '<button type="button" id="rent-word-continue" class="primary" hidden>' + escape(t('domus', 'Continue')) + '</button>' +
                '<button type="submit" class="primary">' + escape(t('domus', 'Create document')) + '</button></div></form></div>'});
            const root = modal.modalEl;
            const form = root.querySelector('form');
            const status = root.querySelector('#rent-word-status');
            const updateSuggestedDates = () => {
                if (!form.elements.receiptDate.value || !form.elements.receiptDate.validity.valid) return;
                const next = suggestedDates(form.elements.receiptDate.value);
                const input = form.elements.effectiveDate;
                if (!input.value || input.value === defaults.effectiveDate) input.value = next.effectiveDate;
                defaults = next;
            };
            let previousDocumentDate = today;
            form.elements.documentDate.addEventListener('change', () => {
                if (form.elements.receiptDate.value === previousDocumentDate) {
                    form.elements.receiptDate.value = form.elements.documentDate.value;
                    updateSuggestedDates();
                }
                previousDocumentDate = form.elements.documentDate.value;
            });
            form.elements.receiptDate.addEventListener('change', updateSuggestedDates);
            modal.protectChanges();
            root.querySelector('#rent-word-close').onclick = modal.requestClose;
            root.querySelector('#rent-word-continue').onclick = modal.requestClose;
            let saving = false;
            let created = false;
            root.addEventListener('keydown', event => { if (saving && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); } });
            form.onsubmit = async event => {
                event.preventDefault();
                if (saving || created || !Domus.Role.hasCapability('manageDocuments')) return;
                const data = Object.fromEntries(new FormData(form));
                if (data.effectiveDate <= data.documentDate) {
                    status.textContent = t('domus', 'The effective date must follow the document date.');
                    return;
                }
                saving = true;
                root.querySelectorAll('button, input').forEach(control => { control.disabled = true; });
                status.textContent = t('domus', 'Creating document…');
                try {
                    const documents = await Domus.Api.post('/tenancies/' + tenancy.id + '/rent-increase-report', {...data, consentDeadline: data.effectiveDate, calculation});
                    options.onEffectiveDate?.(data.effectiveDate);
                    created = true;
                    status.textContent = t('domus', 'Rent increase letter created.');
                    root.querySelector('#rent-word-continue').hidden = false;
                    root.querySelector('#rent-word-close').hidden = true;
                    const document = (documents || []).find(item => item.fileUrl);
                    if (document) {
                        const link = window.document.createElement('a');
                        link.href = document.fileUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = t('domus', 'Open');
                        root.querySelector('#rent-word-result').appendChild(link);
                    }
                    modal.protectChanges();
                    const containerId = `domus-tenancy-documents-${tenancy.id}`;
                    if (window.document.getElementById(containerId)) Domus.Documents.loadLatestList('tenancy', tenancy.id, {containerId});
                } catch (error) { status.textContent = error.message || t('domus', 'Unable to create file.'); }
                finally {
                    saving = false;
                    root.querySelectorAll('button, input').forEach(control => { control.disabled = created && control.id !== 'rent-word-continue' && control.id !== 'rent-word-close' && !control.classList.contains('domus-modal-close'); });
                    if (created) modal.protectChanges();
                }
            };
        }

        function openRentIncreaseLetter(tenancy, unit, calculation) {
            const escape = Domus.Utils.escapeHtml;
            // German is the initial document language, independent of the UI locale.
            const number = value => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
            const markdownValue = value => String(value || '').replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}[\]<>#|]/g, character => String.fromCharCode(92) + character);
            const names = (tenancy.partners || []).map(partner => partner.name).filter(Boolean).join(', ') || tenancy.partnerName;
            const address = [unit.street, [unit.zip, unit.city].filter(Boolean).join(' ')].filter(Boolean).join(' in ') || '_______________________';
            const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tenancy.startDate || '');
            const start = dateParts ? `${dateParts[3]}.${dateParts[2]}.${dateParts[1]}` : 'XX.XX.20XX';
            const oldRent = Number(tenancy.baseRent);
            const area = Number(unit.livingArea);
            const markdown = [
                '# Mieterhöhung',
                '',
                `Sehr geehrte(r) Herr/Frau ${markdownValue(names) || '_______________________'},`,
                '',
                `für Ihre Wohnung in der ${markdownValue(address)} bitte ich um Ihre Zustimmung zur Anpassung der monatlichen Nettokaltmiete ab dem XX.XX.20XX.`,
                '',
                `Die letzte Mietanpassung erfolgte zum ${start}. Die Vergleichsmiete laut Mietspiegel (Stand 20XX) beträgt ${number(calculation.lower)} bis ${number(calculation.upper)} Euro pro m². Die Wohnfläche beträgt ${number(area)} m².`,
                '',
                `**Bisherige Kaltmiete:** ${number(oldRent)} Euro (${number(oldRent / area)} Euro pro m²)  `,
                `**Neue Kaltmiete:** ${number(calculation.baseRent)} Euro (Erhöhung um ${number((calculation.baseRent / oldRent - 1) * 100)} Prozent)  `,
                `**Nebenkostenvorauszahlung:** ${number(calculation.serviceCharge)} Euro  `,
                `**Neue Gesamtmiete:** ${number(calculation.baseRent + calculation.serviceCharge)} Euro pro Monat`,
                '',
                'Bitte teilen Sie mir Ihre Zustimmung bis zum XX.XX.20XX schriftlich mit.',
                '',
                'Mit freundlichen Grüßen',
                ''
            ].join('\n');
            const content = '<div class="domus-form"><form id="rent-letter-form">' +
                '<p>' + escape(t('domus', 'Review the German letter and complete the rent index year, consent deadline and effective date before creating the Markdown file.')) + '</p>' +
                Domus.UI.buildFormTable([Domus.UI.buildFormRow({
                    label: t('domus', 'Letter text (Markdown)'), fullWidth: true,
                    content: '<textarea id="rent-letter-text" rows="18" required></textarea>'
                })]) +
                '<p id="rent-letter-status" role="status"></p><div id="rent-letter-result"></div>' +
                '<div class="domus-form-actions"><button type="button" id="rent-letter-close">' + escape(t('domus', 'Close')) + '</button>' +
                '<button type="button" id="rent-letter-continue" class="primary" hidden>' + escape(t('domus', 'Continue')) + '</button>' +
                '<button type="submit" id="rent-letter-create" class="primary">' + escape(t('domus', 'Create document')) + '</button></div></form></div>';
            const modal = Domus.UI.openModal({title: t('domus', 'Rent increase letter'), content, size: 'large'});
            const root = modal.modalEl;
            const textarea = root.querySelector('#rent-letter-text');
            const create = root.querySelector('#rent-letter-create');
            const status = root.querySelector('#rent-letter-status');
            textarea.value = markdown;
            modal.protectChanges();
            root.querySelector('#rent-letter-close').addEventListener('click', modal.requestClose);
            root.querySelector('#rent-letter-continue').onclick = modal.requestClose;
            let saving = false;
            let created = false;
            root.addEventListener('keydown', event => {
                if (saving && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
            });
            root.querySelector('#rent-letter-form').addEventListener('submit', async event => {
                event.preventDefault();
                if (saving || created || !textarea.value.trim() || !Domus.Role.hasCapability('manageDocuments')) return;
                saving = true;
                const buttons = Array.from(root.querySelectorAll('button'));
                buttons.forEach(button => { button.disabled = true; });
                textarea.readOnly = true;
                status.textContent = t('domus', 'Creating document…');
                const now = new Date();
                const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const file = new File([textarea.value], `Mieterhoehung_${tenancy.id}_${date}.md`, {type: 'text/markdown;charset=utf-8'});
                try {
                    const documents = await Domus.Api.attachDocumentToTargets({
                        type: 'upload', file, documentDate: date, year: now.getFullYear(),
                        title: t('domus', 'Rent increase letter'),
                        targets: [{entityType: 'unit', entityId: tenancy.unitId}, {entityType: 'tenancy', entityId: tenancy.id}]
                    });
                    created = true;
                    status.textContent = t('domus', 'Rent increase letter created.');
                    root.querySelector('#rent-letter-continue').hidden = false;
                    root.querySelector('#rent-letter-close').hidden = true;
                    const document = (Array.isArray(documents) ? documents : []).find(item => item.fileUrl);
                    if (document) {
                        const link = window.document.createElement('a');
                        link.href = document.fileUrl;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        link.textContent = t('domus', 'Open');
                        root.querySelector('#rent-letter-result').appendChild(link);
                    }
                    modal.protectChanges();
                    const containerId = `domus-tenancy-documents-${tenancy.id}`;
                    if (window.document.getElementById(containerId)) Domus.Documents.loadLatestList('tenancy', tenancy.id, {containerId});
                } catch (error) {
                    status.textContent = error.message || t('domus', 'Unable to create file.');
                } finally {
                    saving = false;
                    buttons.forEach(button => { button.disabled = false; });
                    create.disabled = created;
                    textarea.readOnly = created;
                }
            });
        }

        function openChangeConditionsModal(tenancy, effectiveDate = null) {
            const today = new Date().toISOString().split('T')[0];
            const prefill = Object.assign({}, tenancy, { startDate: effectiveDate || today, endDate: '' });

            openCreateModal(prefill, created => {
                const targetId = created?.id || tenancy.id;
                renderDetail(targetId);
            }, data => Domus.Api.changeTenancyConditions(tenancy.id, data), t('domus', 'Change conditions'), t('domus', 'Conditions changed.'), {
                hideUnitField: true,
                hidePartnerField: true,
                lockPartnerIds: true,
                requireAssignmentFields: false,
                description: t('domus', 'This creates a continuation of the existing tenancy from the selected start date. The previous tenancy period ends the day before; its conditions remain unchanged.'),
                conditionsRows: 10,
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
                if (opts.rows) attrs.push(`rows="${Domus.Utils.escapeHtml(String(opts.rows))}"`);
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
                : '<div class="domus-tenancy-partners" role="group" aria-label="' + Domus.Utils.escapeHtml(t('domus', 'Partners')) + '">' +
                partnerOptions.slice().sort((a, b) => Number(partnerIds.includes(String(b.value))) - Number(partnerIds.includes(String(a.value))))
                    .map(opt => '<label class="domus-tenancy-partner"><input type="checkbox" name="partnerIds" value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (partnerIds.includes(String(opt.value)) ? ' checked' : '') + '><span>' + Domus.Utils.escapeHtml(opt.label) + '</span></label>').join('') +
                '</div>';

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
                inputField('conditions', t('domus', 'Conditions'), tn.conditions || '', { isTextarea: true, fullWidth: true, rows: options.conditionsRows })
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

        return { renderList, renderDetail, renderRenterPreview, renderRenter, renderCorrectionReview, renderInline, openCreateModal };
    })();

    /**
     * Bookings view
     */
})();

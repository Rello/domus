/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Settings = (function() {
        function getDemoContentConfig(role) {
            if (role === 'buildingMgmt') {
                return {
                    role: 'buildingMgmt',
                    buttonLabel: t('domus', 'Create demo content (Building Mgmt)'),
                    confirmMessage: t('domus', 'Create demo content for building management? This will add sample data to your account.'),
                    confirmLabel: t('domus', 'Create demo content (Building Mgmt)'),
                    successLabel: t('domus', 'Demo content created.'),
                    errorLabel: t('domus', 'Unable to create demo content.')
                };
            }

            return {
                role: 'landlord',
                buttonLabel: t('domus', 'Create demo content'),
                confirmMessage: t('domus', 'Create demo content? This will add sample data to your account.'),
                confirmLabel: t('domus', 'Create demo content'),
                successLabel: t('domus', 'Demo content created.'),
                errorLabel: t('domus', 'Unable to create demo content.')
            };
        }

        function createDemoContent(role, buttonEl) {
            const config = getDemoContentConfig(role);
            return Domus.UI.confirmAction({
                message: config.confirmMessage,
                confirmLabel: config.confirmLabel
            }).then(confirmed => {
                if (!confirmed) {
                    return false;
                }
                if (buttonEl) {
                    buttonEl.disabled = true;
                }
                return Domus.Api.createDemoContent({ role: config.role })
                    .then(() => {
                        if (buttonEl) {
                            buttonEl.textContent = config.successLabel;
                            buttonEl.disabled = true;
                        }
                        Domus.UI.showNotification(config.successLabel, 'success');
                        return true;
                    })
                    .catch(err => {
                        if (buttonEl) {
                            buttonEl.disabled = false;
                        }
                        Domus.UI.showNotification(err.message || config.errorLabel, 'error');
                        return false;
                    });
            });
        }

        function buildSettingsSection(config) {
            return '<div class="domus-panel domus-settings-section domus-collapsed" id="' + Domus.Utils.escapeHtml(config.id) + '">' +
                '<div class="domus-section-header domus-settings-section-header" role="button" tabindex="0" aria-expanded="false">' +
                '<h3>' + Domus.Utils.escapeHtml(config.title) + '</h3>' +
                (config.headerActions || '') +
                '</div>' +
                '<div class="domus-panel-body domus-settings-section-body">' +
                config.body +
                '</div>' +
                '</div>';
        }

        function buildForm(settings) {
            const taxRate = settings?.taxRate ?? '';
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Tax rate'),
                    helpText: t('domus', 'The tax rate will be used to calculate the estimated net result'),
                    content: '<input name="taxRate" type="number" step="0.01" value="' + Domus.Utils.escapeHtml(taxRate) + '">'
                })
            ];
            const actions = '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                    '<form id="domus-settings-form">' +
                    Domus.UI.buildFormTable(rows) +
                    actions +
                    '</form>' +
                    '</div>';
        }

        function buildTaxSection(settings) {
            const escape = Domus.Utils.escapeHtml;
            return buildSettingsSection({
                id: 'domus-tax-declaration-panel',
                title: t('domus', 'Tax declaration'),
                body: buildForm(settings) +
                    '<p>' + escape(t('domus', 'Prepare the property overview for Wiso tax software.')) + '</p>' +
                    '<div class="domus-form-actions"><button type="button" id="domus-tax-report-button">' +
                    escape(t('domus', 'Tax report')) + '</button></div>'
            });
        }

        function openTaxReport() {
            const escape = Domus.Utils.escapeHtml;
            // Wiso field names and their hierarchy intentionally stay in German in every locale.
            const rows = [
                {label: t('domus', 'Einnahmen'), group: true, key: 'totalIncome'},
                {label: t('domus', 'Mieteinnahmen für Wohnungen'), depth: 1},
                {label: t('domus', '1) Weitere Geschosse'), depth: 2},
                {label: t('domus', 'Mieteinnahmen'), depth: 3, key: 'rent'},
                {label: t('domus', 'Neben-/ Betriebskosten'), depth: 3, key: 'prepayments'},
                {label: t('domus', 'Nachzahlung von NK vom Mieter'), depth: 3, key: 'tenantPayment'},
                {label: t('domus', 'Erstattung von NK an den Mieter'), depth: 3, key: 'tenantCredit'},
                {label: t('domus', 'Abschreibung'), group: true, key: 'depreciation'},
                {label: t('domus', 'Betriebskosten und andere Ausgaben'), group: true, key: 'totalOperatingExpenses'},
                {label: t('domus', 'Schuldzinsen'), depth: 1, key: 'interest'},
                {label: t('domus', 'Sonstige Kosten'), depth: 1},
                {label: t('domus', 'Umlagefähige Kosten laut Abrechnung'), depth: 2, key: 'allocable'},
                {label: t('domus', 'Grundsteuer'), depth: 2, key: 'propertyTax'},
                {label: t('domus', 'Nicht umlagefähige Kosten laut Abrechnung'), depth: 2, key: 'nonAllocable'},
                {label: t('domus', 'Sonstige Kosten'), depth: 2, key: 'otherCosts'},
                {label: t('domus', 'Status'), key: 'status'},
                {label: t('domus', 'Kontroll-Saldo'), key: 'controlBalance'}
            ];
            const modal = Domus.UI.openModal({
                title: t('domus', 'Tax report'),
                size: 'tax-report',
                content: '<div class="domus-tax-report">' +
                    '<p role="note">' + escape(t('domus', 'This is beta. The report shows the data in the same input format as WISO Steuer for simple transfer.')) + '</p>' +
                    '<details><summary>' + escape(t('domus', 'Calculation sources')) + '</summary><p>' + escape(t('domus', 'Rent and utility prepayments come from tenancy agreements, not recorded receipts. Costs use unit bookings for the selected year, including allocated property costs.')) + '</p>' +
                    '<p>' + escape(t('domus', 'Utility payment and credit amounts are calculated from each renter’s settlement, not recorded payments. Other costs combine accounts 2300 and 2700, with the individual booking texts and amounts. Reserve allocations and unallocated property bookings are excluded.')) + '</p></details>' +
                    '<div id="domus-tax-report-content" aria-live="polite"></div></div>' +
                    '<div class="domus-form-actions"><button type="button" id="domus-tax-report-close">' + escape(t('domus', 'Close')) + '</button></div>'
            });
            const host = modal.modalEl.querySelector('#domus-tax-report-content');
            modal.modalEl.querySelector('#domus-tax-report-close').onclick = modal.close;
            let selectedYear = new Date().getFullYear() - 1;
            let report;
            function renderTable() {
                const years = report.years;
                const data = report.units;
                host.innerHTML = '<label for="domus-tax-report-year">' + escape(t('domus', 'Year')) + '</label> ' +
                    '<select id="domus-tax-report-year">' + years.map(year =>
                        '<option value="' + year + '"' + (year === selectedYear ? ' selected' : '') + '>' + year + '</option>').join('') + '</select>' +
                    '<div class="domus-tax-table-scroll" role="region" tabindex="0" aria-label="' + escape(t('domus', 'Objektdaten für Steuererklärung')) + '">' +
                    '<table class="domus-tax-table"><caption>' + escape(t('domus', 'Objektdaten für Steuererklärung')) + '</caption>' +
                    '<thead><tr><th scope="col">' + escape(t('domus', 'Objekt')) + '</th>' + data.map(unit =>
                        '<th scope="col">' + escape(unit.label) + '</th>').join('') + '</tr></thead><tbody>' +
                    rows.map(row => '<tr' + (row.group ? ' class="domus-tax-group"' : '') + '><th scope="row" class="domus-tax-depth-' + (row.depth || 0) + '">' + escape(row.label) + '</th>' +
                        data.map(unit => {
                            let value = row.key ? unit.amounts[row.key] : '';
                            if (row.key === 'status') {
                                const badgeClass = unit.closed ? 'domus-badge-success' : 'domus-badge-warning domus-badge-provisional';
                                const label = unit.closed ? t('domus', 'Closed') : t('domus', 'Provisional');
                                return '<td><span class="domus-badge ' + badgeClass + '">' + escape(label) + '</span></td>';
                            }
                            else if (value === null || value === undefined) value = '—';
                            else if (typeof value === 'number') value = Domus.Utils.formatCurrency(value);
                            const bookingDetails = row.key === 'otherCosts' && unit.otherCostBookings?.length
                                ? '<ul class="domus-tax-booking-list">' + unit.otherCostBookings.map(booking =>
                                    '<li><span>' + escape(booking.description || t('domus', 'Booking without description')) + '</span>' +
                                    '<span>' + escape(Domus.Utils.formatCurrency(booking.amount)) + '</span></li>').join('') + '</ul>' : '';
                            return '<td>' + (row.key === 'otherCosts' ? bookingDetails : escape(value)) + '</td>';
                        }).join('') + '</tr>').join('') + '</tbody></table></div>';
                host.querySelector('select').onchange = event => {
                    selectedYear = Number(event.target.value);
                    load();
                };
            }
            async function load() {
                host.textContent = t('domus', 'Loading…');
                try {
                    report = await Domus.Api.get('/tax-report/' + selectedYear);
                    if (!host.isConnected) return;
                    if (!report.units.length) {
                        host.textContent = t('domus', 'No units available for this scope.');
                        return;
                    }
                    if (host.isConnected) renderTable();
                } catch (error) {
                    if (!host.isConnected) return;
                    host.innerHTML = '<p class="domus-error" role="alert">' + escape(error.message || t('domus', 'An error occurred')) + '</p>' +
                        '<button type="button">' + escape(t('domus', 'Retry')) + '</button>';
                    host.querySelector('button').onclick = load;
                }
            }
            load();
        }

        function templateScopeLabel() {
            const teamId = Domus.state.managementContext?.activeTeamId;
            if (!teamId) return t('domus', 'Personal');
            const selector = document.getElementById('domus-context-select');
            return Array.from(selector?.options || []).find(option => option.value === teamId)?.textContent || t('domus', 'Team');
        }

        function buildTemplateRows(status) {
            const escape = Domus.Utils.escapeHtml;
            if (!status?.fileId) return '<p class="domus-muted">' + escape(t('domus', 'No document template configured.')) + '</p>';
            return Domus.UI.buildTable([t('domus', 'Document'), t('domus', 'Process'), t('domus', 'Scope'), ''], [[
                escape(status.name || t('domus', 'Assigned template')) +
                    (status.error ? '<div class="domus-error" role="status">' + escape(status.error) + '</div>' : ''),
                escape(t('domus', 'Utility Bill Statement')),
                escape(templateScopeLabel()),
                Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Remove assignment'), {id: 'domus-template-delete'})
            ]], {wrapPanel: false});
        }

        function buildTemplateSection(status) {
            return buildSettingsSection({
                id: 'domus-document-templates-panel',
                title: t('domus', 'Document templates'),
                headerActions: Domus.UI.buildIconButton('domus-icon-add', t('domus', 'Add template'), {id: 'domus-template-add'}),
                body: '<div id="domus-template-list">' + buildTemplateRows(status) + '</div>'
            });
        }

        function bindTemplateSection(initialStatus) {
            const host = document.getElementById('domus-template-list');
            const add = document.getElementById('domus-template-add');
            let status = initialStatus;
            const refresh = result => {
                if (!host.isConnected) return;
                status = result;
                host.innerHTML = buildTemplateRows(status);
                bindDelete();
            };
            const bindDelete = () => {
                const remove = host.querySelector('#domus-template-delete');
                if (!remove) return;
                remove.onclick = async () => {
                    remove.disabled = add.disabled = true;
                    try {
                        refresh(await Domus.Api.put('/settings/utility-template', {path: ''}));
                    } catch (error) {
                        if (host.isConnected) Domus.UI.showNotification(error.message, 'error');
                    } finally { remove.disabled = add.disabled = false; }
                };
            };
            bindDelete();
            add.onclick = () => {
                const escape = Domus.Utils.escapeHtml;
                const modal = Domus.UI.openModal({
                    title: t('domus', 'Add template'),
                    content: '<form id="domus-template-form" class="domus-form">' + Domus.UI.buildFormTable([
                        Domus.UI.buildFormRow({label: t('domus', 'Document'), content:
                            '<button type="button" id="domus-template-pick">' + escape(t('domus', 'Select existing file')) + '</button>' +
                            '<span id="domus-template-selected" class="domus-muted"></span>'}),
                        Domus.UI.buildFormRow({label: t('domus', 'Process'), content:
                            '<select name="process" aria-label="' + escape(t('domus', 'Process')) + '"><option value="utilityReport">' + escape(t('domus', 'Utility Bill Statement')) + '</option></select>'}),
                        Domus.UI.buildFormRow({label: t('domus', 'Scope'), content: escape(templateScopeLabel())})
                    ]) + (status?.fileId ? '<p>' + escape(t('domus', 'This replaces the template assigned to this process in the current scope.')) + '</p>' : '') +
                    '<p id="domus-template-error" class="domus-error" role="alert"></p>' +
                    '<div class="domus-form-actions"><button type="button" id="domus-template-cancel">' + escape(t('domus', 'Cancel')) + '</button>' +
                    '<button type="submit" class="primary" disabled>' + escape(t('domus', 'Save')) + '</button></div></form>'
                });
                const form = modal.modalEl.querySelector('form');
                const picker = form.querySelector('#domus-template-pick');
                const save = modal.modalEl.querySelector('[type="submit"]');
                const errorHost = form.querySelector('#domus-template-error');
                let selectedPath = '';
                modal.modalEl.querySelector('#domus-template-cancel').onclick = modal.close;
                picker.onclick = () => {
                    if (!window.OC?.dialogs?.filepicker) {
                        errorHost.textContent = t('domus', 'File picker is unavailable.');
                        return;
                    }
                    OC.dialogs.filepicker(t('domus', 'Select file'), path => {
                        if (!form.isConnected || !path) return;
                        selectedPath = String(Array.isArray(path) ? path[0] || '' : path);
                        form.querySelector('#domus-template-selected').textContent = selectedPath.split('/').pop();
                        save.disabled = !selectedPath;
                        errorHost.textContent = '';
                    }, false, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true, 1, '/DomusApp/Templates');
                };
                form.onsubmit = async event => {
                    event.preventDefault();
                    if (!selectedPath || save.disabled) return;
                    save.disabled = picker.disabled = true;
                    errorHost.textContent = '';
                    try {
                        const result = await Domus.Api.put('/settings/utility-template', {path: selectedPath});
                        modal.close();
                        refresh(result);
                        if (host.isConnected) {
                            const panel = host.closest('.domus-settings-section');
                            panel.classList.remove('domus-collapsed');
                            panel.querySelector('.domus-section-header').setAttribute('aria-expanded', 'true');
                        }
                    } catch (error) {
                        if (form.isConnected) errorHost.textContent = error.message;
                    } finally { save.disabled = picker.disabled = false; }
                };
            };
        }

        function buildDemoSection(role) {
            const showLandlord = role === 'landlord';
            const showBuilding = role === 'buildingMgmt';
            return buildSettingsSection({
                id: 'domus-demo-settings-panel',
                title: t('domus', 'Create Demo Content'),
                body: '<div class="domus-form">' +
                    '<p>' + Domus.Utils.escapeHtml(t('domus', 'Create a demo dataset to explore units, partners, tenancies, tasks, and bookings.')) + '</p>' +
                    '<div class="domus-form-actions">' +
                    (showLandlord
                        ? '<button type="button" class="secondary" id="domus-demo-content-button">' +
                            Domus.Utils.escapeHtml(t('domus', 'Create demo content')) +
                            '</button>'
                        : '') +
                    (showBuilding
                        ? '<button type="button" class="secondary" id="domus-demo-content-building-button">' +
                            Domus.Utils.escapeHtml(t('domus', 'Create demo content (Building Mgmt)')) +
                            '</button>'
                        : '') +
                    '</div>' +
                    '</div>'
            });
        }

        function buildIntroSection() {
            return buildSettingsSection({
                id: 'domus-intro-settings-panel',
                title: t('domus', 'Intro Wizard'),
                body: '<div class="domus-form">' +
                    '<p>' + Domus.Utils.escapeHtml(t('domus', 'Restart the welcome intro if you want to go through the onboarding steps again.')) + '</p>' +
                    '<div class="domus-form-actions">' +
                    '<button type="button" class="secondary" id="domus-restart-intro-button">' +
                    Domus.Utils.escapeHtml(t('domus', 'Restart intro')) +
                    '</button>' +
                    '</div>' +
                    '</div>'
            });
        }

        function buildAiControl(status) {
            return '<div class="domus-ai-control"><input type="checkbox" class="checkbox" id="domus-ai-validation" aria-describedby="domus-ai-validation-description"' + (status?.enabled ? ' checked' : '') + (!status?.available && !status?.enabled ? ' disabled' : '') + '>' +
                '<label for="domus-ai-validation">' + Domus.Utils.escapeHtml(t('domus', 'AI document validation')) + '</label>' +
                '<p id="domus-ai-validation-description">' + Domus.Utils.escapeHtml(t('domus', 'Uploaded documents will be processed by the Nextcloud Assistant. From the document, bookings and unit information will be extracted and suggested for review.')) + '</p></div>';
        }

        function bindAiSection() {
            const toggle = document.getElementById('domus-ai-validation');
            toggle?.addEventListener('change', async () => {
                const enabled = toggle.checked;
                toggle.disabled = true;
                try {
                    await Domus.Api.updateSettings({aiDocumentValidation: enabled ? '1' : '0'});
                    Domus.UI.showNotification(t('domus', 'Changes saved.'), 'success');
                } catch (error) {
                    toggle.checked = !enabled;
                    Domus.UI.showNotification(error.message, 'error');
                } finally { toggle.disabled = false; }
            });
        }

        function buildTeamSection(requiredApps, aiStatus) {
            const apps = [
                { id: 'circles', name: t('domus', 'Teams'), appUrl: '/apps/circles/teams/', storeUrl: '/settings/apps/organization/circles?q=teams' },
                { id: 'groupfolders', name: t('domus', 'Team Folders'), appUrl: '/settings/admin/groupfolders', storeUrl: '/settings/apps/search/groupfolders?q=groupfolders' },
                { id: 'guests', name: t('domus', 'Guests'), appUrl: '/settings/admin/guests', storeUrl: '/settings/apps/search/guests?q=guests' },
                { name: t('domus', 'Assistant (PDF extraction)'), available: aiStatus?.assistant, appUrl: '/apps/assistant/', storeUrl: '/settings/apps/search/assistant' },
                { name: t('domus', 'OpenAI and LocalAI integration'), available: aiStatus?.chatProvider, appUrl: '/settings/apps/search/integration_openai', storeUrl: '/settings/apps/search/integration_openai' }
            ];
            const rows = apps.map(app => {
                const enabled = app.id ? requiredApps?.[app.id] === true : app.available === true;
                const status = app.id
                    ? (enabled ? t('domus', 'Enabled') : t('domus', 'Not installed or disabled'))
                    : (enabled ? t('domus', 'Available') : t('domus', 'Unavailable'));
                const linkLabel = enabled ? t('domus', 'Open app') : t('domus', 'Open App Store');
                return '<li class="domus-required-app">' +
                    '<span class="domus-required-app-status' + (enabled ? ' domus-required-app-enabled' : ' domus-required-app-unavailable') + '" aria-label="' + Domus.Utils.escapeHtml(status) + '" title="' + Domus.Utils.escapeHtml(status) + '">' + (enabled ? '✓' : 'X') + '</span>' +
                    (app.appUrl ? '<a href="' + Domus.Utils.escapeHtml(OC.generateUrl(enabled ? app.appUrl : app.storeUrl)) + '" target="_blank" rel="noopener noreferrer" title="' + Domus.Utils.escapeHtml(linkLabel) + '">' + Domus.Utils.escapeHtml(app.name) + '</a>' : '<span>' + Domus.Utils.escapeHtml(app.name) + '</span>') +
                    '<span class="domus-muted">' + Domus.Utils.escapeHtml(status) + '</span></li>';
            }).join('');
            return buildSettingsSection({
                id: 'domus-team-settings-panel',
                title: t('domus', 'Nextcloud Integration Check'),
                body: '<ul class="domus-required-apps">' + rows + '</ul>' +
                    buildAiControl(aiStatus) +
                    '<div class="domus-form"><div class="domus-form-actions"><button type="button" class="secondary" id="domus-renter-preview-button">' +
                    Domus.Utils.escapeHtml(t('domus', 'Renter preview')) + '</button></div></div>'
            });
        }

        function bindForm() {
            const form = document.getElementById('domus-settings-form');
            if (!form) {
                return;
            }
            form.addEventListener('submit', function(event) {
                event.preventDefault();
                const formData = new FormData(form);
                let taxRate = (formData.get('taxRate') || '').toString().trim();
                if (taxRate === '') {
                    taxRate = '0';
                }
                if (taxRate !== '' && Number.isNaN(Number(taxRate))) {
                    Domus.UI.showNotification(t('domus', 'Enter a valid amount.'), 'error');
                    return;
                }
                Domus.Api.updateSettings({ taxRate })
                    .then(response => {
                        const nextValue = response?.settings?.taxRate ?? taxRate;
                        const input = form.querySelector('[name="taxRate"]');
                        if (input) {
                            input.value = nextValue;
                        }
                        Domus.UI.showNotification(t('domus', 'Settings saved.'), 'success');
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function bindDemoButton() {
            const button = document.getElementById('domus-demo-content-button');
            const buildingButton = document.getElementById('domus-demo-content-building-button');
            if (buildingButton) {
                buildingButton.addEventListener('click', function() {
                    createDemoContent('buildingMgmt', buildingButton);
                });
            }
            if (button) {
                button.addEventListener('click', function() {
                    createDemoContent('landlord', button);
                });
            }
        }

        function bindRestartIntroButton() {
            const button = document.getElementById('domus-restart-intro-button');
            if (!button) {
                return;
            }
            button.addEventListener('click', function() {
                if (!Domus.Wizard || typeof Domus.Wizard.resetState !== 'function' || typeof Domus.Wizard.show !== 'function') {
                    Domus.UI.showNotification(t('domus', 'Unable to restart intro.'), 'error');
                    return;
                }
                button.disabled = true;
                Domus.Wizard.resetState()
                    .then(function() {
                        Domus.Wizard.show();
                        Domus.UI.showNotification(t('domus', 'Intro restarted.'), 'success');
                    })
                    .catch(function(error) {
                        Domus.UI.showNotification(error?.message || t('domus', 'Unable to restart intro.'), 'error');
                    })
                    .finally(function() {
                        button.disabled = false;
                    });
            });
        }

        function bindSectionToggles() {
            document.querySelectorAll('.domus-settings-section-header').forEach(header => {
                const toggleSection = () => {
                    const panel = header.closest('.domus-settings-section');
                    if (!panel) {
                        return;
                    }
                    panel.classList.toggle('domus-collapsed');
                    header.setAttribute('aria-expanded', (!panel.classList.contains('domus-collapsed')).toString());
                };
                header.addEventListener('click', event => {
                    if (event.target.closest('button')) {
                        return;
                    }
                    toggleSection();
                });
                header.addEventListener('keydown', event => {
                    if (event.target.closest('button')) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleSection();
                    }
                });
            });
        }

        function buildRulesSection() {
            return buildSettingsSection({id: 'domus-rules-panel', title: t('domus', 'Rulesets'),
                headerActions: Domus.UI.buildIconButton('domus-icon-add', t('domus', 'Add ruleset'), {id: 'domus-rule-add'}),
                body:
                '<p>' + Domus.Utils.escapeHtml(t('domus', 'Rules create tasks when a review is needed. Deferred tasks are checked again before they return.')) + '</p>' +
                '<div id="domus-rule-list"></div>'});
        }

        async function loadRules() {
            const host = document.getElementById('domus-rule-list');
            if (!host) return;
            const escape = Domus.Utils.escapeHtml;
            document.getElementById('domus-rule-add').onclick = () => openRuleEditor(null, host);
            host.textContent = t('domus', 'Loading…');
            try {
                const rules = await Domus.Api.get('/rules');
                if (!host.isConnected) return;
                const rows = rules.map(rule => ({cells: [
                    '<span>' + escape(rule.name) + '</span><div class="domus-muted">' +
                        escape(t('domus', 'Rent review after {months} months', {months: rule.months})) + '</div>',
                    escape(rule.scope === 'allUnits' ? t('domus', 'All units') : rule.scope === 'units' ? t('domus', 'Selected units') : t('domus', 'Units in selected properties')),
                    escape(rule.enabled ? t('domus', 'Enabled') : t('domus', 'Disabled')),
                    '<div class="domus-rule-actions">' +
                        Domus.UI.buildIconButton('domus-icon-edit', t('domus', 'Edit'), {dataset: {ruleEdit: rule.id}}) +
                        Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), {dataset: {ruleDelete: rule.id}}) +
                    '</div>'
                ]}));
                host.innerHTML = rules.length ? Domus.UI.buildTable([
                    t('domus', 'Name'), t('domus', 'Applies to'), t('domus', 'Status'), ''
                ], rows) : '<p>' + escape(t('domus', 'No rulesets yet.')) + '</p>';
                host.querySelectorAll('[data-rule-edit]').forEach(button => button.onclick = () => openRuleEditor(rules.find(rule => String(rule.id) === button.dataset.ruleEdit), host));
                host.querySelectorAll('[data-rule-delete]').forEach(button => button.onclick = async () => {
                    if (!await Domus.UI.confirmAction({message: t('domus', 'Delete this ruleset? Its open review tasks will be completed.'), confirmLabel: t('domus', 'Delete')})) return;
                    button.disabled = true;
                    try { await Domus.Api.delete('/rules/' + button.dataset.ruleDelete); if (host.isConnected) loadRules(); }
                    catch (error) { Domus.UI.showNotification(error.message, 'error'); button.disabled = false; }
                });
            } catch (error) {
                if (!host.isConnected) return;
                host.innerHTML = '<p>' + escape(t('domus', 'Unable to load rulesets.')) + ' <button type="button">' + escape(t('domus', 'Retry')) + '</button></p>';
                host.querySelector('button').onclick = loadRules;
            }
        }

        async function openRuleEditor(rule, host) {
            const escape = Domus.Utils.escapeHtml;
            try {
                const {units, properties} = await Domus.Api.get('/rules/options');
                if (!host.isConnected) return;
                const value = rule || {name: t('domus', 'Rent review'), enabled: true, months: 36, scope: 'allUnits', scopeIds: [], autoTask: false, dueDays: 30};
                const input = (name, type, extra = '') => '<input name="' + name + '" type="' + type + '" aria-label="' + escape(name === 'months' ? t('domus', 'Threshold (months)') : name === 'dueDays' ? t('domus', 'Task due after (days)') : t('domus', 'Name')) + '" value="' + escape(String(value[name])) + '" ' + extra + '>';
                const check = (name, label) => '<label><input name="' + name + '" type="checkbox"' + (value[name] ? ' checked' : '') + '> ' + escape(label) + '</label>';
                const scopes = [['allUnits', t('domus', 'All units')], ['units', t('domus', 'Selected units')], ['properties', t('domus', 'Units in selected properties')]];
                const rows = [
                    Domus.UI.buildFormRow({label: t('domus', 'Name'), content: input('name', 'text', 'required maxlength="150"')}),
                    Domus.UI.buildFormRow({label: t('domus', 'Rule'), content: escape(t('domus', 'Time since last base-rent increase'))}),
                    Domus.UI.buildFormRow({label: t('domus', 'Threshold (months)'), content: input('months', 'number', 'required min="1" max="600" step="1"')}),
                    Domus.UI.buildFormRow({label: t('domus', 'Alert warning'), content: '<textarea name="alertWarning" aria-label="' + escape(t('domus', 'Alert warning')) + '" required maxlength="1000">' + escape(value.alertWarning ?? t('domus', 'The rent has not been increased for at least {months} months.')) + '</textarea><p>' + escape(t('domus', 'Use {months} for the configured number of months.')) + '</p>'}),
                    Domus.UI.buildFormRow({label: t('domus', 'Applies to'), content: '<select name="scope" aria-label="' + escape(t('domus', 'Applies to')) + '">' + scopes.map(([key, label]) => '<option value="' + key + '"' + (value.scope === key ? ' selected' : '') + '>' + escape(label) + '</option>').join('') + '</select>'}),
                    Domus.UI.buildFormRow({label: t('domus', 'Enabled'), content: check('enabled', t('domus', 'Enable ruleset'))}),
                ];
                const modal = Domus.UI.openModal({title: rule ? t('domus', 'Edit ruleset') : t('domus', 'Add ruleset'), content: '<div class="domus-form"><form id="domus-rule-form">' +
                    Domus.UI.buildFormTable(rows) + '<fieldset id="domus-rule-scope"><legend>' + escape(t('domus', 'Scope selection')) + '</legend><div class="domus-rule-scope-options"></div></fieldset>' +
                    '<p>' + escape(t('domus', 'A completed or deleted task is not created again for the same rent-review period.')) + '</p>' +
                    '<div id="domus-rule-preview" aria-live="polite"></div><div class="domus-form-actions">' +
                    '<button type="button" data-rule-cancel>' + escape(t('domus', 'Cancel')) + '</button>' +
                    '<button type="button" data-rule-preview>' + escape(t('domus', 'Preview matches')) + '</button>' +
                    '<button type="submit" class="primary">' + escape(t('domus', 'Save')) + '</button></div></form></div>'});
                const form = modal.modalEl.querySelector('form');
                const scope = form.elements.scope;
                const selected = {units: new Set(value.scope === 'units' ? value.scopeIds.map(String) : []), properties: new Set(value.scope === 'properties' ? value.scopeIds.map(String) : [])};
                const renderScope = () => {
                    const field = form.querySelector('#domus-rule-scope');
                    field.hidden = scope.value === 'allUnits';
                    const entries = scope.value === 'units' ? units : properties;
                    field.querySelector('div').innerHTML = (entries || []).map(entity => '<label><input name="scopeIds" type="checkbox" value="' + entity.id + '"' + (selected[scope.value]?.has(String(entity.id)) ? ' checked' : '') + '> ' + escape(entity.label || entity.name) + '</label>').join('');
                    field.querySelectorAll('input').forEach(box => box.onchange = () => { if (box.checked) selected[scope.value].add(box.value); else selected[scope.value].delete(box.value); });
                };
                scope.onchange = renderScope;
                renderScope();
                modal.protectChanges();
                modal.modalEl.querySelector('[data-rule-cancel]').onclick = modal.requestClose;
                const payload = () => ({name: form.elements.name.value, alertWarning: form.elements.alertWarning.value, months: Number(form.elements.months.value), dueDays: 0,
                    scope: scope.value, scopeIds: scope.value === 'allUnits' ? [] : Array.from(selected[scope.value]).map(Number), enabled: form.elements.enabled.checked, autoTask: true});
                let revision = 0;
                form.oninput = () => { revision++; form.querySelector('#domus-rule-preview').replaceChildren(); };
                modal.modalEl.querySelector('[data-rule-preview]').onclick = async event => {
                    if (!form.reportValidity()) return;
                    const version = revision;
                    event.target.disabled = true;
                    try {
                        const matches = await Domus.Api.post('/rules/preview', payload());
                        if (!form.isConnected || revision !== version) return;
                        form.querySelector('#domus-rule-preview').innerHTML = matches.length
                            ? Domus.UI.buildTable([t('domus', 'Unit'), t('domus', 'Status'), t('domus', 'Due date')], matches.map(match => [
                                escape(match.unitLabel),
                                escape(match.status === 'unknown' ? t('domus', 'Reference date needed') : t('domus', 'Rent review due')),
                                escape(match.dueDate ? Domus.Utils.formatDate(match.dueDate) : '—')
                            ]), {wrapPanel: false})
                            : '<p>' + escape(t('domus', 'No matching units.')) + '</p>';
                    } catch (error) { if (form.isConnected) Domus.UI.showNotification(error.message, 'error'); }
                    finally { event.target.disabled = false; }
                };
                form.onsubmit = async event => {
                    event.preventDefault();
                    const button = modal.modalEl.querySelector('[type=submit]');
                    button.disabled = true;
                    try {
                        if (rule) await Domus.Api.put('/rules/' + rule.id, payload());
                        else await Domus.Api.post('/rules', payload());
                        modal.close();
                        if (host.isConnected) loadRules();
                    } catch (error) { Domus.UI.showNotification(error.message, 'error'); button.disabled = false; }
                };
            } catch (error) { if (host.isConnected) Domus.UI.showNotification(error.message, 'error'); }
        }

        function render(section = '') {
            const view = Domus.Router.beginView();
            Domus.UI.showLoading(t('domus', 'Loading…'));
            Domus.Api.getSettings()
                .then(response => {
                    if (!view.isCurrent()) return;
                    const settings = response?.settings || {};
                    const currentRole = Domus.Role?.getCurrentRole?.() || Domus.state.role || 'landlord';
                    const content = '<div class="domus-settings">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Settings')) + '</h2>' +
                        buildTeamSection(response?.requiredApps, response?.aiDocumentValidation) +
                        buildTaxSection(settings) +
                        buildTemplateSection(response?.utilityReportTemplate) +
                        buildIntroSection() +
                        buildRulesSection() +
                        Domus.TaskTemplates.renderSection() +
                        Domus.Accounts.renderSettingsSection() +
                        buildDemoSection(currentRole) +
                        '</div>';
                    Domus.UI.renderContent(content);
                    document.getElementById('domus-renter-preview-button').addEventListener('click', () => {
                        Domus.Router.navigate('renterPreview');
                    });
                    bindForm();
                    bindAiSection();
                    document.getElementById('domus-tax-report-button').onclick = openTaxReport;
                    bindTemplateSection(response?.utilityReportTemplate);
                    bindRestartIntroButton();
                    bindDemoButton();
                    bindSectionToggles();
                    if (section === 'documentTemplates') {
                        const panel = document.getElementById('domus-document-templates-panel');
                        panel.classList.remove('domus-collapsed');
                        panel.querySelector('.domus-section-header').setAttribute('aria-expanded', 'true');
                        panel.scrollIntoView({block: 'nearest'});
                    }
                    Domus.TaskTemplates.loadTemplates();
                    loadRules();
                    Domus.Accounts.loadSettingsSection();
                })
                .catch(err => { if (view.isCurrent()) Domus.UI.showError(err.message || t('domus', 'An error occurred')); });
        }

        return {
            render,
            createDemoContent,
            getDemoContentConfig
        };
    })();

    /**
     * Documents view
     */
})();

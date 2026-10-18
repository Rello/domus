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

            return buildSettingsSection({
                id: 'domus-general-settings-panel',
                title: t('domus', 'General Settings'),
                body: '<div class="domus-form">' +
                    '<form id="domus-settings-form">' +
                    Domus.UI.buildFormTable(rows) +
                    actions +
                    '</form>' +
                    '</div>'
            });
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

        function buildTeamSection(requiredApps) {
            const apps = [
                { id: 'circles', name: t('domus', 'Teams'), appUrl: '/apps/circles/teams/', storeUrl: '/settings/apps/organization/circles?q=teams' },
                { id: 'groupfolders', name: t('domus', 'Team Folders'), appUrl: '/settings/admin/groupfolders', storeUrl: '/settings/apps/search/groupfolders?q=groupfolders' },
                { id: 'guests', name: t('domus', 'Guests'), appUrl: '/settings/admin/guests', storeUrl: '/settings/apps/search/guests?q=guests' }
            ];
            const rows = apps.map(app => {
                const enabled = requiredApps?.[app.id] === true;
                const status = enabled ? t('domus', 'Enabled') : t('domus', 'Not installed or disabled');
                const linkLabel = enabled ? t('domus', 'Open app') : t('domus', 'Open App Store');
                return '<li class="domus-required-app">' +
                    '<span class="domus-required-app-status' + (enabled ? ' domus-required-app-enabled' : ' domus-required-app-unavailable') + '" aria-label="' + Domus.Utils.escapeHtml(status) + '" title="' + Domus.Utils.escapeHtml(status) + '">' + (enabled ? '✓' : 'X') + '</span>' +
                    '<a href="' + Domus.Utils.escapeHtml(OC.generateUrl(enabled ? app.appUrl : app.storeUrl)) + '" target="_blank" rel="noopener noreferrer" title="' + Domus.Utils.escapeHtml(linkLabel) + '">' + Domus.Utils.escapeHtml(app.name) + '</a>' +
                    '<span class="domus-muted">' + Domus.Utils.escapeHtml(status) + '</span></li>';
            }).join('');
            return buildSettingsSection({
                id: 'domus-team-settings-panel',
                title: t('domus', 'Management Team'),
                body: '<div class="domus-form">' +
                    '<p>' + Domus.Utils.escapeHtml(t('domus', 'Manage Team membership in Nextcloud Teams.')) + '</p>' +
                    '<ul class="domus-required-apps">' + rows + '</ul>' +
                    '<div class="domus-form-actions"><button type="button" class="secondary" id="domus-renter-preview-button">' +
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
                form.querySelector('[data-rule-cancel]').onclick = modal.requestClose;
                const payload = () => ({name: form.elements.name.value, alertWarning: form.elements.alertWarning.value, months: Number(form.elements.months.value), dueDays: 0,
                    scope: scope.value, scopeIds: scope.value === 'allUnits' ? [] : Array.from(selected[scope.value]).map(Number), enabled: form.elements.enabled.checked, autoTask: true});
                let revision = 0;
                form.oninput = () => { revision++; form.querySelector('#domus-rule-preview').replaceChildren(); };
                form.querySelector('[data-rule-preview]').onclick = async event => {
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
                    const button = form.querySelector('[type=submit]');
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

        function render() {
            const view = Domus.Router.beginView();
            Domus.UI.showLoading(t('domus', 'Loading…'));
            Domus.Api.getSettings()
                .then(response => {
                    if (!view.isCurrent()) return;
                    const settings = response?.settings || {};
                    const currentRole = Domus.Role?.getCurrentRole?.() || Domus.state.role || 'landlord';
                    const content = '<div class="domus-settings">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Settings')) + '</h2>' +
                        buildTeamSection(response?.requiredApps) +
                        buildForm(settings) +
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
                    bindRestartIntroButton();
                    bindDemoButton();
                    bindSectionToggles();
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

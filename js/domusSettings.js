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

        function render() {
            Domus.UI.showLoading(t('domus', 'Loading…'));
            Domus.Api.getSettings()
                .then(response => {
                    const settings = response?.settings || {};
                    const currentRole = Domus.Role?.getCurrentRole?.() || Domus.state.role || 'landlord';
                    const content = '<div class="domus-settings">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Settings')) + '</h2>' +
                        buildForm(settings) +
                        buildIntroSection() +
                        Domus.TaskTemplates.renderSection() +
                        Domus.Accounts.renderSettingsSection() +
                        buildDemoSection(currentRole) +
                        '</div>';
                    Domus.UI.renderContent(content);
                    bindForm();
                    bindRestartIntroButton();
                    bindDemoButton();
                    bindSectionToggles();
                    Domus.TaskTemplates.loadTemplates();
                    Domus.Accounts.loadSettingsSection();
                })
                .catch(err => Domus.UI.showError(err.message || t('domus', 'An error occurred')));
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

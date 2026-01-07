(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Settings = (function() {
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

        function buildDemoSection() {
            return '<div class="domus-form">' +
                '<div class="domus-form-section">' +
                '<h3>' + Domus.Utils.escapeHtml(t('domus', 'Demo content')) + '</h3>' +
                '<p>' + Domus.Utils.escapeHtml(t('domus', 'Create a demo dataset to explore units, partners, tenancies, tasks, and bookings.')) + '</p>' +
                '<div class="domus-form-actions">' +
                '<button type="button" class="secondary" id="domus-demo-content-button">' +
                Domus.Utils.escapeHtml(t('domus', 'Create demo content')) +
                '</button>' +
                '</div>' +
                '</div>' +
                '</div>';
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
            if (!button) {
                return;
            }
            button.addEventListener('click', function() {
                if (!window.confirm(t('domus', 'Create demo content? This will add sample data to your account.'))) {
                    return;
                }
                button.disabled = true;
                let created = false;
                Domus.Api.createDemoContent()
                    .then(() => {
                        created = true;
                        button.textContent = t('domus', 'Demo content created.');
                        Domus.UI.showNotification(t('domus', 'Demo content created.'), 'success');
                    })
                    .catch(err => Domus.UI.showNotification(err.message || t('domus', 'Unable to create demo content.'), 'error'))
                    .finally(() => {
                        button.disabled = created;
                    });
            });
        }

        function render() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading…'));
            Domus.Api.getSettings()
                .then(response => {
                    const settings = response?.settings || {};
                    const content = '<div class="domus-settings">' +
                        '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Settings')) + '</h2>' +
                        buildForm(settings) +
                        buildDemoSection() +
                        Domus.TaskTemplates.renderSection() +
                        '</div>';
                    Domus.UI.renderContent(content);
                    bindForm();
                    bindDemoButton();
                    Domus.TaskTemplates.loadTemplates();
                })
                .catch(err => Domus.UI.showError(err.message || t('domus', 'An error occurred')));
        }

        return { render };
    })();

    /**
     * Documents view
     */
})();

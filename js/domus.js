(function() {
    const Domus = window.Domus || {};

    Domus.state = {
        role: 'owner',
        hasOwnerRole: true,
        hasTenantOwnerRole: false,
        currentRoleView: 'owner',
        currentView: null,
        currentYear: (new Date()).getFullYear(),
        selectedPropertyId: null,
    };

    Domus.Api = (function() {
        const baseUrl = OC.generateUrl('/apps/domus');
        const headers = {
            'OCS-APIREQUEST': 'true',
            'Content-Type': 'application/json'
        };

        function handle(response) {
            if (!response.ok) {
                return response.json().then(err => Promise.reject(err));
            }
            return response.json();
        }

        function get(path) {
            return fetch(baseUrl + path, {headers}).then(handle);
        }

        function send(path, method, body) {
            return fetch(baseUrl + path, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            }).then(handle);
        }

        return {
            getProperties: () => get('/properties?year=' + Domus.state.currentYear),
            createProperty: data => send('/properties', 'POST', data),
            updateProperty: (id, data) => send('/properties/' + id, 'PUT', data),
            deleteProperty: id => send('/properties/' + id, 'DELETE'),
            getUnitsByProperty: id => get('/properties/' + id + '/units'),
        };
    })();

    Domus.UI = (function() {
        function renderNavigation() {
            const nav = document.getElementById('app-navigation');
            nav.innerHTML = '<ul>' +
                '<li><a href="#" data-view="dashboard">' + OC.escapeHTML(t('domus', 'Dashboard')) + '</a></li>' +
                '<li><a href="#" data-view="properties">' + OC.escapeHTML(t('domus', 'Properties')) + '</a></li>' +
                '</ul>';
            nav.querySelectorAll('a[data-view]').forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    Domus.Router.navigate(this.dataset.view);
                });
            });
        }

        function renderContent(html) {
            document.getElementById('app-content').innerHTML = html;
        }

        function showNotification(message, type = 'info') {
            const content = document.getElementById('app-content');
            const box = document.createElement('div');
            box.className = 'domus-notice ' + type;
            box.textContent = message;
            content.prepend(box);
            setTimeout(() => box.remove(), 4000);
        }

        function showLoading(message) {
            renderContent('<div class="domus-loading">' + OC.escapeHTML(message) + '</div>');
        }

        function showError(message) {
            renderContent('<div class="domus-error">' + OC.escapeHTML(message) + '</div>');
        }

        return { renderNavigation, renderContent, showNotification, showLoading, showError };
    })();

    Domus.Properties = (function() {
        function renderList() {
            Domus.UI.showLoading(t('domus', 'Loading properties…'));
            Domus.Api.getProperties()
                .then(properties => {
                    Domus.state.currentView = 'properties';
                    const items = properties.map(p => '<li data-id="' + p.id + '">' +
                        '<strong>' + OC.escapeHTML(p.name) + '</strong>' +
                        '<span class="domus-meta">' + OC.escapeHTML(p.city || '') + '</span>' +
                        '</li>').join('');
                    const html = '<div class="domus-toolbar">' +
                        '<button id="domus-new-property" class="primary">' + OC.escapeHTML(t('domus', 'New property')) + '</button>' +
                        '</div>' +
                        '<ul class="domus-list domus-properties">' + items + '</ul>' +
                        '<div id="domus-property-detail"></div>';
                    Domus.UI.renderContent(html);
                    bindListEvents();
                })
                .catch(err => Domus.UI.showError(err.message || 'Error'));
        }

        function bindListEvents() {
            const list = document.querySelector('.domus-properties');
            if (list) {
                list.querySelectorAll('li').forEach(item => {
                    item.addEventListener('click', () => renderDetail(parseInt(item.dataset.id, 10)));
                });
            }
            const add = document.getElementById('domus-new-property');
            if (add) {
                add.addEventListener('click', renderCreateForm);
            }
        }

        function renderCreateForm() {
            const formHtml = '<div class="domus-form">' +
                '<h3>' + OC.escapeHTML(t('domus', 'New property')) + '</h3>' +
                '<label>' + OC.escapeHTML(t('domus', 'Name')) + '<input name="name" required></label>' +
                '<label>' + OC.escapeHTML(t('domus', 'Usage role')) +
                '<select name="usageRole"><option value="manager">' + OC.escapeHTML(t('domus', 'Manager')) + '</option>' +
                '<option value="landlord">' + OC.escapeHTML(t('domus', 'Landlord')) + '</option></select></label>' +
                '<label>' + OC.escapeHTML(t('domus', 'City')) + '<input name="city"></label>' +
                '<label>' + OC.escapeHTML(t('domus', 'Street')) + '<input name="street"></label>' +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-save-property" class="primary">' + OC.escapeHTML(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-cancel-property">' + OC.escapeHTML(t('domus', 'Cancel')) + '</button>' +
                '</div>' +
                '</div>';
            Domus.UI.renderContent(formHtml);
            document.getElementById('domus-save-property').addEventListener('click', saveNew);
            document.getElementById('domus-cancel-property').addEventListener('click', renderList);
        }

        function saveNew() {
            const content = document.getElementById('app-content');
            const data = {
                name: content.querySelector('input[name="name"]').value,
                usageRole: content.querySelector('select[name="usageRole"]').value,
                city: content.querySelector('input[name="city"]').value,
                street: content.querySelector('input[name="street"]').value,
            };
            if (!data.name) {
                Domus.UI.showNotification(t('domus', 'Name is required.'), 'error');
                return;
            }
            Domus.Api.createProperty(data)
                .then(() => {
                    Domus.UI.showNotification(t('domus', 'Property created.'), 'success');
                    renderList();
                })
                .catch(err => Domus.UI.showError(err.message || 'Error'));
        }

        function renderDetail(id) {
            Domus.state.selectedPropertyId = id;
            Domus.UI.showLoading(t('domus', 'Loading property…'));
            Promise.all([
                Domus.Api.getProperties(),
                Domus.Api.getUnitsByProperty(id)
            ]).then(([props, units]) => {
                const property = props.find(p => p.id === id);
                if (!property) {
                    Domus.UI.showError(t('domus', 'Property not found.'));
                    return;
                }
                const unitItems = units.map(u => '<li>' + OC.escapeHTML(u.label) + '</li>').join('');
                const html = '<div class="domus-detail">' +
                    '<h2>' + OC.escapeHTML(property.name) + '</h2>' +
                    '<p>' + OC.escapeHTML(property.city || '') + '</p>' +
                    '<h3>' + OC.escapeHTML(t('domus', 'Units')) + '</h3>' +
                    '<ul>' + unitItems + '</ul>' +
                    '</div>';
                Domus.UI.renderContent(html);
            }).catch(err => Domus.UI.showError(err.message || 'Error'));
        }

        return { renderList, renderDetail };
    })();

    Domus.Router = (function() {
        function navigate(view) {
            switch (view) {
                case 'properties':
                    Domus.Properties.renderList();
                    break;
                default:
                    Domus.UI.renderContent('<p>' + OC.escapeHTML(t('domus', 'Welcome to Domus dashboard.')) + '</p>');
            }
        }
        return { navigate };
    })();

    function init() {
        Domus.UI.renderNavigation();
        Domus.Router.navigate('properties');
    }

    document.addEventListener('DOMContentLoaded', init);
    window.Domus = Domus;
})();

Komponentenplan und Beispielcode beziehen sich ausschließlich auf das Web-Frontend gemäß Vorgaben (Vanilla ES6, keine Bundler, DOM-Layout mit `app-navigation`, `app-content`, `app-sidebar`, globaler Namespace `Domus`).

---

## Komponenten

### 1. Global / Infrastruktur

1. **Domus.App**
   - Initialisierung der App.
   - Hält globale State-Objekte (Rolle, aktuelles Jahr, Selektion).
   - Startet Navigation, Router und initiale View (Dashboard oder Mieter-Dashboard).

2. **Domus.Router**
   - Einfache View-Steuerung (ohne Framework).
   - Mappt `viewName` → Render-Funktion.
   - Optional: Nutzung von `window.location.hash` für Back-Button-Unterstützung.

3. **Domus.Api**
   - Zentrale AJAX-/Fetch-Helfer.
   - Setzt Header `OCS-APIREQUEST: 'true'` und `RequestToken: OC.requestToken`.
   - Methoden für alle wichtigen Endpunkte (properties, units, partners, tenancies, bookings, reports, documents, dashboard).

4. **Domus.Navigation**
   - Baut `<ul>`-basierte Navigation in `#app-navigation`.
   - Unterscheidet Menü für Verwalter/Vermieter vs. Mieter/Eigentümer.
   - Enthält Rollenschalter (falls User beide Rollen besitzt).

5. **Domus.UI**
   - Allgemeine UI-Helfer:
     - Render in `#app-content` / `#app-sidebar`.
     - Loading- und Error-States.
     - Simple Form-/Table-Builder-Helfer.
     - Notification-Banner.

---

### 2. Feature-Views

Jedes Feature erhält ein Modul, das:
- Filter/Formular-UI erzeugt.
- Daten über `Domus.Api` lädt.
- Listen/Details rendert.
- Context-Aktionen (Create/Update/Delete) per AJAX ausführt.

1. **Domus.Dashboard**
   - Verwalter-Dashboard:
     - Filter: Jahr (Dropdown).
     - Kacheln/Kennzahlen.
     - Tabellen mit Properties/Units.
   - Mieter-Dashboard:
     - „Meine Mietverhältnisse“.
     - „Meine Abrechnungen“.

2. **Domus.Properties**
   - Liste aller Immobilien.
   - Detailansicht pro Immobilie (Tabs/Sektionen im Content-Bereich):
     - Stammdaten.
     - Mietobjekte (inline-List, nutzt `Domus.Units`-Renderer).
     - Einnahmen/Ausgaben (gefilterte Bookings-Teilliste).
     - Abrechnungen (Reports-Teilliste).
     - Dokumente (Documents-Teilliste).
   - Formulare: Neue Immobilie / Bearbeiten.

3. **Domus.Units**
   - Liste aller Mietobjekte (optional filterbar nach Property).
   - Detailansicht:
     - Stammdaten.
     - Mietverhältnisse (Tenancies-Teilliste).
     - Einnahmen/Ausgaben (Bookings-Teilliste).
     - Dokumente.
   - Formulare: Neues Mietobjekt / Bearbeiten.

4. **Domus.Partners**
   - Liste der Geschäftspartner mit Filter (Typ: tenant/owner).
   - Detailansicht:
     - Stammdaten.
     - Zugehörige Mietverhältnisse.
     - Zugehörige Reports (falls vorhanden).
     - Dokumente.
   - Formulare: Neuer Partner / Bearbeiten.

5. **Domus.Tenancies**
   - Globale Liste mit Filtern (Status, Jahr, Immobilie).
   - Detailansicht:
     - Kopf (Unit, Mieter, Zeitraum, Status).
     - Konditionen.
     - Einnahmen/Ausgaben (bezogene Bookings).
     - Dokumente.
     - Abrechnungen (falls tenancy-bezogene Reports existieren).
   - Formulare: Neues Mietverhältnis / Bearbeiten / Beenden.

6. **Domus.Bookings**
   - Liste Einnahmen/Ausgaben mit Filtern (Jahr, Immobilie, Typ, Kategorie).
   - Detail / inline Edit (optional).
   - Formular: Neue Buchung.
   - Kontext-Aufruf: aus Property/Unit/Tenancy-Detail mit vorbelegten Referenzen.

7. **Domus.Reports**
   - Übersicht vorhandener Reports:
     - Global oder gefiltert nach Property & Jahr.
   - Property-spezifische Reports-Ansicht:
     - Liste pro Jahr.
     - Aktion „Abrechnung erzeugen“ (POST).
   - Download per Link (Redirect-Endpunkt).

8. **Domus.Documents**
   - Generische Dokumentenliste für eine Entity (property | unit | partner | tenancy | booking | report).
   - Anzeige verknüpfter Dateien.
   - Aktionen: „Datei verknüpfen“ (Pfad-Eingabe oder später Filepicker) und „Link entfernen“.

9. **Domus.Role**
   - Bestimmt verfügbaren Kontext:
     - `role: 'owner' | 'tenantOwner' | 'mixed'`.
   - Stellt Hilfsfunktionen bereit, z. B. `isOwnerView()`.
   - Wird für Navigation und Sichtbarkeit von Aktionen genutzt.

---

## States

Globaler State (Domus.App):

```js
Domus.state = {
    role: 'owner', // 'owner' | 'tenantOwner'
    hasOwnerRole: false,
    hasTenantOwnerRole: false,
    currentRoleView: 'owner', // bei mixed
    currentView: null,        // z.B. 'dashboard', 'properties'
    currentYear: (new Date()).getFullYear(),
    selectedPropertyId: null,
    selectedUnitId: null,
    selectedPartnerId: null,
    selectedTenancyId: null
};
```

Wichtige Zustände:

1. **Rollen- und Kontextzustand**
   - `currentRoleView` steuert, welche Navigation aufgebaut wird und welche Views nutzbar sind.
   - Forcierte Filter in API-Aufrufen für Tenant/Eigentümer-Ansichten (Backend macht die eigentliche Filterlogik, Frontend geht von eingeschränkten Daten aus).

2. **Loading/Error-State je View**
   - Lokale States in Modulen, häufig einfach über DOM (Spinner, Meldungen) abgebildet, z.B. `Domus.UI.showLoading()`.

3. **Filter-/Formularzustand**
   - Jahr-Filter (`Domus.state.currentYear`).
   - Property-Filter (lokal in Views, z.B. `Domus.Properties.currentFilter` etc.).

---

## Views

### 1. Dashboard-View (`dashboard`)

- Owner:
  - Filterleiste (Jahr).
  - Kennzahlen-Kacheln.
  - Tabelle Properties mit Kennzahlen.
- Tenant/Eigentümer:
  - Listen „Meine Mietverhältnisse“ und „Meine Abrechnungen“.

API:
- `GET /apps/domus/dashboard/summary?year=YYYY`

---

### 2. Immobilien-Liste (`properties`)

- Toolbar:
  - Button „Neue Immobilie“.
- Tabelle:
  - Name, Adresse, Units, Kennzahlen.
- Klick auf Property führt zu Detail-View `properties:detail:{id}`.

API:
- `GET /apps/domus/properties?year=YYYY`
- `POST /apps/domus/properties`
- `PUT /apps/domus/properties/{id}`
- `DELETE /apps/domus/properties/{id}`

---

### 3. Immobilien-Detail (`propertyDetail`)

- Bereiche:
  - Stammdaten + Edit/Delete.
  - Teilliste Units (ruft `Domus.Units.renderListForProperty(id)`).
  - Teilliste Bookings (gefiltert).
  - Teilliste Reports (Property + Jahr).
  - Teilliste Documents (entityType=property).

API-Kombination:
- `GET /apps/domus/properties/{id}` (falls vorhanden)
- `GET /apps/domus/units?propertyId={id}`
- `GET /apps/domus/bookings?propertyId={id}&year=YYYY`
- `GET /apps/domus/properties/{id}/reports/{year}`
- `GET /apps/domus/documents/property/{id}`

---

### 4. Units-Views (`units`, `unitDetail`)

- `units`: globale Liste, optionaler Property-Filter.
- `unitDetail`: wie oben beschrieben.

APIs:
- `GET /apps/domus/units?propertyId=...`
- `GET /apps/domus/units/{id}`
- `POST /apps/domus/units`
- `PUT /apps/domus/units/{id}`
- `DELETE /apps/domus/units/{id}`

---

### 5. Partners-Views (`partners`, `partnerDetail`)

- Liste + Filter + Create.
- Detail mit zugehörigen Tenancies, Reports, Documents.

APIs:
- `GET /apps/domus/partners?partnerType=...`
- `GET /apps/domus/partners/{id}`
- `POST /apps/domus/partners`
- `PUT /apps/domus/partners/{id}`
- `DELETE /apps/domus/partners/{id}`
- `GET /apps/domus/tenancies?partnerId={id}`

---

### 6. Tenancies-Views (`tenancies`, `tenancyDetail`)

- `tenancies`: Liste mit Filtern.
- `tenancyDetail`: Kopf, Konditionen, Bookings, Documents, Reports.

APIs:
- `GET /apps/domus/tenancies?unitId=&partnerId=&status=`
- `GET /apps/domus/tenancies/{id}`
- `POST /apps/domus/tenancies`
- `PUT /apps/domus/tenancies/{id}`
- `DELETE /apps/domus/tenancies/{id}`
- `GET /apps/domus/bookings?tenancyId=...`
- `GET /apps/domus/reports?tenancyId=...` (falls vorhanden)

---

### 7. Bookings-View (`bookings`)

- Filter: Jahr (Pflicht), Property, Unit, Tenancy, Typ, Kategorie.
- Liste der Buchungen.
- Create/Edit/Delete.

APIs:
- `GET /apps/domus/bookings?...`
- `POST /apps/domus/bookings`
- `PUT /apps/domus/bookings/{id}`
- `DELETE /apps/domus/bookings/{id}`

---

### 8. Reports-View (`reports`)

- Global: Liste aller Reports, optional Filter nach Property/Jahr.
- Oder Property-kontrolliert: per Detailansicht.

APIs:
- `GET /apps/domus/properties/{propertyId}/reports/{year}`
- `POST /apps/domus/properties/{propertyId}/reports/{year}`
- `GET /apps/domus/reports/{id}/download` (direkter Download/Redirect)

---

### 9. Documents-View (teilspezifische Komponente)

- Kein eigener Haupt-View, sondern immer eingebettet in Detailansichten.
- Liste: filePath + Link (z.B. zur Files-App).
- Aktionen: Create/Delete.

APIs:
- `GET /apps/domus/documents/{entityType}/{entityId}`
- `POST /apps/domus/documents/{entityType}/{entityId}`
- `DELETE /apps/domus/documents/{id}`

---

## API-Layer (Domus.Api)

Ziele:
- Einheitliche Fehlerbehandlung.
- Standard-Header setzen.
- Primitive Convenience-Funktionen für CRUD.

```js
window.Domus = window.Domus || {};

Domus.Api = (function() {
    const baseUrl = OC.generateUrl('/apps/domus');

    function mergeOptions(method, body, extraOptions = {}) {
        const options = Object.assign({
            method,
            headers: {
                'OCS-APIREQUEST': 'true',
                'Accept': 'application/json'
            },
            credentials: 'same-origin'
        }, extraOptions);

        // Für schreibende Requests CSRF-Token mitsenden
        if (method !== 'GET' && method !== 'HEAD') {
            options.headers['RequestToken'] = OC.requestToken;
        }

        if (body !== null && body !== undefined) {
            if (options.headers['Content-Type'] === undefined) {
                options.headers['Content-Type'] = 'application/json';
            }
            if (options.headers['Content-Type'] === 'application/json' && typeof body !== 'string') {
                options.body = JSON.stringify(body);
            } else {
                options.body = body;
            }
        }

        return options;
    }

    function handleResponse(response) {
        if (!response.ok) {
            return response.json().catch(() => {
                throw new Error(t('domus', 'An unexpected error occurred.'));
            }).then(err => {
                const msg = err && err.message ? err.message : t('domus', 'An unexpected error occurred.');
                throw new Error(msg);
            });
        }
        if (response.status === 204) {
            return null;
        }
        return response.json();
    }

    function get(path, query = {}) {
        const url = new URL(baseUrl + path, window.location.origin);
        Object.keys(query).forEach(key => {
            if (query[key] !== null && query[key] !== undefined && query[key] !== '') {
                url.searchParams.append(key, query[key]);
            }
        });
        return fetch(url.toString(), mergeOptions('GET', null)).then(handleResponse);
    }

    function post(path, data) {
        return fetch(baseUrl + path, mergeOptions('POST', data)).then(handleResponse);
    }

    function put(path, data) {
        return fetch(baseUrl + path, mergeOptions('PUT', data)).then(handleResponse);
    }

    function del(path) {
        return fetch(baseUrl + path, mergeOptions('DELETE', null)).then(handleResponse);
    }

    // Spezifische API-Wrapper
    function getDashboardSummary(year) {
        return get('/dashboard/summary', { year });
    }

    function getProperties(year) {
        return get('/properties', { year });
    }

    function createProperty(data) {
        return post('/properties', data);
    }

    function updateProperty(id, data) {
        return put('/properties/' + id, data);
    }

    function deleteProperty(id) {
        return del('/properties/' + id);
    }

    function getUnits(filter = {}) {
        return get('/units', filter);
    }

    function createUnit(data) {
        return post('/units', data);
    }

    function updateUnit(id, data) {
        return put('/units/' + id, data);
    }

    function deleteUnit(id) {
        return del('/units/' + id);
    }

    function getPartners(filter = {}) {
        return get('/partners', filter);
    }

    function createPartner(data) {
        return post('/partners', data);
    }

    function updatePartner(id, data) {
        return put('/partners/' + id, data);
    }

    function deletePartner(id) {
        return del('/partners/' + id);
    }

    function getTenancies(filter = {}) {
        return get('/tenancies', filter);
    }

    function createTenancy(data) {
        return post('/tenancies', data);
    }

    function updateTenancy(id, data) {
        return put('/tenancies/' + id, data);
    }

    function deleteTenancy(id) {
        return del('/tenancies/' + id);
    }

    function getBookings(filter = {}) {
        return get('/bookings', filter);
    }

    function createBooking(data) {
        return post('/bookings', data);
    }

    function updateBooking(id, data) {
        return put('/bookings/' + id, data);
    }

    function deleteBooking(id) {
        return del('/bookings/' + id);
    }

    function getPropertyReports(propertyId, year) {
        return get('/properties/' + propertyId + '/reports/' + year);
    }

    function generatePropertyReport(propertyId, year) {
        return post('/properties/' + propertyId + '/reports/' + year, {});
    }

    function getDocuments(entityType, entityId) {
        return get('/documents/' + encodeURIComponent(entityType) + '/' + entityId);
    }

    function createDocumentLink(entityType, entityId, filePath) {
        return post('/documents/' + encodeURIComponent(entityType) + '/' + entityId, { filePath });
    }

    function deleteDocumentLink(id) {
        return del('/documents/' + id);
    }

    return {
        getDashboardSummary,
        getProperties,
        createProperty,
        updateProperty,
        deleteProperty,
        getUnits,
        createUnit,
        updateUnit,
        deleteUnit,
        getPartners,
        createPartner,
        updatePartner,
        deletePartner,
        getTenancies,
        createTenancy,
        updateTenancy,
        deleteTenancy,
        getBookings,
        createBooking,
        updateBooking,
        deleteBooking,
        getPropertyReports,
        generatePropertyReport,
        getDocuments,
        createDocumentLink,
        deleteDocumentLink
    };
})();
```

---

## Beispielcode

### 1. App-Entry (`js/main.js`)

```js
window.Domus = window.Domus || {};

Domus.App = (function() {
    const state = Domus.state = {
        hasOwnerRole: true,          // später via Backend-Config
        hasTenantOwnerRole: false,   // später via Backend-Config
        currentRoleView: 'owner',    // 'owner' | 'tenantOwner'
        currentView: null,
        currentYear: (new Date()).getFullYear(),
        selectedPropertyId: null,
        selectedUnitId: null,
        selectedPartnerId: null,
        selectedTenancyId: null
    };

    function init() {
        Domus.UI.init();
        Domus.Navigation.init();
        Domus.Router.init();
        // Startansicht
        if (state.hasOwnerRole) {
            Domus.Router.navigate('dashboard');
        } else {
            Domus.Router.navigate('tenantDashboard');
        }
    }

    function setRoleView(roleView) {
        if (!['owner', 'tenantOwner'].includes(roleView)) {
            return;
        }
        state.currentRoleView = roleView;
        Domus.Navigation.render(); // Menü neu aufbauen
        if (roleView === 'owner') {
            Domus.Router.navigate('dashboard');
        } else {
            Domus.Router.navigate('tenantDashboard');
        }
    }

    return {
        init,
        setRoleView,
        state
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    Domus.App.init();
});
```

---

### 2. UI-Helfer (`js/ui.js`)

```js
window.Domus = window.Domus || {};

Domus.UI = (function() {
    const contentEl = () => document.getElementById('app-content');
    const sidebarEl = () => document.getElementById('app-sidebar');

    function init() {
        // Grundzustand Sidebar
        sidebarEl().innerHTML = '';
    }

    function showLoading(message) {
        contentEl().innerHTML = '<div class="domus-loading">' +
            '<span class="icon-loading"></span> ' +
            (message || t('domus', 'Loading…')) +
            '</div>';
    }

    function showError(message) {
        contentEl().innerHTML = '<div class="domus-error">' +
            OC.escapeHTML(message || t('domus', 'An error occurred.')) +
            '</div>';
    }

    function renderContent(html) {
        contentEl().innerHTML = html;
    }

    function renderSidebar(html) {
        sidebarEl().innerHTML = html;
    }

    function showNotification(message, type = 'info') {
        // Einfaches Banner am oberen Rand
        const el = document.createElement('div');
        el.className = 'domus-notification domus-notification-' + type;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => {
            el.remove();
        }, 3000);
    }

    return {
        init,
        showLoading,
        showError,
        renderContent,
        renderSidebar,
        showNotification
    };
})();
```

---

### 3. Navigation (`js/navigation.js`)

```js
window.Domus = window.Domus || {};

Domus.Navigation = (function() {
    const navEl = () => document.getElementById('app-navigation');

    function init() {
        render();
        attachGlobalListeners();
    }

    function attachGlobalListeners() {
        // Delegated click handler
        navEl().addEventListener('click', function(e) {
            const link = e.target.closest('a[data-domus-view]');
            if (!link) return;
            e.preventDefault();
            const view = link.getAttribute('data-domus-view');
            Domus.Router.navigate(view);
        });

        // Rollenschalter (falls vorhanden)
        navEl().addEventListener('change', function(e) {
            if (e.target.matches('select[data-domus-role-switch]')) {
                Domus.App.setRoleView(e.target.value);
            }
        });
    }

    function render() {
        const state = Domus.App.state;
        const items = [];

        // Optionaler Rollenswitch
        let roleSwitcherHtml = '';
        if (state.hasOwnerRole && state.hasTenantOwnerRole) {
            roleSwitcherHtml =
                '<div class="domus-role-switch">' +
                '<label>' + t('domus', 'Role') + ': ' +
                '<select data-domus-role-switch>' +
                '<option value="owner"' + (state.currentRoleView === 'owner' ? ' selected' : '') + '>' +
                OC.escapeHTML(t('domus', 'Manager / Landlord')) +
                '</option>' +
                '<option value="tenantOwner"' + (state.currentRoleView === 'tenantOwner' ? ' selected' : '') + '>' +
                OC.escapeHTML(t('domus', 'Tenant / Owner')) +
                '</option>' +
                '</select></label></div>';
        }

        if (state.currentRoleView === 'owner') {
            items.push({ view: 'dashboard', label: t('domus', 'Dashboard') });
            items.push({ view: 'properties', label: t('domus', 'Properties') });
            items.push({ view: 'units', label: t('domus', 'Units') });
            items.push({ view: 'partners', label: t('domus', 'Business partners') });
            items.push({ view: 'tenancies', label: t('domus', 'Tenancies') });
            items.push({ view: 'bookings', label: t('domus', 'Income / Expenses') });
            items.push({ view: 'reports', label: t('domus', 'Reports') });
        } else {
            items.push({ view: 'tenantDashboard', label: t('domus', 'My overview') });
            items.push({ view: 'tenantTenancies', label: t('domus', 'My tenancies') });
            items.push({ view: 'tenantReports', label: t('domus', 'My reports') });
        }

        let html = '';
        if (roleSwitcherHtml) {
            html += roleSwitcherHtml;
        }
        html += '<ul class="domus-nav-list">';
        items.forEach(item => {
            html += '<li><a href="#" data-domus-view="' + OC.escapeHTML(item.view) + '">' +
                OC.escapeHTML(item.label) + '</a></li>';
        });
        html += '</ul>';

        navEl().innerHTML = html;
    }

    return {
        init,
        render
    };
})();
```

---

### 4. Router (`js/router.js`)

```js
window.Domus = window.Domus || {};

Domus.Router = (function() {
    const routes = {};

    function init() {
        // Routen registrieren
        routes['dashboard'] = Domus.Dashboard.renderOwnerDashboard;
        routes['tenantDashboard'] = Domus.Dashboard.renderTenantDashboard;
        routes['properties'] = Domus.Properties.renderList;
        routes['propertyDetail'] = Domus.Properties.renderDetail;
        routes['units'] = Domus.Units.renderList;
        routes['unitDetail'] = Domus.Units.renderDetail;
        routes['partners'] = Domus.Partners.renderList;
        routes['partnerDetail'] = Domus.Partners.renderDetail;
        routes['tenancies'] = Domus.Tenancies.renderList;
        routes['tenancyDetail'] = Domus.Tenancies.renderDetail;
        routes['bookings'] = Domus.Bookings.renderList;
        routes['reports'] = Domus.Reports.renderList;
        routes['tenantTenancies'] = Domus.Tenancies.renderTenantList;
        routes['tenantReports'] = Domus.Reports.renderTenantList;

        // Optional: Hash-Change für Back-Button
        window.addEventListener('hashchange', onHashChange);
    }

    function onHashChange() {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash) return;
        const parts = hash.split(':');
        const view = parts[0];
        const params = parts.slice(1);
        navigate(view, params, false);
    }

    function navigate(view, params = [], updateHash = true) {
        const handler = routes[view];
        Domus.App.state.currentView = view;
        if (updateHash) {
            const hash = [view].concat(params).join(':');
            window.location.hash = hash;
        }

        if (!handler) {
            Domus.UI.showError(t('domus', 'Unknown view.'));
            return;
        }
        try {
            handler.apply(null, params);
        } catch (e) {
            console.error(e);
            Domus.UI.showError(e.message || t('domus', 'An error occurred.'));
        }
    }

    return {
        init,
        navigate
    };
})();
```

---

### 5. Beispiel-View: Dashboard (`js/dashboard.js`)

```js
window.Domus = window.Domus || {};

Domus.Dashboard = (function() {

    function renderOwnerDashboard() {
        const state = Domus.App.state;
        Domus.UI.showLoading(t('domus', 'Loading dashboard…'));
        Domus.Api.getDashboardSummary(state.currentYear)
            .then(data => {
                const html = buildOwnerDashboardHtml(data);
                Domus.UI.renderContent(html);
                attachOwnerDashboardEvents();
            })
            .catch(err => {
                Domus.UI.showError(err.message);
            });
    }

    function buildOwnerDashboardHtml(data) {
        let html = '<div class="domus-dashboard">';
        html += '<div class="domus-dashboard-filters">';
        html += '<label>' + OC.escapeHTML(t('domus', 'Year')) + ': ';
        html += '<select id="domus-dashboard-year">';
        const currentYear = Domus.App.state.currentYear;
        for (let y = currentYear - 2; y <= currentYear + 1; y++) {
            html += '<option value="' + y + '"' + (y === currentYear ? ' selected' : '') + '>' +
                y + '</option>';
        }
        html += '</select></label>';
        html += '</div>';

        html += '<div class="domus-dashboard-cards">';
        html += buildCard(t('domus', 'Properties'), data.propertyCount);
        html += buildCard(t('domus', 'Units'), data.unitCount);
        html += buildCard(t('domus', 'Active tenancies'), data.activeTenancyCount);
        html += buildCard(t('domus', 'Annual cold rent (target)'), data.annualRentSoll);
        html += '</div>';

        // einfache Property-Tabelle
        if (data.properties && data.properties.length) {
            html += '<h3>' + OC.escapeHTML(t('domus', 'Properties overview')) + '</h3>';
            html += '<table class="domus-table"><thead><tr>';
            html += '<th>' + OC.escapeHTML(t('domus', 'Property')) + '</th>';
            html += '<th>' + OC.escapeHTML(t('domus', 'Units')) + '</th>';
            html += '<th>' + OC.escapeHTML(t('domus', 'Active tenancies')) + '</th>';
            html += '<th>' + OC.escapeHTML(t('domus', 'Annual rent (target)')) + '</th>';
            html += '</tr></thead><tbody>';
            data.properties.forEach(p => {
                html += '<tr data-property-id="' + p.propertyId + '">';
                html += '<td><a href="#" data-domus-goto-property="' + p.propertyId + '">' +
                    OC.escapeHTML(p.name) + '</a></td>';
                html += '<td>' + OC.escapeHTML(String(p.unitCount)) + '</td>';
                html += '<td>' + OC.escapeHTML(String(p.activeTenancyCount)) + '</td>';
                html += '<td>' + OC.escapeHTML(String(p.annualRentSoll)) + '</td>';
                html += '</tr>';
            });
            html += '</tbody></table>';
        } else {
            html += '<p>' + OC.escapeHTML(t('domus', 'No properties yet. Create your first property to get started.')) + '</p>';
        }

        html += '</div>';
        return html;
    }

    function buildCard(label, value) {
        return '<div class="domus-dashboard-card">' +
            '<div class="domus-dashboard-card-label">' + OC.escapeHTML(label) + '</div>' +
            '<div class="domus-dashboard-card-value">' + OC.escapeHTML(String(value)) + '</div>' +
            '</div>';
    }

    function attachOwnerDashboardEvents() {
        const content = document.getElementById('app-content');
        const yearSelect = content.querySelector('#domus-dashboard-year');
        if (yearSelect) {
            yearSelect.addEventListener('change', function() {
                Domus.App.state.currentYear = parseInt(this.value, 10);
                renderOwnerDashboard();
            });
        }
        content.addEventListener('click', function(e) {
            const link = e.target.closest('a[data-domus-goto-property]');
            if (!link) return;
            e.preventDefault();
            const id = link.getAttribute('data-domus-goto-property');
            Domus.App.state.selectedPropertyId = parseInt(id, 10);
            Domus.Router.navigate('propertyDetail', [id]);
        });
    }

    function renderTenantDashboard() {
        Domus.UI.showLoading(t('domus', 'Loading overview…'));
        // Für MVP können wir die Tenancies/Reports-Endpoints mit tenant-spezifischem Backend-Filter nutzen,
        // hier exemplarisch nur ein Platzhalter:
        Domus.UI.renderContent(
            '<p>' + OC.escapeHTML(t('domus', 'This is the tenant/owner dashboard (to be implemented).')) + '</p>'
        );
    }

    return {
        renderOwnerDashboard,
        renderTenantDashboard
    };
})();
```

---

### 6. Beispiel-View: Properties (`js/properties.js`)

```js
window.Domus = window.Domus || {};

Domus.Properties = (function() {

    function renderList() {
        const year = Domus.App.state.currentYear;
        Domus.UI.showLoading(t('domus', 'Loading properties…'));
        Domus.Api.getProperties(year)
            .then(properties => {
                const html = buildListHtml(properties);
                Domus.UI.renderContent(html);
                attachListEvents();
            })
            .catch(err => Domus.UI.showError(err.message));
    }

    function buildListHtml(properties) {
        let html = '<div class="domus-properties">';
        html += '<div class="domus-toolbar">';
        html += '<button class="primary" id="domus-create-property-btn">' +
            OC.escapeHTML(t('domus', 'New property')) + '</button>';
        html += '</div>';

        if (!properties || properties.length === 0) {
            html += '<p>' + OC.escapeHTML(t('domus', 'No properties found.')) + '</p>';
            html += '</div>';
            return html;
        }

        html += '<table class="domus-table">';
        html += '<thead><tr>';
        html += '<th>' + OC.escapeHTML(t('domus', 'Name')) + '</th>';
        html += '<th>' + OC.escapeHTML(t('domus', 'Address')) + '</th>';
        html += '<th>' + OC.escapeHTML(t('domus', 'Units')) + '</th>';
        html += '<th>' + OC.escapeHTML(t('domus', 'Annual result')) + '</th>';
        html += '</tr></thead><tbody>';

        properties.forEach(p => {
            const addr = [p.street, p.zip + ' ' + p.city, p.country].filter(Boolean).join(', ');
            html += '<tr data-id="' + p.id + '">';
            html += '<td><a href="#" data-domus-property-detail="' + p.id + '">' +
                OC.escapeHTML(p.name) + '</a></td>';
            html += '<td>' + OC.escapeHTML(addr) + '</td>';
            html += '<td>' + OC.escapeHTML(String(p.unitCount || 0)) + '</td>';
            html += '<td>' + OC.escapeHTML(String(p.annualResult || '')) + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        html += '</div>';
        return html;
    }

    function attachListEvents() {
        const content = document.getElementById('app-content');
        const createBtn = content.querySelector('#domus-create-property-btn');
        if (createBtn) {
            createBtn.addEventListener('click', function() {
                renderCreateForm();
            });
        }
        content.addEventListener('click', function(e) {
            const link = e.target.closest('a[data-domus-property-detail]');
            if (!link) return;
            e.preventDefault();
            const id = link.getAttribute('data-domus-property-detail');
            Domus.App.state.selectedPropertyId = parseInt(id, 10);
            Domus.Router.navigate('propertyDetail', [id]);
        });
    }

    function renderCreateForm() {
        const html =
            '<div class="domus-property-form">' +
            '<h2>' + OC.escapeHTML(t('domus', 'New property')) + '</h2>' +
            '<form id="domus-property-create-form">' +
            '<label>' + OC.escapeHTML(t('domus', 'Name')) + ' * ' +
            '<input type="text" name="name" required></label>' +
            '<label>' + OC.escapeHTML(t('domus', 'Usage role')) +
            '<select name="usageRole">' +
            '<option value="manager">' + OC.escapeHTML(t('domus', 'Manager')) + '</option>' +
            '<option value="landlord">' + OC.escapeHTML(t('domus', 'Landlord')) + '</option>' +
            '</select></label>' +
            '<label>' + OC.escapeHTML(t('domus', 'Street')) +
            '<input type="text" name="street"></label>' +
            '<label>' + OC.escapeHTML(t('domus', 'ZIP')) +
            '<input type="text" name="zip"></label>' +
            '<label>' + OC.escapeHTML(t('domus', 'City')) +
            '<input type="text" name="city"></label>' +
            '<label>' + OC.escapeHTML(t('domus', 'Country')) +
            '<input type="text" name="country" value="DE"></label>' +
            '<label>' + OC.escapeHTML(t('domus', 'Type')) +
            '<input type="text" name="type"></label>' +
            '<label>' + OC.escapeHTML(t('domus', 'Description')) +
            '<textarea name="description"></textarea></label>' +
            '<div class="domus-form-actions">' +
            '<button type="submit" class="primary">' + OC.escapeHTML(t('domus', 'Save')) + '</button>' +
            '<button type="button" id="domus-property-cancel-btn">' + OC.escapeHTML(t('domus', 'Cancel')) + '</button>' +
            '</div>' +
            '</form>' +
            '</div>';
        Domus.UI.renderContent(html);
        attachCreateFormEvents();
    }

    function attachCreateFormEvents() {
        const content = document.getElementById('app-content');
        const form = content.querySelector('#domus-property-create-form');
        const cancelBtn = content.querySelector('#domus-property-cancel-btn');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                renderList();
            });
        }

        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = formToObject(form);
                if (!data.name) {
                    Domus.UI.showNotification(t('domus', 'Name is required.'), 'error');
                    return;
                }
                Domus.Api.createProperty(data)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Property created.'), 'success');
                        renderList();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }
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

    function renderDetail(id) {
        // für MVP: wir nutzen vorhandene Endpoints; hier exemplarisch minimal:
        Domus.UI.showLoading(t('domus', 'Loading property…'));
        // Es gibt zwar keinen expliziten "show"-Endpoint im Kontrakt, aber er ist vorgesehen.
        Domus.Api.get('/properties/' + id) // kleiner Shortcut: Api.get ist nicht exportiert → alternativ: eigenen Helper ergänzen
            .then(property => {
                // plus weitere Teildaten aus Units/Bookings/Reports/Docs holen
                // hier als Platzhalter:
                Domus.UI.renderContent(
                    '<h2>' + OC.escapeHTML(property.name) + '</h2>' +
                    '<p>' + OC.escapeHTML(t('domus', 'Property detail view (to be completed).')) + '</p>'
                );
            })
            .catch(err => Domus.UI.showError(err.message));
    }

    return {
        renderList,
        renderDetail
    };
})();
```

> Hinweis: In `renderDetail` wird auf `Domus.Api.get` verwiesen. Oben im Api-Modul haben wir nur spezialisierte Methoden exportiert. In der echten Implementierung entweder `getPropertyById(id)` im API-Modul ergänzen oder generischen `get` exportieren.

---

### 7. Platzhalter für weitere Feature-Module

Analog zu `Domus.Properties` werden `Domus.Units`, `Domus.Partners`, `Domus.Tenancies`, `Domus.Bookings`, `Domus.Reports`, `Domus.Documents` aufgebaut:

- Listen-Renderer (`renderList`).
- Detail-Renderer (`renderDetail` / `renderListForX`).
- Form-Renderer (Create/Edit).
- Event-Bindung für Buttons/Links.
- Nutzung von `Domus.Api` für CRUD.

---

Damit ist der Frontend-Komponentenplan inklusive Modulstruktur, States, Views, API-Layer und repräsentativem Beispielcode für eine realistische Nextcloud-Vanilla-JS-App (Domus) definiert – ausschließlich UI, Navigation, Views und API-Calls.
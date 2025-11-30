## Architektur

Die Domus-App wird als klassische Nextcloud-App nach AppFramework-Architektur umgesetzt:

- **Backend**
  - PHP 8, Nextcloud 32 AppFramework.
  - Schichten: Controller → Service → Mapper → Entity → DB.
  - Nutzung der vorhandenen Nextcloud-Subsysteme:
    - Benutzer/Session: `OCP\IUserSession`, `OCP\IUserManager`.
    - DB: `OCP\IDBConnection`, Migrations via PHP-Migrationsklassen.
    - Files: `OCP\Files\IRootFolder`, `IUserFolder`.
    - L10N: `OCP\IL10N`.
    - Logging: `OCP\ILogger`.
  - App-Registrierung über `lib/AppInfo/Application.php` mit `IBootstrap`.
  - Navigationseintrag in `appinfo/info.xml`.
  - Routen in `appinfo/routes.php`.

- **Frontend**
  - Nur Vanilla JS (ES6), keine Bundler, kein Webpack.
  - Modul-Pattern mit einem globalen Namespace `Domus` und Untermodulen.
  - Haupt-HTML-Template stellt Struktur:
    - `<div id="app-navigation"></div>`
    - `<div id="app-content"></div>`
    - `<div id="app-sidebar"></div>`
  - Navigation in `#app-navigation` als `<ul>`-Listen.
  - Inhalte werden per AJAX geladen und in `#app-content` clientseitig gerendert.
  - Keine vollständigen Page-Reloads innerhalb der App; Navigation lädt nur neuen Content.

- **Architekturprinzipien**
  - Pro Nutzer logischer Mandant: Alle Datensätze sind immer genau einem Nextcloud-User-Account (Owner) zugeordnet, der Domus in der Rolle Verwalter oder Vermieter nutzt.
  - Mieter/Eigentümer als Sekundärnutzer:
    - Werden als normale Nextcloud-User angelegt (außer reinen Stammdatensätzen) und über Zuordnungstabellen mit Domus-Daten verknüpft.
    - Zugriff auf ihre eigenen Mietverhältnisse/Abrechnungen über Rollen-Logik in der App.

---

## Hauptkomponenten

### 1. Backend-Komponenten

#### 1.1 Application-Bootstrap (`lib/AppInfo/Application.php`)

- Registriert:
  - Navigationseintrag “Domus”.
  - DI-Container-Bindings für Services, Mappers.
- Implementiert `IBootstrap`:
  - `register()` für Event-Listener (falls später nötig).
  - `boot()` für Laufzeitinitialisierung (z.B. Bereitstellung von Frontend-Konfiguration).

#### 1.2 Entities & Mappers (Datenmodell)

Tabellennamen ≤ 23 Zeichen, lowerCamelCase-Felder, keine Unterstriche. Entities implementieren `jsonSerialize` und nutzen AppFramework-Annotations für Mapping.

**Kernentitäten (MVP)**

1. `Domus\Entity\Property` → Tabelle `domus_properties`
   - Felder (Auszug):
     - `id` (int, PK)
     - `user_id` (string, NC-User-ID des Domus-“Hauptnutzers” – Verwalter oder Vermieter)
     - `usageRole` (string: `manager` oder `landlord`) – Nutzungskontext dieser Immobilie
     - `name`
     - `street`
     - `zip`
     - `city`
     - `country`
     - `type` (optional, z.B. Mehrfamilienhaus)
     - `description` (optional)
     - `createdAt`, `updatedAt` (int, Unix-Timestamp)

2. `Domus\Entity\Unit` → Tabelle `domus_units`
   - `id`
   - `user_id` (NC-User)
   - `propertyId` (FK → `domus_properties.id`)
   - `label` (Bezeichnung)
   - `unitNumber` (Lage/Nummer)
   - `landRegister` (Grundbuch-Eintrag)
   - `livingArea`
   - `usableArea`
   - `unitType` (Wohnung/Gewerbe/Stellplatz)
   - `notes`
   - `createdAt`, `updatedAt`

3. `Domus\Entity\Partner` → Tabelle `domus_partners`
   - Geschäftspartner (Mieter/Eigentümer aus Sicht Verwalter/Vermieter)
   - `id`
   - `user_id` (NC-User – der Verwalter/Vermieter, dem diese Partner-Stammdaten gehören)
   - `partnerType` (`tenant` oder `owner`)
   - `name` (Pflicht)
   - `street`, `zip`, `city`, `country`
   - `email`
   - `phone`
   - `customerRef`
   - `notes`
   - `ncUserId` (optional: Nextcloud-User-ID, wenn ein technischer Account für Mieter/Eigentümer existiert)
   - `createdAt`, `updatedAt`

4. `Domus\Entity\PartnerRel` → Tabelle `domus_partner_rel`
   - Zuordnung Unit ↔ Eigentümer (Partner)
   - `id`
   - `user_id` (NC-User)
   - `type` (`unit` oder `tenancy`)
   - `relatinId` (`domus_units.id` oder `domus_tenancies.id`)
   - `partnerId` (`domus_partners.id`)

5. `Domus\Entity\Tenancy` → Tabelle `domus_tenancies`
   - Mietverhältnis
   - `id`
   - `user_id`
   - `unitId`
   - `startDate` (date)
   - `endDate` (nullable date)
   - `baseRent` (decimal)
   - `serviceCharge` (decimal, optional)
   - `serviceChargeAsPrepayment` (bool/flag)
   - `deposit` (decimal, optional)
   - `conditions` (text, Freitext)
   - `status` (berechnetes Feld in Service, nicht persistent oder als gecachter String)
   - `createdAt`, `updatedAt`

7. `Domus\Entity\Booking` → Tabelle `domus_bookings`
   - Einnahme/Ausgabe
   - `id`
   - `user_id`
   - `bookingType` (`income` | `expense`)
   - `category` (Enum-ähnlicher String, z.B. `rent`, `serviceCharge`, `maintenance`, usw.)
   - `date` (date)
   - `amount` (decimal, Euro)
   - `year` (int, redundant zur schnellen Filterung)
   - Bezug:
     - `propertyId` (nullable)
     - `unitId` (nullable)
     - `tenancyId` (nullable)
     - Validierung im Service: mindestens einer der Bezüge gesetzt
   - `description`
   - `createdAt`, `updatedAt`

8. `Domus\Entity\DocumentLink` → Tabelle `domus_docLinks`
   - Verknüpfung auf NC-Dateisystem
   - `id`
   - `user_id`
   - `entityType` (`property`, `unit`, `partner`, `tenancy`, `booking`)
   - `entityId`
   - `filePath` (Relativer Pfad im persönlichen NC-Filespace des Owners)
   - `createdAt`

9. `Domus\Entity\Report` → Tabelle `domus_reports`
   - Metadaten zu Abrechnungsdateien
   - `id`
   - `user_id`
   - `year`
   - `propertyId`
   - optional: `unitId`, `tenancyId`, `partnerId`
   - `filePath` (Pfad zur generierten Datei im Filesystem)
   - `createdAt`

**Mappers**
- Je Entity ein Mapper, z.B. `Domus\Db\PropertyMapper` extends `QBMapper<Property>`.
- Methoden: `find`, `findByOwner`, `findAllForOwner`, `insert`, `update`, `delete`, sowie spezifische Query-Methoden (z.B. `findByPropertyId`).

#### 1.3 Services

1. `PropertyService`
   - CRUD für Immobilien unter Berücksichtigung von `user_id`.
   - Berechnung einfacher Kennzahlen:
     - Anzahl Units
     - Summe Mieten/Jahr (über aktive Tenancies, Buchungen).

2. `UnitService`
   - CRUD für Mietobjekte.
   - Laden von Units inkl. aktueller und historischer Tenancies (für Detailansicht).

3. `PartnerService`
   - CRUD für Geschäftspartner.
   - Auflösen von Relationen (Partner → Tenancies, Reports).

4. `TenancyService`
   - CRUD für Mietverhältnisse.
   - Konsistenzprüfungen (Unit gehört Owner, Partner gehören Owner).
   - Statusberechnung:
     - `active`: `startDate <= today` und (`endDate` null oder `endDate >= today`)
     - `historical`: `endDate < today`
     - `future`: `startDate > today`.
   - Abfragen: Tenancies pro Unit, pro Partner.

5. `BookingService`
   - CRUD für Einnahmen/Ausgaben.
   - Validierung des Bezugs (mind. propertyId/unitId/tenancyId).
   - Jahresbezogene Auswertungen pro Immobilie/Unit/Tenancy.
   - Logik für Jahresverteilung:
     - Berechnet bei Bedarf (nicht zwingend als eigene Buchungen in V1):
       - z.B. Jahresbetrag `insurance` einer Immobilie → virtuelle pro-Monats- bzw. pro-Mietverhältnis-Anteile für Reports.

6. `ReportService`
   - Erstellung von Jahresabrechnungen (zunächst auf Immobilienebene).
   - Datenaggregation:
     - Summen pro Kategorie (Income/Expense).
     - Netto-Ergebnis.
     - Miete pro m² (wenn Flächen vorhanden).
   - Dateigenerierung:
     - Erzeugt Markdown/Text-Datei im Pfad: `/DomusApp/Abrechnungen/<Jahr>/<PropertyName>/<Dateiname>.md`.
     - Nutzung `IRootFolder`/`IUserFolder`.
   - Speichert `Report`-Entity mit Verknüpfungen (propertyId, optional unitId/tenancyId/partnerId).

7. `DashboardService`
   - Aggregiert Kennzahlen für das Dashboard:
     - Anzahl Immobilien, Units, aktive Tenancies.
     - Summe Soll-Kaltmieten aktueller Tenancies (Jahres-Soll, Monats-Soll).
     - Miete/m² je Unit, Gesamt-Kennzahlen.
   - Filteroption (Jahr, Immobilie).

8. `DocumentService`
   - Verwaltung von `DocumentLink`-Einträgen.
   - Validierung des Pfades im Benutzer-Filespace.
   - Rückgabe von Links (Standard-File-URL).

#### 1.4 Controller

Alle Controller verwenden Nextcloud-Annotations wie `#[NoAdminRequired]` / `#[NoCSRFRequired]` für AJAX-GETs (read-only). Für mutierende Requests nur `#[NoAdminRequired]`, CSRF durch NC-Standard.

Beispiele:

- `PropertyController`
  - `index()`: Liste aller Properties eines Owners.
  - `show(int $id)`: Detail.
  - `create()`, `update(int $id)`, `delete(int $id)`.

- `UnitController`
  - `listByProperty(int $propertyId)`, `show(int $id)`, CRUD.

- `PartnerController`
  - `index()`, `show(int $id)`, CRUD.

- `TenancyController`
  - `index()`, `listByUnit(int $unitId)`, `listByPartner(int $partnerId)`, CRUD.
  
- `BookingController`
  - `index()`, Filter nach Jahr/Property/Unit/Tenancy, CRUD.

- `ReportController`
  - `listByProperty(int $propertyId, int $year)`.
  - `generateForProperty(int $propertyId, int $year)` – erzeugt Abrechnung, gibt Report-Metadaten zurück.
  - `download(int $id)` – gibt NC-Datei-URL oder Redirect.

- `DashboardController`
  - `summary(int $year = currentYear)` – liefert Dashboard-Daten (JSON).

- `DocumentController`
  - `listForEntity(string $entityType, int $entityId)`.
  - `linkFile(string $entityType, int $entityId, string $filePath)`.
  - `unlink(int $id)`.

### 2. Frontend-Komponenten

#### 2.1 Haupt-Entry (z.B. `js/main.js`)

- Initialisiert `Domus`-Namespace:
  ```js
  window.Domus = window.Domus || {};
  Domus.App = (function() {
      const state = {
          currentView: null,
          currentYear: (new Date()).getFullYear(),
      };

      function init() {
          Domus.Navigation.init();
          Domus.Dashboard.init();
          Domus.Router.navigate('dashboard');
      }

      return { init };
  })();

  document.addEventListener('DOMContentLoaded', () => {
      Domus.App.init();
  });
  ```

- Einbindung im Haupt-Template-HTML der App.

#### 2.2 Navigation-Modul (`js/navigation.js`)

- Fügt UL-basiertes Menü in `#app-navigation` ein:
  - Menüpunkte: Dashboard, Immobilien, Mietobjekte, Geschäftspartner, Mietverhältnisse, Einnahmen/Ausgaben, Abrechnungen.
- Klick-Handler rufen `Domus.Router.navigate(viewName)` auf (verhindern Page-Reload).

#### 2.3 Router-Modul (`js/router.js`)

- Einfacher View-Router:
  - Map von View-Namen zu Renderfunktionen:
    - `dashboard`, `properties`, `units`, `partners`, `tenancies`, `bookings`, `reports`.
  - Lädt per AJAX die jeweiligen Daten (GET-Endpoints mit Header `OCS-APIREQUEST: 'true'`), rendert HTML in `#app-content`.

#### 2.4 View-Module

Je View ein Modul, das Daten lädt und DOM erzeugt:

- `Domus.Dashboard`
- `Domus.Properties`
- `Domus.Units`
- `Domus.Partners`
- `Domus.Tenancies`
- `Domus.Bookings`
- `Domus.Reports`
- `Domus.Documents` (für Dokumentenliste in Detailansichten)

Alle Module:

- verwenden `OC.requestToken` für CSRF.
- setzen Header `OCS-APIREQUEST: 'true'`.
- nutzen `t('domus', 'String')` für sichtbare Texte.

Beispiel AJAX-Aufruf:
```js
function fetchJson(url, options = {}) {
    const defaultOptions = {
        headers: {
            'OCS-APIREQUEST': 'true',
            'RequestToken': OC.requestToken,
            'Accept': 'application/json',
        },
        credentials: 'same-origin',
    };
    return fetch(url, Object.assign(defaultOptions, options))
        .then(resp => resp.json());
}
```

---

## Datenfluss

### 1. CRUD-Stammdaten (Immobilie)

**Erstellen einer Immobilie**

1. Nutzer klickt im Frontend “Neue Immobilie”.
2. `Domus.Properties` zeigt Formular (clientseitiges Template).
3. Submit → JS sendet `POST /apps/domus/properties` mit JSON-Payload.
4. `PropertyController::create()`:
   - Ermittelt `currentUserId` über `IUserSession`.
   - Validiert Eingaben.
   - Erstellt `Property`-Entity (`user_id = currentUserId`).
   - Ruft `PropertyService::createProperty($entity)`.
5. `PropertyService`:
   - nutz `PropertyMapper->insert($entity)`.
6. Mapper speichert in `domus_properties`.
7. Controller gibt JSON (neu erstellte Immobilie).
8. Frontend aktualisiert Liste (ohne Page-Reload).

**Lesen**

- `GET /apps/domus/properties`:
  - `PropertyService::getPropertiesForOwner($currentUserId)`.
  - Rückgabe JSON-Liste → `Domus.Properties` rendert Tabelle/Karten.

**Update/Delete**

- Analog, mit `PUT`/`DELETE` (oder `POST` mit `_method`-Feld, je nach NC-Konvention) auf `/apps/domus/properties/{id}`.
- Service prüft `user_id == currentUser`.

### 2. Mietverhältnisse

**Anlegen Mietverhältnis**

1. `Domus.Tenancies` lädt benötigen Stammdaten:
   - `GET /apps/domus/units` (für Auswahl)
   - `GET /apps/domus/partners?type=tenant`
2. User füllt Formular.
3. `POST /apps/domus/tenancies` mit:
   - `unitId`, `partnerIds[]`, `startDate`, `baseRent`, optional `endDate`, etc.
4. `TenancyController::create()`:
   - Validierung, Owner-Zugehörigkeit (Unit und Partner müssen dem aktuellen Owner gehören).
   - Erzeugt `Tenancy` + `TenancyPartner`-Einträge via `TenancyService`.
5. `TenancyService` speichert:
   - Tenancy in `domus_tenancies`.
   - TenancyPartner in `domus_tenancyPart`.
6. Frontend aktualisiert Mietverhältnisliste für das Objekt/den Mieter.

**Statusberechnung**

- `TenancyService` oder spezielle Helper bestimmen Status on-the-fly beim Lesen:
  - Ergebnis-Feld `status` in JSON.

### 3. Einnahmen/Ausgaben

**Erfassen einer Buchung**

1. UI (Domus.Bookings) zeigt Formular:
   - Dropdown: Typ (Einnahme/Ausgabe).
   - Kategorie.
   - Datum, Betrag.
   - Auswahl Bezug (Immobilie / Unit / Mietverhältnis) – per Radiobutton + Dropdown(s).
2. `POST /apps/domus/bookings`.
3. `BookingController::create()` ruft `BookingService::createBooking()`.
4. Service prüft:
   - Gültige year (aus Datum).
   - Mindestens ein Bezug gesetzt, Owner-Konsistenz.
5. Mapper speichert in `domus_bookings`.

**Verteilung Jahresbeträge**

- Bei Erstellung/Update eines “Jahresbetrags” (z.B. Kreditzinsen mit Bezug auf Immobilie):
  - In V1 keine persistente Aufteilung; Logik wird im `ReportService` beim Generieren der Jahresabrechnung angewandt:
    - Ermitteln aller Tenancies der Immobilie im Jahr.
    - Monatliche Zeitanteile pro Tenancy.
    - Virtuelle Zuweisung von anteiligen Beträgen in der Report-Berechnung (Ausgabe in Statistik).

### 4. Abrechnungserstellung

**Jahresabrechnung pro Immobilie**

1. User öffnet in `Domus.Reports` eine Immobilie und wählt Jahr.
2. Klick “Abrechnung erzeugen”.
3. `POST /apps/domus/reports/property/{propertyId}/{year}`.
4. `ReportController::generateForProperty()`:
   - Ruft `ReportService::generatePropertyReport($propertyId, $year, $currentUserId)`.
5. `ReportService`:
   - Prüft Eigentum (Property.user_id == currentUserId).
   - Holt:
     - Alle relevanten Bookings des Jahres (Income/Expense).
     - Alle Tenancies samt Flächen für Kennzahlen.
   - Berechnet Summen pro Kategorie & Netto-Ergebnis.
   - Berechnet Kennzahlen (Miete/m², Rendite falls Daten vorhanden).
   - Erzeugt Markdown-Content.
   - Ermittelt UserFolder via `IUserFolder`:
     - Pfad: `/DomusApp/Abrechnungen/<Jahr>/<PropertyName>/<timestamp>-Abrechnung.md`.
   - Erstellt Datei im NC-Filesystem mit Inhalt.
   - Legt `Report`-Datensatz an.
6. Controller gibt Report-Metadaten + Link (Pfad).
7. Frontend zeigt Eintrag in Liste, Link öffnet die Datei via standard Files-App (neuer Tab/Viewer).

---

## Schnittstellen

### 1. Internal/Backend-APIs (Controller-Routen)

Alle Routen in `appinfo/routes.php` definiert. Beispiele:

- Properties:
  - `GET /apps/domus/properties`
  - `GET /apps/domus/properties/{id}`
  - `POST /apps/domus/properties`
  - `PUT /apps/domus/properties/{id}`
  - `DELETE /apps/domus/properties/{id}`

- Units:
  - `GET /apps/domus/units`
  - `GET /apps/domus/properties/{propertyId}/units`
  - `GET /apps/domus/units/{id}`
  - `POST /apps/domus/units`
  - `PUT /apps/domus/units/{id}`
  - `DELETE /apps/domus/units/{id}`

- Partners:
  - `GET /apps/domus/partners`
  - `GET /apps/domus/partners/{id}`
  - `POST /apps/domus/partners`
  - `PUT /apps/domus/partners/{id}`
  - `DELETE /apps/domus/partners/{id}`

- Tenancies:
  - `GET /apps/domus/tenancies`
  - `GET /apps/domus/units/{unitId}/tenancies`
  - `GET /apps/domus/partners/{partnerId}/tenancies`
  - `GET /apps/domus/tenancies/{id}`
  - `POST /apps/domus/tenancies`
  - `PUT /apps/domus/tenancies/{id}`
  - `DELETE /apps/domus/tenancies/{id}`

- Bookings:
  - `GET /apps/domus/bookings`
  - `GET /apps/domus/bookings/{id}`
  - `POST /apps/domus/bookings`
  - `PUT /apps/domus/bookings/{id}`
  - `DELETE /apps/domus/bookings/{id}`

- Reports:
  - `GET /apps/domus/reports`
  - `GET /apps/domus/properties/{propertyId}/reports/{year}`
  - `POST /apps/domus/properties/{propertyId}/reports/{year}`
  - `GET /apps/domus/reports/{id}` (Metadaten)
  - `GET /apps/domus/reports/{id}/download` (Redirect/URL)

- Documents:
  - `GET /apps/domus/documents/{entityType}/{entityId}`
  - `POST /apps/domus/documents/{entityType}/{entityId}`
  - `DELETE /apps/domus/documents/{id}`

- Dashboard:
  - `GET /apps/domus/dashboard/summary?year={year}`

Alle Antworten JSON (außer evtl. Download-Redirect).

### 2. Integration mit Nextcloud-Subsystemen

- **User/Rollen**
  - Kein eigener Auth-Mechanismus.
  - Rollenmodell Domus-intern:
    - Verwalter/Vermieter: Standard-Nutzer mit Zugriff auf volle App-Funktionalität.
    - Mieter/Eigentümer:
      - über `Partner.ncUserId` assoziiert.
      - Beim Login: Dashboard und Views filtern Daten nach:
        - Entweder `user_id == currentUserId` (Rolle Verwalter/Vermieter) oder
        - `ncUserId == currentUserId` via Joins auf `domus_partner_rel` und `domus_partner` (Rolle Mieter/Eigentümer).
  - Unterscheidung der Rolle geschieht dynamisch über vorhandene Zuordnungen und ggf. NC-Gruppenzugehörigkeit (z.B. Gruppe `domus_tenants`, `domus_owners` – Konfiguration ist Erweiterungsoption).

- **Files**
  - `IRootFolder`/`IUserFolder` genutzt, um Dateien im Benutzer-Filespace abzulegen:
    - Standard-Root-Pfad z.B. `/DomusApp`.
  - Verknüpfte Dokumente speichern nur relative Pfade (`filePath`) → Anzeige über NC-Viewer.

- **L10N**
  - Backend: `IL10N->t('...')`
  - Frontend: `t('domus', '...')`
  - In V1 keine eigenen Sprachdateien; Text steht zunächst direkt im Code (übersetzbar später).

---

## Sicherheitsanforderungen

1. **Authentifizierung**
   - Nur eingeloggte Nextcloud-User.
   - Alle Controller mit `#[NoAdminRequired]` (kein Admin nötig), aber nie `#[PublicPage]`.

2. **Autorisierung/Isolation**
   - Strikte Prüfung `user_id` bei jedem Lese-/Schreibzugriff:
     - Verwalter/Vermieter: Nur Datensätze, deren `user_id == currentUserId`.
   - Mieter/Eigentümer-Zugriff:
     - Via Join auf Partner mit `ncUserId == currentUserId`.
     - Nur Mietverhältnisse, Reports und Dokumente, die über solche Partner-Beziehungen erreichbar sind.
   - Keine Cross-User-Zugriffe durch manipulierte IDs.

3. **CSRF-Schutz**
   - Standard Nextcloud CSRF-Token:
     - Frontend sendet `RequestToken`-Header.
     - Backend nutzt AppFramework-Standard (kein `#[NoCSRFRequired]` für mutierende Requests).
   - Nur reine GET-/Leserouten können `#[NoCSRFRequired]` nutzen (falls notwendig).

4. **Eingabevalidierung**
   - Serverseitige Validierung aller Felder:
     - Datumsformate, Beträge (dezimal, >= 0), Pflichtfelder.
     - Enum-Strings (`bookingType`, `partnerType`, `entityType`) gegen Whitelists.
   - Frontend-Validierung ergänzend, aber nicht sicherheitsrelevant.

5. **File-System-Sicherheit**
   - `DocumentService` prüft:
     - Pfad liegt innerhalb des Benutzer-Homeverzeichnisses.
     - Keine Pfadmanipulation (“..” etc.).
   - Nur Pfad-Referenzen, keine Roh-Uploads (V1 kann Dateiupload an NC-Files delegieren).

6. **Datenbank**
   - Nutzung von QueryBuilder/`QBMapper` → Schutz vor SQL-Injection.
   - Begrenzung von Feldlängen und Indexen in Migrationen.

7. **Sichtbarkeit von Daten**
   - API gibt nur notwendige Felder zurück (z.B. keine internen IDs fremder Owner).
   - Spezielle Views für Mieter/Eigentümer: Nur lesend, keine CRUD auf Stamm-/Finanzdaten.

8. **Protokollierung**
   - Verwendung von `ILogger` bei Fehlersituationen (ohne vertrauliche Daten im Klartext).

---

## Risiken

1. **Komplexität Rollenmodell (Owner vs. Partner vs. NC-User)**
   - Risiko: Verwechslung von `user_id` und `ncUserId` könnte zu Datenlecks führen.
   - Mitigation: Klare Service-Schicht-Methoden mit expliziten Checks, Unit-Tests für Autorisierungspfade.

2. **Mehrmandantenfähigkeit pro NC-Instanz**
   - Aktuell: Jede Domus-Installation ist pro Nextcloud-User ein eigener „Mandant“.
   - Risiko: Fehlende Feingranularität, wenn mehrere Verwalter innerhalb einer Organisation dieselbe Immobilie verwalten sollen.
   - In V1 akzeptiert laut Scope; spätere Versionen brauchen erweitertes Berechtigungskonzept (z.B. Shared-Ownership, ACL).

3. **Performance bei Aggregationen (Dashboard, Reports)**
   - Risiko: Viele Tenancies/Bookings können Reports langsam machen.
   - Mitigation V1:
     - Indizes auf `user_id`, `year`, `propertyId`, `unitId`, `tenancyId`.
     - Caching optional außerhalb Scope; Aggregationen für MVP sind überschaubar.

4. **Fehleranfälligkeit bei Jahresverteilungslogik**
   - Da keine persistente Aufteilung stattfindet, wird Logik bei jedem Report neu berechnet.
   - Risiken:
     - Komplexe Edgecases (Mietwechseln im Monat).
   - In V1: Vereinfachte, klar dokumentierte Logik (Monatsweise Zuordnung, Taggenauigkeit optional).

5. **Dokumentenverknüpfung**
   - Risiko: Benutzer wählt Pfade, die später nicht mehr existieren (gelöschte Dateien).
   - Mitigation: App zeigt Dead-Links, aber bricht nicht; optional später Health-Checks.

6. **Frontendentwicklung ohne Framework**
   - Risiko: Manuelle DOM-Manipulationen können unübersichtlich werden.
   - Mitigation: Strikte Modulare Struktur (`Domus.*`-Module), konsistente Helper-Funktionen, begrenzter Funktionsumfang in MVP (keine hochkomplexe UI-Logik).

7. **Upgrade-Pfade**
   - Migrationsabhängigkeiten bei zukünftigen Versionen (weitere Tabellen/Felder).
   - Saubere Versions-Migrationsklassen nötig, um spätere Erweiterungen (z.B. Währungen, Feingranular-Rechte) zu ermöglichen.

Diese Architektur deckt die MVP-Akzeptanzkriterien ab: Dashboard, alle relevanten Erfassungsmasken, grundlegende CRUD-Prozesse, Dokumentenverknüpfung, Jahresabrechnung (Immobilienebene) und integrationstreue Nutzung von Nextcloud-Benutzer-, DB- und Dateisystemfunktionen.
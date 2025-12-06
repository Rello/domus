# Backend-Konzept

## Endpunkte (Überblick)

Alle Endpunkte liegen unter `/apps/domus/…` und liefern JSON (außer Report-Download-Redirect).  
Routen werden in `appinfo/routes.php` registriert, Controller im Namespace `OCA\Domus\Controller`.

### Property (Immobilien)

- `GET    /apps/domus/properties`
- `GET    /apps/domus/properties/{id}`
- `POST   /apps/domus/properties`
- `PUT    /apps/domus/properties/{id}`
- `DELETE /apps/domus/properties/{id}`

### Unit (Mietobjekte)

- `GET    /apps/domus/units`
- `GET    /apps/domus/properties/{propertyId}/units`
- `GET    /apps/domus/units/{id}`
- `POST   /apps/domus/units`
- `PUT    /apps/domus/units/{id}`
- `DELETE /apps/domus/units/{id}`

### Partner (Geschäftspartner: Mieter/Eigentümer)

- `GET    /apps/domus/partners`
- `GET    /apps/domus/partners/{id}`
- `POST   /apps/domus/partners`
- `PUT    /apps/domus/partners/{id}`
- `DELETE /apps/domus/partners/{id}`

### PartnerRel (Zuordnungen)

- Wird ausschließlich über Services genutzt; kein eigener öffentlicher CRUD-Endpunkt im MVP.  
  Zuordnungen werden über spezialisierte Payloads bei `Tenancy` & `Unit` gepflegt.

### Tenancy (Mietverhältnisse)

- `GET    /apps/domus/tenancies`
- `GET    /apps/domus/tenancies/{id}`
- `GET    /apps/domus/units/{unitId}/tenancies`
- `GET    /apps/domus/partners/{partnerId}/tenancies`
- `POST   /apps/domus/tenancies`
- `PUT    /apps/domus/tenancies/{id}`
- `DELETE /apps/domus/tenancies/{id}`

### Booking (Einnahmen/Ausgaben)

- `GET    /apps/domus/bookings`
- `GET    /apps/domus/bookings/{id}`
- `POST   /apps/domus/bookings`
- `PUT    /apps/domus/bookings/{id}`
- `DELETE /apps/domus/bookings/{id}`

### Report (Abrechnungen)

- `GET    /apps/domus/reports`
- `GET    /apps/domus/reports/{id}`
- `GET    /apps/domus/properties/{propertyId}/reports/{year}`
- `POST   /apps/domus/properties/{propertyId}/reports/{year}`
- `GET    /apps/domus/reports/{id}/download`

### DocumentLink (Dokumenten-Verknüpfungen)

- `GET    /apps/domus/documents/{entityType}/{entityId}`
- `POST   /apps/domus/documents/{entityType}/{entityId}`
- `DELETE /apps/domus/documents/{id}`

### Dashboard

- `GET    /apps/domus/dashboard/summary` (optional `?year=YYYY`)

---

## Datenmodelle

Alle Entities implementieren:

- `OCP\AppFramework\Db\Entity`
- `JsonSerializable`
- Tabellenname ≤ 23 Zeichen, lowerCamelCase-Spaltennamen, kein `_`.
- Automatisches Mapping mit `@ORM\Column` bzw. `@Column`-Annotations.

### 1. PropertyEntity → Tabelle `domus_properties`

Felder (DB-Spalten in Klammern):

- `id` (id, PK, int)
- `userId` (user_id, string, max 64)
- `usageRole` (usageRole, string: `manager` | `landlord`)
- `name` (name, string)
- `street` (street, string, nullable)
- `zip` (zip, string, nullable)
- `city` (city, string, nullable)
- `country` (country, string, nullable)
- `type` (type, string, nullable)
- `description` (description, text, nullable)
- `createdAt` (createdAt, int)
- `updatedAt` (updatedAt, int)

Nicht persistente Felder für Antworten (per `jsonSerialize` hinzugefügt, nicht als Spalten):

- `unitCount`
- `annualRentSum`
- `annualResult`

### 2. UnitEntity → Tabelle `domus_units`

- `id`
- `userId`
- `propertyId` (FK domus_properties.id)
- `label`
- `unitNumber`
- `landRegister`
- `livingArea` (float/decimal)
- `usableArea` (float/decimal, nullable)
- `unitType` (string, nullable)
- `notes` (text, nullable)
- `createdAt`
- `updatedAt`

Nicht persistent:

- `activeTenancies` (Array von Tenancy-Daten)
- `historicTenancies`
- `rentPerSquareMeter`

### 3. PartnerEntity → Tabelle `domus_partners`

- `id`
- `userId`
- `partnerType` (`tenant` | `owner`)
- `name`
- `street` (nullable)
- `zip` (nullable)
- `city` (nullable)
- `country` (nullable)
- `email` (nullable)
- `phone` (nullable)
- `customerRef` (nullable)
- `notes` (text, nullable)
- `ncUserId` (nullable, string, max 64)
- `createdAt`
- `updatedAt`

### 4. PartnerRelEntity → Tabelle `domus_partner_rel`

- `id`
- `userId`
- `type` (`unit` | `tenancy`)
- `relationId` (int; FK zu domus_units.id oder domus_tenancies.id)
- `partnerId` (FK domus_partners.id)

### 5. TenancyEntity → Tabelle `domus_tenancies`

- `id`
- `userId`
- `unitId`
- `startDate` (string `YYYY-MM-DD`)
- `endDate` (nullable string)
- `baseRent` (decimal: string in PHP, DECIMAL in DB)
- `serviceCharge` (decimal, nullable)
- `serviceChargeAsPrepayment` (bool/int)
- `deposit` (decimal, nullable)
- `conditions` (text, nullable)
- `createdAt`
- `updatedAt`

Nicht persistent:

- `status` (`active` | `historical` | `future`)
- `partnerIds` (int[])
- `partners` (Partner-Objekte)

### 6. BookingEntity → Tabelle `domus_bookings`

- `id`
- `userId`
- `account` (int, Kontonummer)
- `date` (string `YYYY-MM-DD`)
- `amount` (decimal)
- `year` (int)
- `propertyId` (nullable)
- `unitId` (nullable)
- `tenancyId` (nullable)
- `description` (text, nullable)
- `createdAt`
- `updatedAt`

### 7. DocumentLinkEntity → Tabelle `domus_docLinks`

- `id`
- `userId`
- `entityType` (`property` | `unit` | `partner` | `tenancy` | `booking` | `report`)
- `entityId`
- `filePath` (string, relativer Pfad im User-Filespace)
- `createdAt`

### 8. ReportEntity → Tabelle `domus_reports`

- `id`
- `userId`
- `year` (int)
- `propertyId`
- `unitId` (nullable)
- `tenancyId` (nullable)
- `partnerId` (nullable)
- `filePath` (string)
- `createdAt`

Nicht persistent:

- `downloadUrl` (vom Service berechnet)

---

## Geschäftslogik (Services)

### 1. PropertyService

Verantwortung:

- CRUD für Properties
- Owner-Isolation (`userId` = aktueller Benutzer)
- Berechnete Kennzahlen für Dashboard/Listen

Kernmethoden:

- `listPropertiesForUser(string $userId): array`
  - nutzt `PropertyMapper->findByUser($userId)`
  - ergänzt unitCount, annualRentSum, annualResult via `UnitMapper`, `BookingMapper`, `TenancyMapper`.
- `getPropertyForUser(int $id, string $userId): Property`
  - wirft NotFound, wenn `userId` nicht passt.
- `createProperty(array $data, string $userId): Property`
  - Validierung (Name Pflicht, usageRole in [`manager`, `landlord`])
  - setzt timestamps.
- `updateProperty(int $id, array $data, string $userId): Property`
  - lädt, prüft userId, aktualisiert.
- `deleteProperty(int $id, string $userId): void`
  - verweigert ggf. Löschung, wenn abhängige Units existieren (oder führt Kaskadenlogik aus).

### 2. UnitService

Verantwortung:

- CRUD für Units
- Konsistenz: Unit.propertyId gehört userId
- Laden inkl. Tenancies

Kernmethoden:

- `listUnitsForUser(string $userId, ?int $propertyId = null): array`
- `getUnitForUser(int $id, string $userId): Unit`
- `createUnit(array $data, string $userId): Unit`
  - prüft Property.userId == userId.
- `updateUnit(int $id, array $data, string $userId): Unit`
- `deleteUnit(int $id, string $userId): void`
- `getUnitWithTenancies(int $id, string $userId): array`
  - liefert Unit plus aktive/historische Tenancies.

### 3. PartnerService

Verantwortung:

- CRUD Partner
- Zuordnungen via PartnerRel

Kernmethoden:

- `listPartners(string $userId, ?string $type = null): array`
- `getPartnerForUser(int $id, string $userId): Partner`
- `createPartner(array $data, string $userId): Partner`
  - partnerType validieren (`tenant` | `owner`).
- `updatePartner(int $id, array $data, string $userId): Partner`
- `deletePartner(int $id, string $userId): void`
  - prüft, ob Relationen existieren.
- `getTenanciesForPartner(int $partnerId, string $userId): array`
- `getUnitsForOwnerPartner(int $partnerId, string $userId): array`

### 4. TenancyService

Verantwortung:

- CRUD Tenancy
- PartnerRel-Pflege (`type=tenancy`)
- Konsistenz: Unit.userId == userId, Partner.userId == userId
- Status-Berechnung

Kernmethoden:

- `listTenancies(string $userId, ?int $unitId = null, ?int $partnerId = null): array`
- `getTenancyForUser(int $id, string $userId): Tenancy`
  - holt auch PartnerIDs.
- `createTenancy(array $data, string $userId): Tenancy`
  - required: unitId, startDate, baseRent, partnerIds[]
  - prüft Ownership: Unit.userId, Partner.userId.
  - erzeugt Tenancy + PartnerRel-Einträge.
- `updateTenancy(int $id, array $data, string $userId): Tenancy`
  - analog create; aktualisiert Relationen.
- `deleteTenancy(int $id, string $userId): void`
  - löscht Tenancy + zugehörige PartnerRel.
- `getStatus(Tenancy $tenancy, \DateTimeImmutable $today): string`
- `getTenanciesForUnit(int $unitId, string $userId): array`
- `getTenanciesForPartner(int $partnerId, string $userId): array`

### 5. BookingService

Verantwortung:

- CRUD Bookings
- Validierung der Referenzen (propertyId/unitId/tenancyId)
- Jahresfilter

Kernmethoden:

- `listBookings(string $userId, array $filter): array`
  - Filter: year, propertyId, unitId, tenancyId, account
- `getBookingForUser(int $id, string $userId): Booking`
- `createBooking(array $data, string $userId): Booking`
  - amount >= 0
  - mindestens eine Referenz gesetzt
  - Ownership der referenzierten Entities.
  - year aus date ableiten.
- `updateBooking(int $id, array $data, string $userId): Booking`
- `deleteBooking(int $id, string $userId): void`
- `getAggregatesForPropertyYear(int $propertyId, int $year, string $userId): array`
  - Summen pro Konto.

Verteilungslogik für Jahresbeträge:

- Im MVP ausschließlich innerhalb `ReportService`, hier nur die rohen Bookings.

### 6. ReportService

Verantwortung:

- Generierung von Jahresreports (zunächst pro Property)
- Aggregation der Daten
- Ablage im Filesystem via `IUserFolder`
- Anlage von Report-Entities

Kernmethoden:

- `listReports(string $userId, ?int $propertyId = null, ?int $year = null): array`
- `getReportForUser(int $id, string $userId): Report`
- `generatePropertyReport(int $propertyId, int $year, string $userId): Report`
  - prüft Property.userId
  - lädt Bookings des Jahres
  - lädt Tenancies und Units der Property
  - berechnet:
    - Summen pro Konto
    - Netto-Ergebnis (Einnahmen/Ausgaben über Betragsvorzeichen)
    - Kennzahlen (Miete/m², etc.)
  - baut Markdown-Content
  - nutzt `IRootFolder` / `IUserFolder`:
    - Pfad: `/DomusApp/Abrechnungen/<year>/<propertyName>/<timestamp>-Abrechnung.md`
  - erstellt Datei, legt Report-Datensatz an.
- `getDownloadUrl(Report $report, string $userId): string`
  - konvertiert `filePath` in Web-URL zur Files-App.

### 7. DashboardService

Verantwortung:

- Aggregierte Kennzahlen für Dashboard

Kernmethoden:

- `getSummary(string $userId, int $year): array`
  - Anzahl Properties, Units, aktive Tenancies
  - Summe Soll-Kaltmieten (aus aktiven Tenancies im Jahr)
  - Miete/m² (durchschnittlich, pro Unit)
  - evtl. Liste „offene Punkte“ (z. B. Bookings ohne tenancyId).

### 8. DocumentService

Verantwortung:

- CRUD für DocumentLink
- Pfadvalidierung

Kernmethoden:

- `listForEntity(string $userId, string $entityType, int $entityId): array`
- `linkFile(string $userId, string $entityType, int $entityId, string $filePath): DocumentLink`
  - prüft erlaubte entityTypes
  - normalisiert Pfad
  - prüft, dass Datei im User-Filespace existiert.
- `unlink(string $userId, int $id): void`

---

## Fehlerfälle

Allgemeines Format (Controller-Ebene, JSON):

```json
{
  "status": "error",
  "message": "Localized error message",
  "code": "SOME_ERROR_CODE",
  "details": { ...optional... }
}
```

Typische Fehler:

1. **Authentifizierung**

- Nicht eingeloggte Nutzer → Nextcloud übernimmt, Controller werden nicht ausgeführt.

2. **Autorisierung**

- Zugriff auf Ressource eines anderen Users:
  - HTTP 404 (vermeidet Information, dass Ressource existiert)
  - `code`: `NOT_FOUND`
- Speziell bei Tenants/Eigentümern (Sekundärnutzer):
  - wenn `ncUserId`-Zugriff versucht, aber keine passende PartnerRel existiert → 404.

3. **Validierung**

- Fehlende Pflichtfelder oder ungültige Werte:
  - HTTP 400
  - `code`: `VALIDATION_ERROR`
  - `details`: Feldfehler (z.B. `{ "field": "baseRent", "error": "Must be >= 0" }`)

4. **Business-Logik**

- Löschen mit abhängigen Datensätzen nicht erlaubt:
  - HTTP 409
  - `code`: `CONFLICT`
- Ungültige Enum-Werte:
  - 400, `code`: `INVALID_VALUE`

5. **Dateisystem**

- Datei-Pfad liegt außerhalb Home:
  - 400, `code`: `INVALID_PATH`
- Datei nicht gefunden:
  - 404, `code`: `FILE_NOT_FOUND`

6. **Reports**

- Report-Datei im Filesystem fehlt:
  - beim Download 404, `code`: `REPORT_FILE_MISSING`

Alle Fehler loggen über `ILogger` (ohne sensitive Daten).

---

## Beispielcode

### 1. Application-Bootstrap (`lib/AppInfo/Application.php`)

```php
<?php

namespace OCA\Domus\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\IContainer;

class Application extends App implements IBootstrap {

    public const APP_ID = 'domus';

    public function __construct(array $urlParams = []) {
        parent::__construct(self::APP_ID, $urlParams);
    }

    public function register(IRegistrationContext $context): void {
        // Hier könnten Event-Listener registriert werden
    }

    public function boot(IBootContext $context): void {
        // Optionale Runtime-Initialisierung (z.B. JS-Konfig)
    }
}
```

### 2. PropertyEntity (`lib/Db/Property.php`)

```php
<?php

namespace OCA\Domus\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * @method int getId()
 * @method void setId(int $id)
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * ...
 */
class Property extends Entity implements JsonSerializable {

    protected $userId;
    protected $usageRole;
    protected $name;
    protected $street;
    protected $zip;
    protected $city;
    protected $country;
    protected $type;
    protected $description;
    protected $createdAt;
    protected $updatedAt;

    // Non-persistent response helpers
    private ?int $unitCount = null;
    private ?string $annualRentSum = null;
    private ?string $annualResult = null;

    public function __construct() {
        $this->addType('id', 'int');
        $this->addType('createdAt', 'int');
        $this->addType('updatedAt', 'int');
    }

    public function setUnitCount(?int $count): void {
        $this->unitCount = $count;
    }

    public function setAnnualRentSum(?string $sum): void {
        $this->annualRentSum = $sum;
    }

    public function setAnnualResult(?string $result): void {
        $this->annualResult = $result;
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->getId(),
            'userId' => $this->getUserId(),
            'usageRole' => $this->usageRole,
            'name' => $this->name,
            'street' => $this->street,
            'zip' => $this->zip,
            'city' => $this->city,
            'country' => $this->country,
            'type' => $this->type,
            'description' => $this->description,
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
            'unitCount' => $this->unitCount,
            'annualRentSum' => $this->annualRentSum,
            'annualResult' => $this->annualResult,
        ];
    }
}
```

### 3. PropertyMapper (`lib/Db/PropertyMapper.php`)

```php
<?php

namespace OCA\Domus\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;

class PropertyMapper extends QBMapper {

    public function __construct(IDBConnection $db) {
        parent::__construct($db, 'domus_properties', Property::class);
    }

    /**
     * @return Property[]
     */
    public function findByUser(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where(
                $qb->expr()->eq('user_id', $qb->createNamedParameter($userId))
            )
            ->orderBy('name', 'ASC');

        return $this->findEntities($qb);
    }

    public function findForUser(int $id, string $userId): Property {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where(
                $qb->expr()->andX(
                    $qb->expr()->eq('id', $qb->createNamedParameter($id)),
                    $qb->expr()->eq('user_id', $qb->createNamedParameter($userId))
                )
            );

        return $this->findEntity($qb);
    }
}
```

### 4. PropertyService (`lib/Service/PropertyService.php`)

```php
<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Property;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Db\BookingMapper;
use OCP\IL10N;

class PropertyService {

    public function __construct(
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private BookingMapper $bookingMapper,
        private IL10N $l10n,
    ) {}

    /**
     * @return Property[]
     */
    public function listPropertiesForUser(string $userId, int $year = null): array {
        $properties = $this->propertyMapper->findByUser($userId);
        foreach ($properties as $property) {
            $unitCount = $this->unitMapper->countByProperty($property->getId(), $userId);
            $property->setUnitCount($unitCount);

            if ($year !== null) {
                $aggregates = $this->bookingMapper->aggregateForPropertyYear(
                    $property->getId(),
                    $year,
                    $userId
                );
                $property->setAnnualRentSum($aggregates['income'] ?? '0.00');
                $property->setAnnualResult(($aggregates['income'] ?? 0) - ($aggregates['expense'] ?? 0));
            }
        }
        return $properties;
    }

    public function getPropertyForUser(int $id, string $userId): Property {
        return $this->propertyMapper->findForUser($id, $userId);
    }

    public function createProperty(array $data, string $userId): Property {
        if (empty($data['name'])) {
            throw new \InvalidArgumentException($this->l10n->t('Property name is required.'));
        }
        if (!in_array($data['usageRole'] ?? '', ['manager', 'landlord'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid usage role.'));
        }

        $now = time();
        $property = new Property();
        $property->setUserId($userId);
        $property->usageRole = $data['usageRole'];
        $property->name = $data['name'];
        $property->street = $data['street'] ?? null;
        $property->zip = $data['zip'] ?? null;
        $property->city = $data['city'] ?? null;
        $property->country = $data['country'] ?? null;
        $property->type = $data['type'] ?? null;
        $property->description = $data['description'] ?? null;
        $property->createdAt = $now;
        $property->updatedAt = $now;

        return $this->propertyMapper->insert($property);
    }

    public function updateProperty(int $id, array $data, string $userId): Property {
        $property = $this->getPropertyForUser($id, $userId);
        if (isset($data['name']) && $data['name'] === '') {
            throw new \InvalidArgumentException($this->l10n->t('Property name cannot be empty.'));
        }
        foreach (['name','street','zip','city','country','type','description'] as $field) {
            if (array_key_exists($field, $data)) {
                $property->$field = $data[$field] ?: null;
            }
        }
        if (isset($data['usageRole'])) {
            if (!in_array($data['usageRole'], ['manager', 'landlord'], true)) {
                throw new \InvalidArgumentException($this->l10n->t('Invalid usage role.'));
            }
            $property->usageRole = $data['usageRole'];
        }
        $property->updatedAt = time();

        return $this->propertyMapper->update($property);
    }

    public function deleteProperty(int $id, string $userId): void {
        $property = $this->getPropertyForUser($id, $userId);
        $unitCount = $this->unitMapper->countByProperty($id, $userId);
        if ($unitCount > 0) {
            throw new \RuntimeException($this->l10n->t('Cannot delete property with existing units.'));
        }
        $this->propertyMapper->delete($property);
    }
}
```

### 5. PropertyController (`lib/Controller/PropertyController.php`)

```php
<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\PropertyService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;
use OCP\AppFramework\Http;

use OCP\AppFramework\Http\Attribute\NoAdminRequired;

class PropertyController extends Controller {

    public function __construct(
        string $appName,
        IRequest $request,
        private IUserSession $userSession,
        private PropertyService $propertyService,
        private IL10N $l10n,
    ) {
        parent::__construct($appName, $request);
    }

    private function getUserId(): string {
        $user = $this->userSession->getUser();
        return $user ? $user->getUID() : '';
    }

    #[NoAdminRequired]
    public function index(?int $year = null): DataResponse {
        $userId = $this->getUserId();
        $props = $this->propertyService->listPropertiesForUser($userId, $year);
        return new DataResponse($props);
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        $userId = $this->getUserId();
        try {
            $property = $this->propertyService->getPropertyForUser($id, $userId);
            return new DataResponse($property);
        } catch (\Throwable $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $this->l10n->t('Property not found.'),
                'code' => 'NOT_FOUND',
            ], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function create(string $name, string $usageRole, ?string $street = null, ?string $zip = null,
                           ?string $city = null, ?string $country = null, ?string $type = null,
                           ?string $description = null): DataResponse {
        $userId = $this->getUserId();
        $data = compact('name','usageRole','street','zip','city','country','type','description');
        try {
            $property = $this->propertyService->createProperty($data, $userId);
            return new DataResponse($property, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $e->getMessage(),
                'code' => 'VALIDATION_ERROR',
            ], Http::STATUS_BAD_REQUEST);
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $name = null, ?string $usageRole = null, ?string $street = null,
                           ?string $zip = null, ?string $city = null, ?string $country = null,
                           ?string $type = null, ?string $description = null): DataResponse {
        $userId = $this->getUserId();
        $data = array_filter([
            'name' => $name,
            'usageRole' => $usageRole,
            'street' => $street,
            'zip' => $zip,
            'city' => $city,
            'country' => $country,
            'type' => $type,
            'description' => $description,
        ], static fn($v) => $v !== null);

        try {
            $property = $this->propertyService->updateProperty($id, $data, $userId);
            return new DataResponse($property);
        } catch (\InvalidArgumentException $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $e->getMessage(),
                'code' => 'VALIDATION_ERROR',
            ], Http::STATUS_BAD_REQUEST);
        } catch (\Throwable $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $this->l10n->t('Property not found.'),
                'code' => 'NOT_FOUND',
            ], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $userId = $this->getUserId();
        try {
            $this->propertyService->deleteProperty($id, $userId);
            return new DataResponse(['status' => 'success']);
        } catch (\RuntimeException $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $e->getMessage(),
                'code' => 'CONFLICT',
            ], Http::STATUS_CONFLICT);
        } catch (\Throwable $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $this->l10n->t('Property not found.'),
                'code' => 'NOT_FOUND',
            ], Http::STATUS_NOT_FOUND);
        }
    }
}
```

### 6. routes.php (Ausschnitt für Properties)

```php
<?php

return [
    'routes' => [
        [
            'name' => 'property#index',
            'url' => '/properties',
            'verb' => 'GET',
        ],
        [
            'name' => 'property#show',
            'url' => '/properties/{id}',
            'verb' => 'GET',
        ],
        [
            'name' => 'property#create',
            'url' => '/properties',
            'verb' => 'POST',
        ],
        [
            'name' => 'property#update',
            'url' => '/properties/{id}',
            'verb' => 'PUT',
        ],
        [
            'name' => 'property#destroy',
            'url' => '/properties/{id}',
            'verb' => 'DELETE',
        ],
        // ... weitere Routen analog für Units, Partners, Tenancies, etc.
    ],
];
```

---


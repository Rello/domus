<!--
SPDX-FileCopyrightText: 2025 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Technical Guidelines

## Backend

You write PHP code according to Nextcloud standards. You use Nextcloud’s backend instead of custom solutions. You use OCP\IL10N for all visible strings. You register the app via Application.php using IBootstrap. app.php is not used. Controllers use attributes like #[NoAdminRequired] or #[NoCSRFRequired] from OCP\AppFramework\Http\Attribute. The app only needs to be compatible with the current Nextcloud version 32. You do not use autoloading, as this is handled by Nextcloud. Database tables are created using migrations. database.xml is not used. You register navigation in info.xml. You register all routes in appinfo/routes.php. Use table names with a maximum of 23 characters to ensure compatibility with all database types. The full CRUD data flow is implemented from endpoint to controller, service, entity, and mapper. You use lowerCamelCase and no underscores. In entities, no getters or setters are created for attributes, as these are generated automatically. Entities implement jsonSerialize.

## Frontend

You use Vanilla JS. You follow Nextcloud guidelines. You do not use webpack. You write ES6. You structure your code using the module pattern and namespaces with submodules. You fetch content via AJAX and render it on the client. You use your own controller endpoints without OCS. You use Nextcloud’s t() API for all visible strings. You do not create language files. All AJAX requests must send the headers “‘OCS-APIREQUEST’: ‘true’” and “‘requesttoken’: OC.requestToken”. You do not use external Composer packages. The DOM hierarchy of the main page consists of 3 DIVs with the IDs app-navigation, app-content, and app-sidebar. Navigation items are displayed in  lists under app-navigation. You use lowerCamelCase and no underscores.

## Shared behavior

- Keep tenancy calendar proration in `Accounting/TenancyPeriod`, financial formulas and column definitions
  together in `Accounting/StatisticCalculations`, and date, amount, and period validation in
  `Service/InputValidation`. Screens and reports select their scope and period;
  they reuse these calculations. Keep each formula inline with its descriptive
  column key and label; overview and dashboard calculations reuse these definitions.
- Use `TenancyService` to classify and enrich current, future, and historical
  tenancies. Load collections once and group them by unit before rendering lists.
- Controllers let `ApiErrorMiddleware` map expected exceptions to the common JSON
  error contract. Use `ResourceNotFoundException` for missing records,
  `InvalidArgumentException` for invalid input, `DomainException` for denied access,
  and `ConflictException` for state conflicts. Unexpected failures are logged and
  return a generic server error. Renter/Team response wrappers use the same mapper.
- Reuse typed KPI definitions and the entity image editor in `Domus.UI`; keep
  contact actions in `Domus.Partners`. Add feature-specific values and actions at
  the call site without copying the shared markup and behavior.
- Start top-level rendering with `Domus.Router.beginView()` and check its
  `isCurrent()` guard before applying asynchronous results or errors. Register
  chart/event cleanup with `Domus.UI.onContentDispose()`. For an in-place refresh,
  use `beginView({preserveContent: true})` and call `commit()` before building the
  successful replacement; a failed refresh retains working content. Embedded
  loaders use `captureView(requestKey)` with a stable content-slot key so reopening
  the same section invalidates its older requests.
- Keep view coordinators short by separating data loading, display preparation,
  section rendering, and event binding within the existing feature modules.

## Admin audit logging

`AuditService` emits Nextcloud `CriticalActionPerformedEvent` events, following
Analytics. Administrators must enable/configure Nextcloud's `admin_audit` app to
retain them. Audit messages use stable English event names and are not UI strings.

The audit scope is deliberately limited to:
- Personal-to-Team unit moves: started, completed, failed attempts, cancelled.
- Partner Nextcloud account links, replacements and unlinks, including account deletion cleanup.
- Tenancy partner assignments and unit changes.
- Successfully prepared unit dataset exports and committed imports.
- Property, unit, tenancy and partner deletions, including deletion of a user's Personal records.

Record actor UID, entity ID, owner UID and Personal/Team scope. Include source and
destination identifiers for access changes and transfers. Deletion events include
available dependency counts; cascaded unit/tenancy deletions have their own events.
Never include document contents, financial values, contact details or secrets.
Export means the dataset was prepared; it does not confirm client receipt.

Emit after successful writes and outside transaction rollback handlers. Nested
partner creation and account cleanup defer their events until the outer commit.
Unchanged account/tenancy assignments and repeated completed/cancelled move
requests produce no new success events. Each failed move attempt is recorded;
copy progress and previews are not. Audit delivery failures are reported to the
application logger without making committed operations appear to have failed.

Year closing/reopening, booking changes, document attachments and correction
request decisions belong in a future Activities implementation, not this audit
log. Do not extend the audit allowlist for ordinary business activity.

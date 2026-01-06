# Agent Instructions

This repository is a Nextcloud app; follow the existing design documents when making changes.

## Documentation to read first
- `01_TechnicalGuidelines.md` contains the authoritative coding standards for backend (PHP) and frontend (vanilla JS) changes. Follow its Nextcloud-specific rules (e.g., controller attributes, `t()` localization, AJAX headers, module/namespace pattern) whenever you touch code.

## General conventions
- Prefer lowerCamelCase naming and avoid underscores to stay consistent with the documented standards.
- Use `OCP\IL10N`/`t()` for any user-facing strings; do not introduce separate language files unless advised otherwise.
- Add now strings to the existing language files.
- Keep the main layout structure (`app-navigation`, `app-content`, `app-sidebar`) intact unless a design document explicitly says otherwise.
- Avoid adding build tooling (e.g., webpack) or external Composer dependencies; stick to vanilla JS and Nextcloud-provided services.

## Testing and validation
- There are no automated tests configured; manually verify affected UI or endpoints as appropriate and describe what you checked in your summary.
- If you add migrations or routes, double-check that they comply with the Nextcloud constraints in the technical guidelines (route registration in `appinfo/routes.php`, table names <= 23 characters, etc.).

## Pull requests
- Summaries should highlight the key behavioral or documentation changes and the manual checks performed.

## Frontend notes for agents
- The frontend is loaded via multiple `Util::addScript` calls in `templates/main.php`. Load order matters because modules attach to `window.Domus`.
- Avoid introducing build tooling when modularizing the frontend; keep using plain, Nextcloud-loaded scripts.

## Frontend file scope (post-split)
- `js/domusCoreBundle.js`: shared state plus `Domus.Utils`, `Domus.Events`, `Domus.Api`, UI helpers, router/navigation, role/permission logic, and app bootstrap.
- `js/domusAccounts.js`: account data parsing and account tree UI helpers.
- `js/domusDistributions.js`: distribution CRUD, allocation UI, summary views, and report rendering/export flows.
- `js/domusTasks.js`: tasks list, task detail, task step interactions, and task template management.
- `js/domusDashboard.js`: dashboard tiles, charts, and summary widgets.
- `js/domusAnalytics.js`: analytics view rendering and chart setup.
- `js/domusProperties.js`: properties list, detail, and form handling.
- `js/domusUnits.js`: unit list/detail views, unit forms, related tables, and settlement calculations/report UI.
- `js/domusPartners.js`: partner list, forms, contact rendering, and partner relation flows.
- `js/domusTenancies.js`: tenancy list/detail views and form handling.
- `js/domusBookings.js`: bookings list, booking forms, and ledger tables.
- `js/domusSettings.js`: settings view and form submission logic.
- `js/domusDocuments.js`: document upload/link flows and attachment lists.

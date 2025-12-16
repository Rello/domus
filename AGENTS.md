# Agent Instructions

This repository is a Nextcloud app; follow the existing design documents when making changes.

## Documentation to read first
- `01_TechnicalGuidelines.md` contains the authoritative coding standards for backend (PHP) and frontend (vanilla JS) changes. Follow its Nextcloud-specific rules (e.g., controller attributes, `t()` localization, AJAX headers, module/namespace pattern) whenever you touch code.

## General conventions
- Prefer lowerCamelCase naming and avoid underscores to stay consistent with the documented standards.
- Use `OCP\IL10N`/`t()` for any user-facing strings; do not introduce separate language files unless advised otherwise.
- Keep the main layout structure (`app-navigation`, `app-content`, `app-sidebar`) intact unless a design document explicitly says otherwise.
- Avoid adding build tooling (e.g., webpack) or external Composer dependencies; stick to vanilla JS and Nextcloud-provided services.

## Testing and validation
- There are no automated tests configured; manually verify affected UI or endpoints as appropriate and describe what you checked in your summary.
- If you add migrations or routes, double-check that they comply with the Nextcloud constraints in the technical guidelines (route registration in `appinfo/routes.php`, table names <= 23 characters, etc.).

## Pull requests
- Summaries should highlight the key behavioral or documentation changes and the manual checks performed.

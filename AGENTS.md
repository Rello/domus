# Project Agent Guide

Guidance for Codex and other agents working in this Nextcloud app. Follow the repository design documents and keep changes aligned with the existing architecture.

## Project structure and protected content

- Focus on the core application logic and relevant documentation.
- Do not modify `/vendor` (external dependencies), `/l10n` (translation files), `/js/3rdParty`, or `/css/3rdParty` unless the task specifically requires it.
- Treat `/screenshots` as documentation media and `/sample_data` as human reference data. Do not change these as part of unrelated work.
- Preserve external dependencies and generated or imported content. Use existing tests in `/tests` where they cover the change.
- The frontend is loaded through multiple `Util::addScript` calls in `templates/main.php`; load order matters because modules attach to `window.Domus`.

## General development guidelines

- Prefer lowerCamelCase names and avoid underscores, consistent with the technical guidelines.
- Use `OCP\IL10N` in PHP and Nextcloud's `t()` API in JavaScript for user-facing strings. Follow the repository's existing localization approach; add strings to the existing language files where required.
- Keep the main page layout containers `app-navigation`, `app-content`, and `app-sidebar` intact unless a design document explicitly calls for a change.
- Use Nextcloud-provided services and APIs. Do not add external Composer dependencies or frontend build tooling such as webpack without an explicit architectural decision.
- Do not use the deprecated `ILogger`; use `Psr\Log\LoggerInterface`.
- Keep changes focused and preserve unrelated working-tree edits.

## Database migrations

- When changing a column type in a database migration, pass a Doctrine `Type` object, for example `Type::getType(Types::TEXT)`, to `changeColumn()` or `setType()`. Passing a string such as `'text'` can cause a `TypeError` with the bundled Doctrine DBAL version.

## Changelog

- For every user-facing change, add a meaningful one-line entry to the corresponding `Added`, `Changed`, or `Fixed` section in `CHANGELOG.md`.
- Technical fixes that do not change user-facing behavior, such as correcting a migration's Doctrine type argument, do not require a changelog entry.
- Add only one changelog entry per feature or fix. When work on the same change is iterated within a chat, update the existing entry as needed instead of adding another line.
- Do not add entries to a closed milestone which has a date. If no open milestone exists, add a new section to the changelog.

## GitHub issues

When fixing a GitHub issue, add the `pending release` label and comment on the issue with a link to the pushed commit.

## License headers

Every new file must start with an SPDX header. Set the copyright year to the year the file is created and use the comment syntax appropriate to the file type. For files that cannot contain a header, such as SVG images, add the file to `REUSE.toml`.

```text
SPDX-FileCopyrightText: <YEAR> Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
```

## Testing and validation

- Test execution instructions are maintained in `tests/INSTRUCTIONS.md`.
- Prefer the reusable wrappers `tests/run-unit.sh` and `tests/run-playwright.sh` over ad hoc container commands.
- In summaries, distinguish checks that passed from checks that were not run.

## Frontend conventions

- Use plain ES6 JavaScript; this app does not use Node.js/Vue components or a frontend build pipeline.
- Follow the module pattern and the `window.Domus` namespace. Preserve script loading order in `templates/main.php`.
- Use the existing module files and responsibilities below when deciding where frontend changes belong. Avoid creating new bundles or duplicating shared behavior.

### Frontend file scope

- `js/domusCoreBundle.js`: shared state, `Domus.Utils`, `Domus.Events`, `Domus.Api`, UI helpers, router/navigation, role and permission logic, and app bootstrap.
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

## Pull requests

Summaries should describe the key behavioral or documentation changes and the manual checks performed.

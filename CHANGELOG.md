<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

## 1.1.0 - 2026-09-29
### Added
- Search contacts by name, contact details, address, and notes, with a combinable type filter.
- Complete eligible process steps early or cancel an open process, with clear handling of skipped work.

### Changed
- Refresh the dashboard, unit and tenancy views with clearer navigation, actions, financial context, and mobile layouts.
- Make task and process creation and progress easier to follow, including step previews, due dates, and completion actions.
- Expand booking search and filters, and improve analytics with annual breakdowns, trend presets, and account selection.
- Simplify document access and forms, and clarify contact controls and linked contacts.
- Refresh German translations, welcome screenshots, and the README and app description.

### Fixed
- Preserve unsaved form input, booking filters, and the selected unit finance year during navigation and editing.
- Restore activity links, process templates, and permissions in unit exports and imports.
- Correct task urgency displays, contact filtering, document layout, and task template loading.
- Improve table and form accessibility, including keyboard access and linked dashboard tiles.

## 1.0.2 - 2026-09-23
### Fixed
- Prorate rent and service-charge totals by calendar days for partial months.
- Exclude future tenancies and unrelated bookings from landlord dashboard totals; keep empty unit scopes empty.
- Batch tenancy partner and unit lookups in groups of up to 500 IDs.
- Include linked document files in user migration archives and remap imported links to new file IDs. Files are restored into a separate Domus import folder. Older archives containing document links without file contents must be exported again.

## 1.0.1 - 2026-05-10
### Fixed
- Translation issues
- Document upload

## 1.0.0 - 2026-04-19
### Added
- Initial version of DomusNC

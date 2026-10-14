<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

## Unreleased
### Added
- Show Teams, Team Folders, and Guests availability in Management Team settings with green checks or red X indicators and links to enabled apps or their App Store pages.
- Link a Nextcloud account or create a guest from Team contact details; linked accounts can access that contact and its tenancies.
- Open a dedicated account-based renter view with tenancy details and authenticated downloads of directly linked tenancy documents.
- Request contact corrections as a renter for management review, with conflict detection and decisions recorded in the standard Activity panels on renter and partner details.
- Preview a renter’s tenancies, contact details, and linked documents with a temporary renter selector and read-only tenancy view.
- Assign an existing unit document to a tenancy from the document editor without uploading it again.
### Changed
- Reuse Team membership and tax settings within each request and load invariant tax rates once for financial summaries.
- Show renter access as a status badge in contact headers, with account management links and a structured account setup dialog.
- Reduce settings section padding, spacing, and heading size, and keep the task template add control from increasing the section height.
- Move the Personal/Team selector beside the app name in the Nextcloud header; open Nextcloud Teams management from Admin settings.
- Show each tenancy’s base rent and rent per square meter in the tenancy list and tenancy detail.
- Use the compact unit-style header and matching back-link spacing across property, unit, tenancy, and contact details; show only the unit name as the tenancy headline.
### Fixed
- Restrict Personal migration archives to canonical fields and Personal ownership, and clear source-instance image references.
- Restore authenticated browser image and document delivery with explicit MIME types, safe image rendering, and consistent document downloads.
- Include the standard property-tax account in utility settlements, matching financial statistics.
- Complete German translations for account access, renter views, financial explanations, reports, and errors, and correct shared dialog wording.
- Clear stale contact account links when the linked Nextcloud account no longer exists, allowing renter access to be set up again.
- Translate the unit cost table’s utility, allocable maintenance, property tax, and tenant balance headers into German.
- Use the same calendar-day proration for annual rent statistics and utility settlements, including mid-month tenancy changes.
- Keep distribution reports consistent with posted amounts and rounding, allocating only represented shares when an explicit base includes other units.
- Keep future tenancies separate from current occupants and monthly rent totals.
- Reject impossible dates, invalid amounts, and reversed financial periods consistently.
- Prevent delayed page responses from replacing the current view and dispose charts when leaving a view.
- Protect unsaved picture changes consistently for properties and units.
- Return consistent API errors and log unexpected failures instead of reporting them as missing records.

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

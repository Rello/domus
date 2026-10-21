<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

## Unreleased

### Added
- Indicate tenancy-assigned documents with an icon in unit document lists.
- Personal and Team DOCX templates for editable utility reports, with a Markdown fallback.
- Read-only unit and annual revenue APIs with Personal/Team selection and OpenAPI documentation.
- Multi-year portfolio analytics for rent, profit, profitability, and acquisition costs.
- Document dates and assignments to multiple tenancies.

### Changed
- Consistent dialog headers, spacing, and persistent action footers, including the welcome wizard.
- Record activities directly from unit details.
- Simplify document editing, previews, storage, and links to bookings and tenancies.
- Improve utility settlement selection, expense allocation, and financial previews.
- Add account checks and booking review before closing a financial year.
- Improve tenancy checklists, period ordering, and booking descriptions.

### Fixed
- Use reminder dates as deadlines and keep deferred tasks and steps visible.
- Preserve booking and document edits across retries and nested dialogs without duplicates.
- Keep closed-year bookings and document links read-only.
- Prevent duplicate document assignments and clean up links when unlinking documents.
- Restore booking deletion, description clearing, and selected-year booking dates.
- Fix dashboard resizing and open document pickers in the selected unit's folder.

## 1.2.0 - 2026-10-18
### Added
- Create reminders for rent reviews, tasks, and process steps.
- Give renters access to their tenancy details and documents through a linked Nextcloud or guest account, with contact correction requests and a preview of their access.
- Link existing unit documents to a tenancy without uploading them again.

### Changed
- Make renter access easier to manage from contact details.
- Move the Personal/Team selector to the app header.
- Show base rent and rent per square meter in tenancy lists and details, including the renter overview.
- Make property, unit, tenancy, and contact pages more consistent and show the unit address in tenancy headers.

### Fixed
- Fix creating and saving task templates and adding template steps.
- Fix image display and document downloads, including renter access to tenancy documents.
- Keep large numbers readable in dashboard tiles.
- Include property tax in utility settlements and match distribution reports to booked amounts and rounding.
- Calculate rent correctly for partial months and exclude future tenancies from current occupants and monthly rent totals.
- Allow renter access to be set up again after a linked account is deleted.
- Reject invalid dates, amounts, and financial periods.
- Prevent outdated page content from appearing after navigation.
- Warn before discarding unsaved property or unit pictures.
- Improve German translations and dialog wording.

## 1.1.0 - 2026-09-29
### Added
- Search contacts by name, contact details, address, or notes and filter by type.
- Complete process steps early or cancel an open process.

### Changed
- Improve navigation and mobile layouts across the dashboard, units, and tenancies.
- Make tasks and processes easier to create and track.
- Add booking filters and more ways to explore financial trends.
- Simplify document access, forms, and contact management.
- Improve German translations and help content.

### Fixed
- Preserve unsaved input, booking filters, and the selected financial year.
- Fix activity links, process templates, and unit imports and exports.
- Correct task priorities, contact filters, and document layouts.
- Improve keyboard navigation and accessibility.

## 1.0.2 - 2026-09-23
### Fixed
- Calculate rent and service charges by calendar days for partial months.
- Exclude future tenancies and unrelated bookings from dashboard totals.
- Include document files in exports and restore them to a separate Domus import folder. Export older archives again to include their files.

## 1.0.1 - 2026-05-10
### Fixed
- Fix translations and document uploads.

## 1.0.0 - 2026-04-19
### Added
- Initial release of DomusNC.

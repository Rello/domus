<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

## Unreleased
### Added
- Create rules that remind you when rent is due for review, listed in Settings with the same table and action icons as task templates.
- Set reminders for tasks and process steps.
- Check which Nextcloud apps are available for team management.
- Give renters access through a linked Nextcloud account or a guest account.
- Let renters view their tenancy details and documents and request contact corrections.
- Preview what renters can see from Settings → Management Team.
- Link existing unit documents to a tenancy without uploading them again.

### Changed
- Use direct page URLs without fragments and keep data endpoints under /api/.
- Show the unit address instead of repeating the tenant in tenancy headers.
- Use the shared tenancy table with base rent in the renter overview and remove the redundant header and refresh button.
- Make renter access easier to manage from contact details.
- Move the Personal/Team selector to the app header.
- Show base rent and rent per square meter in tenancy lists and details.
- Make property, unit, tenancy, and contact pages more consistent.

### Fixed
- Fix creating task templates with new identifiers, saving them in Personal mode, and adding steps with a visible plus button in the template editor.
- Show calculated rent per square meter in renter tenancy details.
- Use the same document panel in renter and management tenancy views, keeping renter download links.
- Keep large numbers readable in dashboard tiles.
- Fix image display and document downloads.
- Include property tax in utility settlements.
- Improve German translations and dialog wording.
- Allow renter access to be set up again after a linked account is deleted.
- Calculate rent correctly for tenancies that start or end partway through a month.
- Match distribution reports to booked amounts and rounding.
- Exclude future tenancies from current occupants and monthly rent totals.
- Reject invalid dates, amounts, and financial periods.
- Prevent outdated page content from appearing after navigation.
- Warn before discarding unsaved property or unit pictures.

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

<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

## 1.3.0 - 2026-11-12

### Added
- Rent-increase calculator with rent-index ranges, configurable increase limits, service-charge recommendations, and dated tenancy changes; generate letters from Personal or Team Word templates or a German Markdown fallback.
- Move Personal units to Teams with folders, documents, images, tasks, and processes, including conflict previews, interruption recovery, and optional cleanup of unavailable attachments while retaining original files.
- Shared system process templates with Personal and Team customization, reset and disable options, and preserved process schedules.
- Multi-year portfolio analytics for rent, profit, profitability, and acquisition costs, with account filters and year/unit details including booking counts and zero-net activity.
- Optional AI previews for annual-statement PDFs, with unit matching, confidence indicators, source pages, and editable booking suggestions dated at year-end.
- Tax declaration report in WISO Steuer layout (beta), with itemized costs, subtotals, and year-closing badges.
- Editable utility reports from Personal and Team DOCX templates, with a Markdown fallback.
- Read-only unit and annual revenue APIs with OpenAPI documentation.
- Nextcloud dashboard task widget with unit names and coloured icons for overdue, today, and upcoming tasks.
- Nextcloud admin audit logging for unit moves, renter access, tenancy relationships, imports, exports, and portfolio deletions.
- Document dates, multiple tenancy assignments, assignment indicators, and linked PDF previews with download and Open in Nextcloud actions.
- Optional construction year and separate multiline unit notes, preserved on import/export; construction year is also available through the read-only API.
- Service charges alongside base rent in tenancy lists.

### Changed
- Separate direct tenancy corrections from dated condition changes and clarify tenancy continuations; prefill new tenants’ editable addresses from the selected unit.
- Offer to delete a renter together with their only tenancy, or remove contacts left without relations after tenancy deletion, with confirmation and retention of linked Nextcloud accounts.
- Move bookings from account 2700 to 2300 while preserving documents and activities, then remove account 2700; remove legacy account 2200 and its bookings.
- Allow unit JSON imports and demo content creation in the selected Team portfolio.
- Review account totals and bookings before closing a financial year; improve utility settlements, tenancy checklists, period selection, and booking descriptions.
- Simplify document editing, storage, and booking/tenancy links; record activities directly from unit details.
- Use consistent dialog headers and persistent action footers, clearer header actions, more accessible completion indicators, and compact empty document panels.
- Move the tax rate setting into Tax declaration and combine Nextcloud integration checks with AI document-validation settings.
- Refresh the feature overview, app introduction, and welcome tour, with detailed guides in the wiki.

### Fixed
- Preserve custom accounts, process templates, and existing schedules when upgrading from 1.2.0, and isolate Personal custom accounts per user while protecting system accounts.
- Store new and imported Team units’ documents inside the assigned Team folder; resolve dedicated Team folders on Nextcloud 34 and open document/template pickers in the appropriate folders.
- Keep saves and uploads in the browser tab’s Personal or Team context when another tab switches Teams.
- Roll back failed tenancy replacements and condition changes completely, and validate storage limits before changing contracts.
- Serialize year closure and reopening, remove legacy duplicate closures, and keep closed-year bookings and document links read-only.
- Delete property financial records and their links atomically, include them in deletion summaries, and prevent account renumbering from changing historical totals.
- Clear incompatible allocations when switching draft bookings between units and distribution keys, and reject invalid allocation combinations.
- Preserve booking and document edits across retries and nested dialogs, prevent duplicate document assignments, and clean up links when unlinking documents.
- Restore booking deletion, description clearing, and selected-year booking dates.
- Preserve early process completion on unit import, use reminder dates as deadlines, and keep deferred tasks visible.
- Clean up deleted users’ Personal portfolios and move journals while preserving Team history and continuing Team rules through an authorized member.
- Keep dialogs open when text selection ends outside them, confirm before discarding edited rent calculations, and display Word template validation errors on Nextcloud 34.
- Improve accessible field labels, date/year-status names, action disclosure semantics, and keyboard focus return.
- Fix dashboard resizing and reduce dashboard queries for open process steps; remove unused Viewer loading and a missing source-map reference.
- Correct German integration wording, translate account-access errors, and remove duplicate translation entries.

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

<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Changelog

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

<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Updating bundled process templates

For a release that changes bundled defaults:

1. Add a new migration with a guarded data update in `postSchemaChange`. Keep released migrations unchanged; Nextcloud records which versions have already run.
2. Match the bundled template key and its previous step definitions before updating. If users changed descriptions, actions, timing, or steps, preserve their template and let them opt in through Settings.
3. Update `FillDefaultAccountsRepairStep` so fresh installations receive the same defaults. This install repair step does not update existing populated installations.
4. Bump `appinfo/info.xml` to the new app version so Nextcloud detects an upgrade and runs pending migrations before serving the new code. Adding a migration file without changing the installed app version does not trigger an upgrade. Test both upgrades and fresh installations.

`Version0003Date20260926000000` adds early-completion fields and enables them from the second reminder in an unchanged Dunning template. The template step editor also exposes the setting. Each new process copies this permission into its own steps; existing processes are deliberately unchanged by template updates.

Confirmed early completion records the user and time on the process, keeps completed step history, and marks remaining work `skipped` (shown as "Not needed"). Reopening the first skipped step restores pending work and clears the early-completion outcome. This operation is separate from cancellation/deletion.

See [Nextcloud migration guidance](https://docs.nextcloud.com/server/latest/developer_manual/basics/storage/migrations.html).

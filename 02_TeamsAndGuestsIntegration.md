<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Teams and Guests integration

Current management Team contract and API research, verified against the local Nextcloud instances on 2026-09-30. Domus uses public Nextcloud APIs and has no Circles-internal dependency.

## Data context and temporary access policy

A nullable `team_id` on business records identifies Team-owned data. Personal records have `team_id IS NULL` and belong to the authenticated user. The compact selector switches between Personal and any Nextcloud Team returned for the user by the public Teams API. Existing records stay Personal; newly created records inherit the selected context. There is no conversion workflow or separate portfolio object.

**Temporary policy:** every accepted staff member of a selected Team has Domus Admin permissions. This includes effective membership returned by Nextcloud, regardless of the Team's real role. The check is scoped to the exact Team ID on the server. A Nextcloud account with no membership in that Team has no Team context access. Renters remain outside management Teams. Assigning their Nextcloud user ID to a tenant partner gives access to that contact and all its linked tenancies. An account can be linked to contacts in several Teams.

The public Teams interface provides no role or local/federated identity metadata. Domus therefore uses the public effective membership result as the authority; it does not parse Circles tables, infer role from names, or use Circles app classes. Local-only federation policy cannot be established from this interface alone. If that becomes a requirement, it needs a supported upstream public capability or a separate product decision. Do not assume a public role or locality method exists. Team Admin role-specific behavior can replace the temporary rule after upstream support is verified. [Public Teams API][teams-api]

The initial recommended integration baseline is **Nextcloud 35** with enabled Teams (Circles). Guests and Groupfolders are relevant only to later renter and folder work. The installed combination is Server 35.0.0.10, Circles 35.0.0, Guests 4.10.0, and Groupfolders 23.0.1. Check methods and provider presence at runtime. `appinfo/info.xml` still advertises NC31–99 for the existing app; adjust that compatibility claim when the Teams minimum is finalized, without breaking older single-user deployments during this foundation stage.

| Public capability | NC31–32 | NC33 | NC34 | NC35 |
| --- | --- | --- | --- | --- |
| `getTeamsForUser` | absent | present | present | present |
| `getMembersOfTeam` | absent | absent | present | present |
| `hasTeamSupport` | absent | absent | present | present |
| `getTeam` | absent | absent | absent | present |
| `getTeamFolderProvider` | absent | absent | absent | present |
| Team member roles | absent | absent | absent | absent |

This matrix comes from the official [NC31][nc31], [NC32][nc32], [NC33][nc33], [NC34][nc34] and [NC35][teams-api] public interfaces, plus the installed NC34/35 interfaces. The live NC35 Teams backend resolved and `getTeamFolderProvider()` returned a Groupfolders provider. NC34 lacks Guests and Groupfolders, and its `occ status` reported an app/database upgrade pending. No upgrade was performed.

`getMembersOfTeam()` gives user ID to display-name mappings, without roles or identity type. Use `getTeamsForUser()` on the actor to authorize access. `getTeam($teamId, $actorUid)` can show a known Team, but it must not replace the membership check. A missing Team, disabled backend or unsupported API must deny management access and preserve records. Recheck membership for protected requests and changes; client Team IDs and role headers are untrusted.

The public `ITeamFolderProvider` supports `getTeamFolder`, link, create, quota update, unlink and remove operations. A folder ID is distinct from the Team ID. The provider does not take the acting user, so Domus must enforce permission before any call. Native Team-folder operations have their own Nextcloud authorization rules and should use supported Nextcloud flows. No folder or guest account was created during this verification. [Team folder API][folder-api]

## Guests provisioning and renter access

The installed Guests app provides the authenticated public OCS route **PUT `/ocs/v2.php/apps/guests/api/v1/users`**. Supply `email`, `displayName`, `language`, `groups: []` and `sendInvite: true`. Use same-origin credentials and headers `OCS-APIRequest: true`, `requesttoken: OC.requestToken`, `Content-Type: application/json`, and `Accept: application/json`. Parse the OCS response and retain `ocs.data.username` as the canonical Nextcloud UID. Never derive it from the email: the installed app currently hashes lowercased emails when `hash_user_ids` is enabled. [Guests route][guests-routes], [Guests creation][guests-users], [OCS guidance][ocs-docs]

Guest creation eligibility is separate from Domus Team membership. The installed Guests endpoint checks its configured inviter groups and the global group-sharing restriction; nonempty requested groups require Nextcloud admin/sub-admin rights over them. The agreed non-admin path uses `groups: []`, an eligible inviter, and `core.shareapi_only_share_with_group_members = false`. A guest may not invite another guest. The current NC35 configuration satisfies the global restriction requirement and has an empty inviter-group restriction. If the required settings or apps are missing, disable this path with an actionable message. Domus must authorize its own Team and tenancy links on the server; Guests OCS does not know Domus contact links.

A successful 201 response creates an account and reports its UID. `sendInvite: true` asks Guests to send its own activation email; Domus does not send a separate invitation or track acceptance. Existing email and UID conflicts return validation errors rather than a reusable UID. Domus looks up existing accounts through `IUserManager::getByEmail()` before creation and stores the canonical UID on the partner. No repeat-create resend flow is available through this endpoint. [Guests creation][guests-users]

NC35 guest hiding and allowlist enforcement are active. The user added `domus` to the effective allowlist, which was verified live. The installed list is `files_trashbin,files_versions,files_texteditor,notifications,domus`. `hide_users = true`; `usewhitelist = true`; guest quota is `0 B`. The global group-sharing restriction is disabled. Excluding the virtual Guests group (`guest_app`) from outbound sharing is a separate administrator setting and is currently disabled. These settings do not replace Domus server-side data filtering. Document links require actual authorized file access; allowlist entries for `viewer` and `files_pdfviewer` and live previews still need validation before offering those viewers to renters.

Reuse `tenancyDetail` for the renter experience. Return only the linked tenancy's permitted facts, the account's own contact details and correction requests, and documents linked directly to that tenancy. The user deferred document release on 2026-10-03; a tenancy link currently makes a document visible to all its linked renter accounts. Unit/property-only attachments stay internal. Hide internal notes, unrelated renters, owner finances and management actions. A file URL, account identity or frontend role flag never grants access by itself.

## Current boundary

The selected context is stored as a user preference. Every management request rechecks effective Team membership. Missing or revoked membership denies Team access. Existing personal rows remain personal, while Team rows are scoped by exact `team_id`; their historical `user_id` does not provide personal access. Accounts and task templates created within a Team receive its catalogue scope. Custom Personal accounts use `user:<uid>` and are readable and editable only in that user’s Personal context. Global system accounts remain shared and read-only. Process templates resolve a Personal (`user:<uid>`) or Team override before falling back to shared, read-only `system` definitions. Disabling creates an inactive override; reset archives the override and restores the default. Process steps snapshot due-date offsets so template changes cannot reschedule existing processes. Tax rate is shared for a Team; display preferences remain personal. Document and image access checks the linked record before resolving a file ID.

There is no bulk conversion, migration preview, catalogue clone, Team folder prerequisite, or in-Domus membership administration. Team membership is managed in Nextcloud Teams. The legacy personal unit transfer does not handle Team units. User migration conservatively blocks an actor with Team records so it cannot include those rows by user ID.

## Task 04: partner account assignment

The **Online access** section on Team tenant contact details shows the linked Nextcloud user ID and its current enabled status from `IUser::isEnabled()`. Staff can link an existing user ID or use the contact's saved email. A unique existing account is linked immediately; otherwise the browser calls the standard Guests OCS endpoint with `groups: []` and `sendInvite: true`, then saves its returned UID. Guests owns invitation delivery and activation. Personal management and the temporary owner renter preview are unchanged.

`Partner.ncUserId` is the sole assignment. It gives the signed-in account access to the contact and every linked tenancy, including historical tenancies. Clearing that field removes this contact's access. There is no Domus invitation table, selected-tenancy list, consent token, expiry, validity state, custom email or separate revocation workflow. Account enabled status is informational and read live from Nextcloud. If creation succeeds but linking fails, repeating the email action finds the existing account without tracking recovery state.

Management uses GET/POST `/api/teams/{teamId}/partners/{partnerId}/account`. Submitted Team IDs must match the authorized management context. The server checks Team membership and partner ownership before reading or changing the assignment.

Task 05 can use GET `/api/renter/me`: `{ncUserId, canAccessTenancies, partners, tenancies: [{teamId, id, unitLabel, startDate, endDate}]}`. It ignores Team/role headers, returns only the signed-in user's linked Team tenant contacts and filtered tenancy summaries, and verifies that each relation, tenancy and unit belongs to the same Team. Internal notes and finances are excluded. Task 05 adds full renter pages and reviewed contact corrections. Document release remains deferred.

Migration 0007 removes the unreleased invitation prototype table and indexes the existing partner user-ID column. Unit tests cover immediate assignment, clearing links independently across Teams, historical/newly linked tenancies, directory lookup, guest creation recovery, enabled status and authorization boundaries. Browser fixtures cover linking, standard Guests requests, lost responses, narrow layouts and Personal visibility. Fixtures do not prove email delivery. On local NC35, migration 0007 and live HTTP checks passed for immediate assignment, historical tenancy access, clearing the partner user ID and reusing an existing Guests account (2026-10-01).

## Task 05: renter view and contact corrections

The page bootstrap reads the account's actual renter links. Guests and linked normal accounts enter **My tenancies** without demo creation, management account hierarchy or welcome setup. One tenancy opens directly; several show a list including historical tenancies and distinct Teams. Guest accounts with no links see a clear no-access message. Normal accounts retain their authorized Personal management context and can switch between management and renter views.

The dedicated `/api/renter/teams/{teamId}/tenancies/{tenancyId}` response includes tenancy dates, agreed charges/conditions, limited unit identity, this account's own contacts, directly linked documents, pending correction requests and its correction decision activities. Each detail, document list and download rechecks live partner assignment, relation, tenancy and unit Team ownership. Request Team/role headers do not broaden renter access. The management Team preview uses the same serializer for the selected contact; Personal preview remains a labeled simulation.

**Current document policy:** all documents linked directly to a tenancy are visible to its linked renters. There is no release metadata or release UI. Unit/property-only links do not grant access. Delivery is an authenticated attachment through Domus; payloads omit internal notes, file IDs, paths, management ownership and unrelated `linkedEntities`. The file must remain readable through the linking staff account, and that account must remain enabled and a member of the owning Team. Missing files, removed tenancy links, changed storage permissions and lost membership deny delivery. A moved file remains accessible by its file ID if its mount permits it. No public share or Team-folder grant is created. Native Viewer/image previews remain deferred; these downloads require only Domus in the Guests allowlist.

Renters submit changes to their own name, address, email or phone for management review from **My details**. The owning Team's authorized management reviews original/proposed values on contact detail. Completed decisions appear in the standard Activity module on partner detail and the renter view, including original/proposed values. Only pending requests remain in the review panel. Decision and activity writes share a transaction, and renter activities are restricted to system decisions for requests submitted by the currently linked account; internal notes and other contacts remain private. The database stores requester, timestamps and decision; approval atomically compares the original contact values before applying. Conflicts keep current master data and record the conflict. Clearing or changing the requester account link stops pending requests from being approved. The current effective-member temporary Admin policy remains in force; there is no public upstream role API to infer stricter Team roles from.

Validation on local NC35 (2026-10-03): migration 0008 completed; the backend suite passed with 107 tests and 559 assertions; the full browser fixtures passed, with a focused rerun for inherited contact styles. Separate normal-account live checks passed for account-derived entry, filtered detail, tenancy document download, correction submission/approval, Team management preview and preview download, and immediate detail/list/download denial after unlinking. The browser showed the translated real renter page and the no-access state. Tests used isolated disposable records/account and removed them afterwards. Live guest browser/login and native Viewer/image preview were not tested; Guests creation remains covered by existing fixtures and prior Task 04 validation.

[team]: https://github.com/nextcloud/server/blob/3ef7cefe575a589e98a0e77b45986705c4692417/lib/public/Teams/Team.php
[teams-api]: https://github.com/nextcloud/server/blob/3ef7cefe575a589e98a0e77b45986705c4692417/lib/public/Teams/ITeamManager.php
[folder-api]: https://github.com/nextcloud/server/blob/3ef7cefe575a589e98a0e77b45986705c4692417/lib/public/Teams/ITeamFolderProvider.php
[nc31]: https://github.com/nextcloud/server/blob/stable31/lib/public/Teams/ITeamManager.php
[nc32]: https://github.com/nextcloud/server/blob/stable32/lib/public/Teams/ITeamManager.php
[nc33]: https://github.com/nextcloud/server/blob/stable33/lib/public/Teams/ITeamManager.php
[nc34]: https://github.com/nextcloud/server/blob/stable34/lib/public/Teams/ITeamManager.php
[guests-routes]: https://github.com/nextcloud/guests/blob/69232035e69df6a756d838b00d766cab6ec2fe9f/appinfo/routes.php
[guests-users]: https://github.com/nextcloud/guests/blob/69232035e69df6a756d838b00d766cab6ec2fe9f/lib/Controller/UsersController.php
[ocs-docs]: https://docs.nextcloud.com/server/latest/developer_manual/digging_deeper/rest_apis.html

## System process templates

The unreleased Team setup starts with canonical Year End and Dunning system
process templates seeded by `FillDefaultAccountsRepairStep` on installation and upgrade.
The initializer adds only missing system keys, even when other templates exist. Custom accounts and
templates are created directly in the selected Personal or Team scope. No legacy
catalogue copying, template matching, or process-data conversion is included.
The consolidated migration contains only the required schema additions.

Customize copies the entire definition and all steps into the selected scope. A
system override retains its key; reset restores the current system definition and
active state. Custom templates can be archived. Reset and deletion retain historical
IDs and steps, and running processes use their own copied fields and due offsets.
Personal-to-Team moves preserve the source process definitions as independent Team
copies; imported templates never grant access to another user's catalogue.

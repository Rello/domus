<!--
SPDX-FileCopyrightText: 2026 Marcel Scherello
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Rent-review rules

Maintain rulesets in **Settings → Rulesets** within the selected Personal or Team
context. Each ruleset currently contains one rent-review rule: a threshold of
1–600 calendar months, all units or selected units/properties, an enabled switch,
and an editable warning. Matches create ordinary unit tasks automatically. Property scope evaluates the property's
units; property-level rule types are not part of this version. New units are
included automatically by the all-units and property scopes.

Use **Preview matches** before saving to see overdue units and missing reference
dates without creating alerts or tasks. Only active tenancies with positive base
rent are evaluated. Future, ended and rent-free tenancies are excluded.

Review tasks appear in the existing dashboard attention list and unit task section.
There are no separate alert panels. The configured warning is the task description.
Missing effective dates create a **Check rent history** task. **Set reference date**
is available only on tasks whose effective date could not be determined. Tasks
with known tenancy/rent history do not offer this manual override.

**Remind me later** offers 1, 3, or 6 calendar months, a custom date, or **5 minutes
(test)**. The server stores a reminder timestamp separately from the unchanged
due date (the deadline). Sleeping tasks are excluded from attention and grouped
under **Deferred tasks** on the unit. At expiry a rule task remains hidden until
its rule is checked again: a still-relevant task returns with its original deadline;
a no-longer-relevant task is completed. Completing or deleting a task suppresses
it for that review cycle. Ordinary tasks and open process steps use the same reminder dialog. Deferring
a process step keeps it open without advancing the process; completing or reopening
steps clears their reminder. Process steps store `deferred_until` in `domus_task_steps`.

Existing tenancy periods supply their recorded effective dates automatically.
Where periods are continuous for the same tenant contacts, unchanged or decreased base rent preserves the earlier reference;
a base-rent increase resets it to that period's start. A gap or different tenant
starts a new recorded period. This also applies to historical/imported records
with valid start dates. Explicitly confirmed reference dates take precedence.

The rules module reads existing tenancy dates, rents and tenant relations without
changing the tenancy model, service or records. Confirmed reference overrides
are stored in `domus_rule_context`, keyed by `entity_type = rentReview.tenancy`
and `entity_id`; its JSON `data.referenceDate` contains the confirmed date.
Source-entity access is checked before reading or writing this context.
In-place corrections are interpreted using the recorded effective dates; rules
do not infer an increase date from modification timestamps.
Occurrence identity comes from the earliest period in the unchanged-rent chain
and its reference date.

A database-unique ruleset/review-cycle key and a transaction lock on the ruleset
prevent repeated or concurrent checks from creating duplicate tasks. Each
independent ruleset has its own alert/task cycle. Completing or deleting a task
will not recreate it for the same cycle. An increase, tenancy ending, scope change
or disabled rule completes any open linked task. Deleting a ruleset completes
its open tasks and removes its task links; completed task history remains.

## Execution and storage

- `RuleService` evaluates rules and uses `TaskService` for normal unit tasks.
- `RuleMapper` stores definitions in `domus_rule_sets` and task links in
  `domus_rule_tasks` (`id`, `ruleset_id`, `occurrence_key`, `task_id`). The unique
  ruleset/occurrence pair prevents duplicates even if the task is completed or
  deleted. Link ownership is checked through its parent ruleset. Evaluation
  results, warning messages, dates and status are not persisted in this table.
  The task owns its description, completion status, deadline and reminder.
- `RentReviewEvaluator` uses calendar dates and clamps month ends, including leap
  days. Dates use the server timezone, consistently with existing task scheduling.
- `EvaluateRules` runs every five minutes when Nextcloud background jobs execute.
  Dashboard and task reads also recheck rules before returning tasks. Open views
  refresh at the next reminder time, postponing refresh while a dialog is open.
- Background execution explicitly selects and then restores an ownership context;
  it rechecks that the saved staff account is enabled and remains a Team member.
  For Team rules, saving a rule updates the staff account used by the scheduler.
  If no saved account remains authorized, background evaluation is skipped and
  eligible staff should save a ruleset again. Browser evaluation uses the current
  authorized staff account.
- Scheduling depends on Nextcloud background jobs actually running. This version
  uses in-app tasks, not push/email notifications or automatic process launching.
- Migration `Version0005Date20261016000000` creates the ruleset, rule occurrence,
  and rule context tables, and adds reminder timestamps and task source links.
  It contains the final schema only and does not alter tenancies. The app version
  triggers the normal Nextcloud upgrade. Existing tenancy history is read during
  evaluation; no bulk backfill is needed.

Run the PHP and browser wrappers described in `tests/INSTRUCTIONS.md`. Fixture
coverage is separate from live database concurrency, migration and scheduled-job
validation.

Each ruleset stores an editable `alertWarning` template in its JSON definition. The editor labels this “Alert warning”; `{months}` is replaced with the configured threshold for previews and task descriptions. Existing rulesets use the translated rent-review default until edited. Warning text is displayed as plain text.

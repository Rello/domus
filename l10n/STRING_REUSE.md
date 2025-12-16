# Localization string reuse guidelines

To reduce translation overhead and keep wording consistent across the app, favor composable strings and shared patterns instead of one-off sentences.

## Status and notifications
- Prefer a single pattern with placeholders, e.g. `"{entity} created."`, `"{entity} updated."`, `"{entity} deleted."`.
- Reuse this for Booking, Partner, Property, Tenancy, Unit, Document, etc., rather than having separate strings per entity (e.g. `"Booking deleted."`, `"Partner deleted."`).
- If you need more context, add optional details: `"{entity} created: {name}"`.

## Confirmations
- Standardize on `"Delete {entity}?"` and reuse for bookings, partners, properties, tenancies, and units.
- Similarly, use `"Link {entity}?"` or `"Remove {entity}?"` instead of bespoke phrases.

## Loading states
- Collapse the many `"Loading …"` variants into `"Loading {entity}…"` with the entity inserted (bookings, booking, dashboard, documents, overview, partners, properties, reports, tenancies, units).
- Keep a single fallback `"Loading…"` for contexts where the entity is unknown.

## Empty states and availability
- Use patterns like `"No {entity} found."` and `"No {entity} available."` instead of separate strings for documents, entries, linked objects, properties, statistics, etc.
- For prompts such as file selection, prefer `"No file selected."` and `"No existing file selected."` instead of variations.

## Forms and validation
- Reuse generic validation messages: `"{field} is required."`, `"Enter a valid amount."`, `"Enter at least one amount."` with `{field}` or `{constraint}` placeholders.
- Consolidate labels (e.g. `"Name"`, `"Address"`, `"Amount"`, `"Description"`) so they appear only once in the catalog.

## Actions
- Use single-word verbs for buttons: `"Add"`, `"Edit"`, `"Delete"`, `"Download"`, `"Back"`, `"Close"`, `"Cancel"`.
- For multi-step actions, compose with nouns: `"Add {entity}"`, `"Edit {entity}"`, `"Link {entity}"`.

## Naming
- Keep product-specific terminology (e.g., "Tenancy", "Settlement") as shared nouns that can be combined with the above patterns.

## Notes on German translations
- The existing German strings (see `l10n/de.js` and `l10n/de.json`) already align with these patterns; moving to placeholder-based English sources would let the German catalog reuse translations like `"{entity} gelöscht."` and `"Lade {entity}…"` across the app.

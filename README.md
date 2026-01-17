# domus

Domus is a full property operations workspace built directly into Nextcloud. Manage portfolios, units, and tenancies alongside tasks, documents, bookings, and distributions in one secure place so property teams stay aligned without leaving their cloud.

## Highlights
- Organize properties, units, and partners with structured records that stay linked.
- Track tenancies, bookings, and allocations while keeping financial context close by.
- Coordinate tasks, documents, and workflows from a single Nextcloud app.

Built for teams who want the clarity of purpose-built property management without giving up the privacy and convenience of Nextcloud.

## Modules
- Dashboard: at-a-glance portfolio summaries and activity signals.
- Properties & Units: structured asset, unit, and availability records.
- Tenancies & Bookings: tenancy history, booking flows, and occupancy context.
- Partners & Contacts: owners, service providers, and stakeholder data.
- Tasks: assignments, checklists, and operational follow-ups.
- Documents: uploads, attachments, and linked files.
- Distributions & Ledger: allocations, reports, and ledger-facing views.
- Analytics & Reports: insights across occupancy, performance, and financials.
- Settings: configuration and reference data.

## Modal table layout
Use the shared modal helpers to keep dialogs compact and consistent:

```js
const rows = [
    Domus.UI.buildFormRow({
        label: t('domus', 'Name'),
        required: true,
        content: '<input name="name" required>'
    }),
    Domus.UI.buildFormRow({
        label: t('domus', 'Notes'),
        content: '<textarea name="notes"></textarea>'
    })
];

const modal = Domus.UI.openModal({
    title: t('domus', 'Example'),
    content: '<div class="domus-form"><form>' + Domus.UI.buildFormTable(rows) + '</form></div>'
});
```

The two-column `domus-form-table` layout automatically stacks on mobile and uses `domus-form-value-text` for read-only rows.

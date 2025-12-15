# domus
Domus - Property Management in Nextcloud

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

(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Distributions = (function() {
        const typeOptions = [
            { value: 'area', label: t('domus', 'Area'), systemDefault: true },
            { value: 'mea', label: t('domus', 'MEA') },
            { value: 'unit', label: t('domus', 'Unit'), systemDefault: true },
            { value: 'persons', label: t('domus', 'Persons') },
            { value: 'consumption', label: t('domus', 'Consumption') },
            { value: 'mixed', label: t('domus', 'Mixed') },
            { value: 'manual', label: t('domus', 'Manual') }
        ];
        const baseTypes = ['mea', 'unit', 'area'];
        const systemDefaultTypes = typeOptions.filter(opt => opt.systemDefault).map(opt => opt.value);

        function canManageDistributions() {
            return Domus.Role.isBuildingMgmtView();
        }

        function loadForProperty(propertyId, options = {}) {
            return Domus.Api.getDistributions(propertyId, options);
        }

        function loadForUnit(unitId) {
            return Domus.Api.getUnitDistributions(unitId);
        }

        function getTypeLabel(type) {
            const normalized = (type || '').toString().toLowerCase();
            const match = typeOptions.find(opt => opt.value === normalized);
            return match ? match.label : type;
        }

        function isBaseType(type) {
            return baseTypes.includes((type || '').toString().toLowerCase());
        }

        function parseBaseConfig(configJson) {
            if (!configJson) {
                return '';
            }
            try {
                const parsed = JSON.parse(configJson);
                if (parsed && parsed.base !== undefined && parsed.base !== null && parsed.base !== '') {
                    return parsed.base;
                }
            } catch (e) {
                return '';
            }
            return '';
        }

        function buildBaseConfig(baseValue) {
            if (baseValue === undefined || baseValue === null || baseValue === '') {
                return '';
            }
            const parsed = parseFloat(baseValue);
            if (Number.isNaN(parsed) || parsed <= 0) {
                return '';
            }
            return JSON.stringify({ base: parsed });
        }

        function toggleConfigFields(form, type) {
            const normalized = (type || '').toString().toLowerCase();
            const needsBase = isBaseType(normalized);
            const needsConfig = normalized === 'mixed';
            const baseRow = form.querySelector('.domus-distribution-base-row');
            const configRow = form.querySelector('.domus-distribution-config-row');
            const baseInput = form.querySelector('input[name="baseValue"]');
            const configInput = form.querySelector('textarea[name="configJson"]');

            if (baseRow) {
                baseRow.style.display = needsBase ? '' : 'none';
            }
            if (configRow) {
                configRow.style.display = needsConfig ? '' : 'none';
            }
            if (baseInput) {
                baseInput.required = needsBase;
                baseInput.disabled = !needsBase;
            }
            if (configInput) {
                configInput.required = needsConfig;
                configInput.disabled = !needsConfig;
            }
        }

        function resolveConfigPayload(type, form) {
            const normalized = (type || '').toString().toLowerCase();
            if (isBaseType(normalized)) {
                const baseValue = form.querySelector('input[name="baseValue"]')?.value;
                return buildBaseConfig(baseValue);
            }
            if (normalized === 'mixed') {
                return form.querySelector('textarea[name="configJson"]')?.value || '';
            }
            return '';
        }

        function renderTable(distributions, options = {}) {
            const filtered = filterList(distributions, options);
            const showUnitValue = options.showUnitValue === true;
            const hideConfig = options.hideConfig === true;
            const headers = [
                t('domus', 'Name'),
                t('domus', 'Type'),
            ];
            if (showUnitValue) {
                headers.push(t('domus', 'Unit value'));
            }
            headers.push(t('domus', 'Valid from'), t('domus', 'Valid to'));
            if (!hideConfig) {
                headers.push(t('domus', 'Base'));
            }

            const rows = filtered.map(item => {
                const unitValue = item.unitValue || null;
                const cells = [
                    Domus.Utils.escapeHtml(item.name || ''),
                    Domus.Utils.escapeHtml(getTypeLabel(item.type))
                ];
                if (showUnitValue) {
                    const valueContent = unitValue && unitValue.value !== undefined && unitValue.value !== null
                        ? Domus.Utils.formatAmount(unitValue.value)
                        : '—';
                    cells.push({ content: Domus.Utils.escapeHtml(valueContent), alignRight: true });
                }
                cells.push(
                    Domus.Utils.escapeHtml(formatDate(item.validFrom)),
                    Domus.Utils.escapeHtml(formatDate(item.validTo))
                );
                if (!hideConfig) {
                    const baseValue = parseBaseConfig(item.configJson);
                    const baseContent = baseValue === '' || baseValue === null || baseValue === undefined ? '—' : baseValue;
                    cells.push(Domus.Utils.escapeHtml(baseContent));
                }
                return { cells, className: 'domus-distribution-row', dataset: { distid: item.id, disttype: item.type } };
            });

            return Domus.UI.buildTable(headers, rows, { wrapPanel: options.wrapPanel !== false });
        }

        function filterList(distributions, options = {}) {
            const baseExcludes = (options.excludeTypes || []).map(t => String(t).toLowerCase());
            const excludeDefaults = options.excludeSystemDefaults !== false
                ? systemDefaultTypes.map(t => String(t).toLowerCase())
                : [];
            const excludeTypes = baseExcludes.concat(excludeDefaults);
            return (distributions || []).filter(item => !excludeTypes.includes(String(item.type).toLowerCase()));
        }

        function formatDate(value) {
            if (!value) {
                return '—';
            }
            return Domus.Utils.formatDate(value);
        }

        function buildTypeSelect(defaultValue = '', { excludeSystemDefaults = false } = {}) {
            const options = excludeSystemDefaults ? typeOptions.filter(opt => !opt.systemDefault) : typeOptions;
            return '<select name="type" required>' + options.map(opt => {
                const selected = String(opt.value) === String(defaultValue) ? ' selected' : '';
                return '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + selected + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>';
            }).join('') + '</select>';
        }

        function openCreateKeyModal(propertyId, onCreated) {
            if (!canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }
            const today = (new Date()).toISOString().slice(0, 10);
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Name'),
                    required: true,
                    content: '<input type="text" name="name" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Type'),
                    required: true,
                    content: buildTypeSelect('', { excludeSystemDefaults: true })
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Valid from'),
                    required: true,
                    content: '<input type="date" name="validFrom" value="' + Domus.Utils.escapeHtml(today) + '" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Valid to'),
                    content: '<input type="date" name="validTo">'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Base'),
                    helpText: t('domus', 'Base value used to calculate shares.'),
                    content: '<input type="number" name="baseValue" step="0.01" min="0.01">',
                    className: 'domus-distribution-base-row'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Configuration'),
                    helpText: t('domus', 'Provide JSON configuration for mixed distributions.'),
                    fullWidth: true,
                    content: '<textarea name="configJson" rows="3"></textarea>',
                    className: 'domus-distribution-config-row'
                })
            ];

            const form = '<form id="domus-distribution-form">' +
                Domus.UI.buildFormTable(rows) +
                '<div class="domus-form-actions">' +
                '<button type="button" id="domus-distribution-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '</div>' +
                '</form>';

            const modal = Domus.UI.openModal({
                title: t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') }),
                content: form
            });

            modal.modalEl.querySelector('#domus-distribution-cancel')?.addEventListener('click', modal.close);
            const typeSelect = modal.modalEl.querySelector('select[name="type"]');
            if (typeSelect) {
                toggleConfigFields(modal.modalEl, typeSelect.value);
                typeSelect.addEventListener('change', function() {
                    toggleConfigFields(modal.modalEl, this.value);
                });
            }
            modal.modalEl.querySelector('#domus-distribution-form')?.addEventListener('submit', function(e) {
                e.preventDefault();
                const payload = {};
                Array.prototype.forEach.call(this.elements, el => {
                    if (el.name && el.name !== 'baseValue') {
                        payload[el.name] = el.value;
                    }
                });
                payload.configJson = resolveConfigPayload(payload.type, this);
                Domus.Api.createDistribution(propertyId, payload)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Distribution') }), 'success');
                        modal.close();
                        onCreated?.();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function openCreateUnitValueModal(unit, onCreated, defaults = {}) {
            if (!canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }
            if (!unit || !unit.id || !unit.propertyId) {
                Domus.UI.showNotification(t('domus', 'Unit information is incomplete.'), 'error');
                return;
            }

            Domus.Api.getDistributions(unit.propertyId)
                .then(distributions => {
                    if (!distributions || !distributions.length) {
                        Domus.UI.showNotification(t('domus', 'Create a distribution first for this property.'), 'error');
                        return;
                    }
                    const filtered = Domus.Distributions.filterList(distributions, { excludeSystemDefaults: true });
                    if (!filtered.length) {
                        Domus.UI.showNotification(t('domus', 'No applicable distributions available for unit values.'), 'error');
                        return;
                    }
                    const today = (new Date()).toISOString().slice(0, 10);
                    const options = filtered.map(d => '<option value="' + Domus.Utils.escapeHtml(d.id) + '">' +
                        Domus.Utils.escapeHtml(d.name || ('#' + d.id)) + ' (' + Domus.Utils.escapeHtml(getTypeLabel(d.type)) + ')' + '</option>').join('');

                    const rows = [
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Distribution'),
                            required: true,
                            content: '<select name="distributionKeyId" required>' + options + '</select>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Value'),
                            required: true,
                            content: '<input type="number" name="value" step="0.01" min="0" required>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Valid from'),
                            required: true,
                            content: '<input type="date" name="validFrom" value="' + Domus.Utils.escapeHtml(today) + '" required>'
                        }),
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Valid to'),
                            content: '<input type="date" name="validTo">'
                        })
                    ];

                    const form = '<form id="domus-unit-distribution-form">' +
                        Domus.UI.buildFormTable(rows) +
                        '<div class="domus-form-actions">' +
                        '<button type="button" id="domus-unit-distribution-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                        '</div>' +
                        '</form>';

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Distribution value') }),
                        content: form
                    });

                    modal.modalEl.querySelector('#domus-unit-distribution-cancel')?.addEventListener('click', modal.close);
                    if (defaults.distributionKeyId) {
                        const select = modal.modalEl.querySelector('select[name="distributionKeyId"]');
                        if (select) {
                            select.value = String(defaults.distributionKeyId);
                        }
                    }
                    modal.modalEl.querySelector('#domus-unit-distribution-form')?.addEventListener('submit', function(e) {
                        e.preventDefault();
                        const payload = {};
                        Array.prototype.forEach.call(this.elements, el => {
                            if (el.name) {
                                payload[el.name] = el.value;
                            }
                        });
                        Domus.Api.createUnitDistribution(unit.id, payload)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Distribution value') }), 'success');
                                modal.close();
                                onCreated?.();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function renderPreviewTable(preview) {
            if (!preview || !preview.shares || !preview.shares.length) {
                return Domus.UI.buildTable([t('domus', 'Unit'), t('domus', 'Weight'), t('domus', 'Amount')], []);
            }
            const rows = preview.shares.map(share => ([
                Domus.Utils.escapeHtml(share.unitLabel || share.unitId || ''),
                Domus.Utils.formatPercentage(share.weight),
                { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(share.amount)), alignRight: true }
            ]));

            return '<div class="domus-preview-meta">' +
                '<div>' + Domus.Utils.escapeHtml(preview.distributionKey?.name || '') + ' • ' + Domus.Utils.escapeHtml(preview.distributionKey?.type || '') + '</div>' +
                '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'Period')) + ': ' + Domus.Utils.escapeHtml((preview.period?.from || '') + (preview.period?.to ? ' – ' + preview.period.to : '')) + '</div>' +
                '</div>' +
                Domus.UI.buildTable([t('domus', 'Unit'), t('domus', 'Weight'), t('domus', 'Amount')], rows);
        }

        function openPreviewModal(property) {
            if (!canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }
            const sourceBookings = (property?.bookings || []).filter(b => b.distributionKeyId);
            if (!sourceBookings.length) {
                Domus.UI.showNotification(t('domus', 'No distributable bookings found for this property.'), 'error');
                return;
            }

            const selectOptions = sourceBookings.map(b => {
                const label = [Domus.Utils.formatDate(b.date), Domus.Utils.formatCurrency(b.amount), b.description].filter(Boolean).join(' • ');
                return '<option value="' + Domus.Utils.escapeHtml(b.id) + '">' + Domus.Utils.escapeHtml(label || ('#' + b.id)) + '</option>';
            }).join('');

            const modal = Domus.UI.openModal({
                title: t('domus', 'Distribution preview'),
                size: 'large',
                content: '<div class="domus-form">' +
                    '<label>' + Domus.Utils.escapeHtml(t('domus', 'Booking')) + '<select id="domus-preview-booking">' + selectOptions + '</select></label>' +
                    '<div id="domus-preview-table" class="domus-preview-table">' + Domus.Utils.escapeHtml(t('domus', 'Loading…')) + '</div>' +
                    '</div>'
            });

            const bookingSelect = modal.modalEl.querySelector('#domus-preview-booking');
            const tableContainer = modal.modalEl.querySelector('#domus-preview-table');

            function loadPreview(bookingId) {
                if (!bookingId) {
                    tableContainer.innerHTML = Domus.Utils.escapeHtml(t('domus', 'Select a booking.'));
                    return;
                }
                tableContainer.innerHTML = Domus.Utils.escapeHtml(t('domus', 'Loading…'));
                Domus.Api.getDistributionPreview(bookingId)
                    .then(preview => {
                        tableContainer.innerHTML = renderPreviewTable(preview);
                    })
                    .catch(err => {
                        tableContainer.innerHTML = Domus.Utils.escapeHtml(err.message || t('domus', 'Unable to load preview.'));
                    });
            }

            bookingSelect?.addEventListener('change', function() {
                loadPreview(this.value);
            });

            if (bookingSelect && bookingSelect.value) {
                loadPreview(bookingSelect.value);
            }
        }

        function openEditKeyModal(propertyId, distribution, onSaved) {
            if (!canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }
            if (!distribution) {
                Domus.UI.showNotification(t('domus', 'Distribution not found.'), 'error');
                return;
            }

            const baseValue = parseBaseConfig(distribution.configJson);
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Name'),
                    required: true,
                    content: '<input type="text" name="name" value="' + Domus.Utils.escapeHtml(distribution.name || '') + '" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Type'),
                    content: '<input type="text" value="' + Domus.Utils.escapeHtml(getTypeLabel(distribution.type)) + '" disabled>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Valid from'),
                    required: true,
                    content: '<input type="date" name="validFrom" value="' + Domus.Utils.escapeHtml(distribution.validFrom || '') + '" required>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Valid to'),
                    content: '<input type="date" name="validTo" value="' + Domus.Utils.escapeHtml(distribution.validTo || '') + '">' 
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Base'),
                    helpText: t('domus', 'Base value used to calculate shares.'),
                    content: '<input type="number" name="baseValue" step="0.01" min="0.01" value="' + Domus.Utils.escapeHtml(baseValue) + '">',
                    className: 'domus-distribution-base-row'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Configuration'),
                    helpText: t('domus', 'Provide JSON configuration for mixed distributions.'),
                    fullWidth: true,
                    content: '<textarea name="configJson" rows="3">' + Domus.Utils.escapeHtml(distribution.configJson || '') + '</textarea>',
                    className: 'domus-distribution-config-row'
                })
            ];

            const modal = Domus.UI.openModal({
                title: t('domus', 'Edit {entity}', { entity: t('domus', 'Distribution') }),
                content: '<form id="domus-edit-distribution">' + Domus.UI.buildFormTable(rows) +
                    '<div class="domus-form-actions">' +
                    '<button type="button" id="domus-edit-distribution-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                    '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                    '</div></form>'
            });

            modal.modalEl.querySelector('#domus-edit-distribution-cancel')?.addEventListener('click', modal.close);
            toggleConfigFields(modal.modalEl, distribution.type);
            modal.modalEl.querySelector('#domus-edit-distribution')?.addEventListener('submit', function(e) {
                e.preventDefault();
                const payload = {};
                Array.prototype.forEach.call(this.elements, el => {
                    if (el.name && el.name !== 'baseValue') payload[el.name] = el.value;
                });
                payload.configJson = resolveConfigPayload(distribution.type, this);
                Domus.Api.updateDistribution(propertyId, distribution.id, payload)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: t('domus', 'Distribution') }), 'success');
                        modal.close();
                        onSaved?.();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        function bindTable(containerId, distributions, options = {}) {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.querySelectorAll('tr.domus-distribution-row').forEach(row => {
                row.addEventListener('click', () => {
                    const distId = row.getAttribute('data-distid');
                    const distribution = distributions.find(d => String(d.id) === String(distId));
                    if (options.mode === 'unit') {
                        options.onUnitEdit?.(distribution);
                    } else {
                        options.onPropertyEdit?.(distribution);
                    }
                });
            });
        }

        return {
            canManageDistributions,
            loadForProperty,
            loadForUnit,
            renderTable,
            openCreateKeyModal,
            openCreateUnitValueModal,
            getTypeLabel,
            openPreviewModal,
            renderPreviewTable,
            openEditKeyModal,
            bindTable,
            filterList
        };
    })();
    Domus.DistributionReports = (function() {
        function openModal(defaults = {}) {
            if (!Domus.Distributions.canManageDistributions()) {
                Domus.UI.showNotification(t('domus', 'This action is only available for building management.'), 'error');
                return;
            }

            const defaultYear = defaults.year || Domus.state.currentYear;
            let selectedPropertyId = defaults.propertyId ? String(defaults.propertyId) : '';
            let selectedUnitId = defaults.unitId ? String(defaults.unitId) : '';
            let selectedYear = defaultYear;
            let properties = [];
            let units = [];

            const formRows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Property'),
                    required: true,
                    content: '<select id="domus-distribution-report-property"></select>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Unit'),
                    required: true,
                    content: '<select id="domus-distribution-report-unit"></select>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Year'),
                    required: true,
                    content: '<select id="domus-distribution-report-year"></select>'
                })
            ];

            const container = document.createElement('div');
            container.innerHTML = '<div class="domus-form">' + Domus.UI.buildFormTable(formRows) + '</div>' +
                '<div class="domus-table" id="domus-distribution-report-table"></div>';

            const modal = Domus.UI.openModal({
                title: t('domus', 'Distribution Report'),
                content: container,
                size: 'large'
            });

            const modalEl = modal.modalEl;
            const propertySelect = modalEl.querySelector('#domus-distribution-report-property');
            const unitSelect = modalEl.querySelector('#domus-distribution-report-unit');
            const yearSelect = modalEl.querySelector('#domus-distribution-report-year');
            const tableContainer = modalEl.querySelector('#domus-distribution-report-table');

            if (!propertySelect || !unitSelect || !yearSelect || !tableContainer) {
                Domus.UI.showNotification(t('domus', 'Unable to load the distribution report form.'), 'error');
                return;
            }

            yearSelect.innerHTML = buildYearOptions(defaultYear).map(year => '<option value="' + year + '">' + Domus.Utils.escapeHtml(year) + '</option>').join('');
            yearSelect.value = String(selectedYear);

            yearSelect.addEventListener('change', () => {
                selectedYear = parseInt(yearSelect.value, 10);
                loadReport();
            });

            propertySelect.addEventListener('change', () => {
                selectedPropertyId = propertySelect.value;
                loadUnits(selectedPropertyId);
            });

            unitSelect.addEventListener('change', () => {
                selectedUnitId = unitSelect.value;
                loadReport();
            });

            function buildYearOptions(initialYear) {
                const current = (new Date()).getFullYear();
                const years = [];
                for (let i = 0; i < 6; i++) {
                    years.push(current - i);
                }
                if (!years.includes(initialYear)) {
                    years.push(initialYear);
                }
                return years.sort((a, b) => b - a);
            }

            function renderOptions(list, selectedId) {
                return (list || []).map(item => {
                    const selected = String(item.value) === String(selectedId) ? ' selected' : '';
                    return '<option value="' + Domus.Utils.escapeHtml(item.value) + '"' + selected + '>' +
                        Domus.Utils.escapeHtml(item.label) + '</option>';
                }).join('');
            }

            function updatePropertyOptions() {
                const options = properties.map(item => ({
                    value: item.id,
                    label: item.name || `${t('domus', 'Property')} #${item.id}`
                }));
                if (!selectedPropertyId && options[0]) {
                    selectedPropertyId = String(options[0].value);
                }
                propertySelect.innerHTML = renderOptions(options, selectedPropertyId);
            }

            function updateUnitOptions() {
                const options = units.map(item => ({
                    value: item.id,
                    label: item.label || `${t('domus', 'Unit')} #${item.id}`
                }));
                if (!selectedUnitId && options[0]) {
                    selectedUnitId = String(options[0].value);
                }
                if (selectedUnitId && !options.some(opt => String(opt.value) === String(selectedUnitId))) {
                    selectedUnitId = options[0] ? String(options[0].value) : '';
                }
                unitSelect.innerHTML = renderOptions(options, selectedUnitId);
            }

            function formatShare(value, base) {
                if (value === undefined || value === null || base === undefined || base === null || base === '') {
                    return '';
                }
                const valueText = Domus.Utils.formatAmount(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                const baseText = Domus.Utils.formatAmount(base, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                return `${valueText} / ${baseText}`;
            }

            function renderReport(rows) {
                if (!rows || !rows.length) {
                    tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'No bookings found for the selected year.')) + '</div>';
                    return;
                }
                let totalSum = 0;
                let amountSum = 0;
                const renderedRows = rows.map(row => {
                    const accountLabel = row.accountLabel || '';
                    const accountValue = accountLabel || (row.account !== undefined && row.account !== null ? row.account.toString() : '');
                    const distributionLabel = row.distributionKeyName || Domus.Distributions.getTypeLabel(row.distributionKeyType) || '';
                    totalSum += Number(row.total) || 0;
                    amountSum += Number(row.amount) || 0;
                    return [
                        Domus.Utils.escapeHtml(accountValue),
                        Domus.Utils.escapeHtml(Domus.Utils.formatDate(row.date)),
                        Domus.Utils.escapeHtml(distributionLabel),
                        Domus.Utils.escapeHtml(formatShare(row.shareValue, row.shareBase)),
                        { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(row.total)), alignRight: true },
                        { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(row.amount)), alignRight: true }
                    ];
                });
                renderedRows.push([
                    Domus.Utils.escapeHtml(t('domus', 'Total')),
                    '',
                    '',
                    '',
                    { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(totalSum)), alignRight: true },
                    { content: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(amountSum)), alignRight: true }
                ]);
                tableContainer.innerHTML = Domus.UI.buildTable([
                    t('domus', 'Account'),
                    t('domus', 'Date'),
                    t('domus', 'Distribution'),
                    t('domus', 'Share'),
                    t('domus', 'Total'),
                    t('domus', 'Amount')
                ], renderedRows);
            }

            function loadReport() {
                if (!selectedPropertyId || !selectedUnitId) {
                    tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'Select a property and unit.')) + '</div>';
                    return;
                }
                tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'Loading…')) + '</div>';
                Domus.Api.getDistributionReport(selectedPropertyId, selectedUnitId, selectedYear)
                    .then(rows => {
                        renderReport(rows || []);
                    })
                    .catch(err => {
                        tableContainer.innerHTML = '<div class="domus-error">' + Domus.Utils.escapeHtml(err.message || t('domus', 'An error occurred')) + '</div>';
                    });
            }

            function loadUnits(propertyId) {
                if (!propertyId) {
                    units = [];
                    updateUnitOptions();
                    loadReport();
                    return;
                }
                Domus.Api.getUnits(propertyId)
                    .then(list => {
                        units = list || [];
                        updateUnitOptions();
                        loadReport();
                    })
                    .catch(err => {
                        tableContainer.innerHTML = '<div class="domus-error">' + Domus.Utils.escapeHtml(err.message || t('domus', 'An error occurred')) + '</div>';
                    });
            }

            Domus.Api.getProperties()
                .then(list => {
                    properties = list || [];
                    updatePropertyOptions();
                    loadUnits(selectedPropertyId);
                })
                .catch(err => {
                    tableContainer.innerHTML = '<div class="domus-error">' + Domus.Utils.escapeHtml(err.message || t('domus', 'An error occurred')) + '</div>';
                });
        }

        return { openModal };
    })();

    /**
     * Router mapping view identifiers to renderers
     */
})();

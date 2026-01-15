(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Units = (function() {
        let rentabilityChartInstance = null;
        let kpiChartInstances = [];
        function formatPartnerNames(partners) {
            return (partners || [])
                .map(p => p.name)
                .filter(Boolean)
                .join(', ');
        }

        function normalizeChartValue(value) {
            if (value === undefined || value === null || value === '') {
                return null;
            }
            const numeric = Number(value);
            return Number.isNaN(numeric) ? null : numeric;
        }

        function getRentabilityChartSeries(statistics) {
            const rows = (statistics?.revenue?.rows || [])
                .map(row => ({
                    year: normalizeChartValue(row?.year),
                    rentability: normalizeChartValue(row?.netRentab),
                    coldRent: normalizeChartValue(row?.rent)
                }))
                .filter(row => row.year);

            if (!rows.length) {
                return null;
            }

            rows.sort((a, b) => a.year - b.year);

            const labels = rows.map(row => String(row.year));
            const rentability = rows.map(row => row.rentability);
            const coldRent = rows.map(row => row.coldRent);
            const hasValues = rentability.some(value => value !== null) || coldRent.some(value => value !== null);

            if (!hasValues) {
                return null;
            }

            return { labels, rentability, coldRent };
        }

        function getOpenTasksTone(status) {
            if (status === 'overdue') {
                return { className: 'domus-kpi-number-alert', iconClass: 'domus-icon-alert' };
            }
            if (status === 'warning') {
                return { className: 'domus-kpi-number-warning', iconClass: 'domus-icon-warning' };
            }
            return { className: 'domus-kpi-number-ok', iconClass: 'domus-icon-checkmark' };
        }

        function buildOpenTasksValue(count, status = 'ok') {
            const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
            const tone = getOpenTasksTone(status);
            const icon = '<span class="domus-icon ' + Domus.Utils.escapeHtml(tone.iconClass) + ' domus-kpi-icon" aria-hidden="true"></span>';
            return '<span id="domus-kpi-open-tasks" class="domus-kpi-number ' + Domus.Utils.escapeHtml(tone.className) + '">' +
                icon +
                Domus.Utils.escapeHtml(String(safeCount)) +
                '</span>';
        }

        function updateOpenTasksValue(count, status = 'ok') {
            const value = document.getElementById('domus-kpi-open-tasks');
            if (!value) {
                return;
            }
            const safeCount = Number.isFinite(Number(count)) ? Number(count) : 0;
            const tone = getOpenTasksTone(status);
            value.classList.remove('domus-kpi-number-warning', 'domus-kpi-number-ok', 'domus-kpi-number-alert');
            value.classList.add(tone.className);
            value.innerHTML = '<span class="domus-icon ' + Domus.Utils.escapeHtml(tone.iconClass) + ' domus-kpi-icon" aria-hidden="true"></span>' +
                Domus.Utils.escapeHtml(String(safeCount));
        }

        function buildRentabilityChartPanel(statistics) {
            const chartSeries = getRentabilityChartSeries(statistics);
            const header = Domus.UI.buildSectionHeader(t('domus', 'Rentability & cold rent'));
            const body = chartSeries
                ? '<div class="domus-chart-wrapper"><canvas id="domus-unit-rentability-chart" class="domus-chart"></canvas></div>'
                : '<div class="domus-empty">' + Domus.Utils.escapeHtml(t('domus', 'No rentability data available.')) + '</div>';

            return '<div class="domus-panel domus-panel-chart">' +
                header +
                '<div class="domus-panel-body">' + body + '</div>' +
                '</div>';
        }

        function renderRentabilityChart(statistics) {
            if (rentabilityChartInstance) {
                rentabilityChartInstance.destroy();
                rentabilityChartInstance = null;
            }

            const chartSeries = getRentabilityChartSeries(statistics);
            const canvas = document.getElementById('domus-unit-rentability-chart');
            if (!canvas || !chartSeries || !window.Chart) {
                return;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }

            const rootStyles = getComputedStyle(document.documentElement);
            const rentabilityColor = rootStyles.getPropertyValue('--color-primary').trim() || '#2d7fff';
            const coldRentColor = rootStyles.getPropertyValue('--color-warning').trim() || '#f6b02e';

            const formatAxisPercentage = (value) => {
                const numeric = Number(value);
                if (Number.isNaN(numeric)) {
                    return '';
                }
                return `${Domus.Utils.formatNumber(numeric * 100, { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: false })}%`;
            };
            const formatAxisCurrency = (value) => {
                const numeric = Number(value);
                if (Number.isNaN(numeric)) {
                    return '';
                }
                return `€ ${Domus.Utils.formatNumber(numeric, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            };

            const rentabilityValues = chartSeries.rentability.filter(value => value !== null);
            const coldRentValues = chartSeries.coldRent.filter(value => value !== null);
            const rentabilityMin = rentabilityValues.length ? Math.min(...rentabilityValues) : 0;
            const rentabilityMax = rentabilityValues.length ? Math.max(...rentabilityValues) : 0;
            const coldRentMax = coldRentValues.length ? Math.max(...coldRentValues) : 0;

            let yAxisMin = rentabilityMin;
            let yAxisMax = rentabilityMax;
            if (yAxisMin === yAxisMax) {
                yAxisMin -= 0.05;
                yAxisMax += 0.05;
            }

            const zeroFraction = yAxisMax !== yAxisMin ? (0 - yAxisMin) / (yAxisMax - yAxisMin) : 0;
            let y1AxisMin = 0;
            let y1AxisMax = coldRentMax;
            if (zeroFraction > 0 && zeroFraction < 1 && y1AxisMax !== 0) {
                y1AxisMin = (zeroFraction * y1AxisMax) / (zeroFraction - 1);
            }

            rentabilityChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartSeries.labels,
                    datasets: [
                        {
                            label: t('domus', 'Rentability'),
                            data: chartSeries.rentability,
                            type: 'line',
                            yAxisID: 'y',
                            borderColor: rentabilityColor,
                            backgroundColor: rentabilityColor,
                            tension: 0.3,
                            pointRadius: 3,
                            pointHoverRadius: 4,
                            fill: false
                        },
                        {
                            label: t('domus', 'Cold rent'),
                            data: chartSeries.coldRent,
                            yAxisID: 'y1',
                            backgroundColor: coldRentColor,
                            borderColor: coldRentColor,
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            position: 'bottom'
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    if (context.dataset.yAxisID === 'y') {
                                        return `${context.dataset.label}: ${Domus.Utils.formatPercentage(context.parsed.y)}`;
                                    }
                                    return `${context.dataset.label}: ${Domus.Utils.formatCurrency(context.parsed.y)}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: {
                                display: false
                            }
                        },
                        y: {
                            position: 'left',
                            min: yAxisMin,
                            max: yAxisMax,
                            grid: {
                                display: false
                            },
                            ticks: {
                                callback: formatAxisPercentage
                            }
                        },
                        y1: {
                            position: 'right',
                            min: y1AxisMin,
                            max: y1AxisMax || undefined,
                            grid: {
                                display: false
                            },
                            ticks: {
                                callback: formatAxisCurrency
                            }
                        }
                    }
                }
            });
        }

        function destroyKpiCharts() {
            kpiChartInstances.forEach(instance => instance?.destroy());
            kpiChartInstances = [];
        }

        function renderKpiLineChart(canvasId, labels, values, options = {}) {
            const canvas = document.getElementById(canvasId);
            if (!canvas || !window.Chart) {
                return;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }

            const lineColor = '#0f6b2f';

            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            data: values,
                            borderColor: lineColor,
                            backgroundColor: lineColor,
                            borderWidth: 2,
                            tension: 0.3,
                            fill: false,
                            pointRadius: 0,
                            pointHoverRadius: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    },
                    scales: {
                        x: { display: false, grid: { display: false } },
                        y: {
                            display: true,
                            ticks: { display: false },
                            border: { display: false },
                            grid: {
                                drawTicks: false,
                                color: (context) => (context.tick?.value === 0 ? 'rgba(0, 0, 0, 0.2)' : 'transparent')
                            },
                        }
                    }
                }
            });

            kpiChartInstances.push(chart);
        }

        function renderKpiTileCharts(statistics) {
            destroyKpiCharts();
            const series = getRentabilityChartSeries(statistics);
            if (!series) {
                return;
            }
            renderKpiLineChart('domus-kpi-rentability-chart', series.labels, series.rentability);
            renderKpiLineChart('domus-kpi-cold-rent-chart', series.labels, series.coldRent, {
                color: getComputedStyle(document.documentElement).getPropertyValue('--color-warning').trim() || '#f6b02e'
            });
        }

        function buildKpiDetailPanel(title, body, action) {
            const header = title ? Domus.UI.buildSectionHeader(title, action) : '';
            return header + '<div class="domus-panel-body">' + body + '</div>';
        }

        function bindKpiDetailArea(detailMap, onRender) {
            const detailArea = document.getElementById('domus-unit-kpi-detail');
            if (!detailArea) {
                return;
            }

            document.querySelectorAll('.domus-kpi-more[data-kpi-target]').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    if (btn.tagName.toLowerCase() === 'a') {
                        event.preventDefault();
                    }
                    const target = btn.getAttribute('data-kpi-target');
                    const content = target ? detailMap[target] : null;
                    if (!content) {
                        return;
                    }
                    const currentTarget = detailArea.dataset.kpiTarget || '';
                    const isVisible = !detailArea.hasAttribute('hidden');
                    if (isVisible && currentTarget === target) {
                        detailArea.setAttribute('hidden', '');
                        detailArea.dataset.kpiTarget = '';
                        detailArea.innerHTML = '';
                        return;
                    }
                    detailArea.innerHTML = content;
                    detailArea.removeAttribute('hidden');
                    detailArea.dataset.kpiTarget = target;
                    Domus.UI.bindRowNavigation();
                    if (typeof onRender === 'function') {
                        onRender(target);
                    }
                });
            });
        }

        function renderList() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Units') }));
            Domus.Api.getUnitsStatisticsOverview()
                .then(statistics => {
                    const canImport = !Domus.Role.isTenantView();
                    const importButton = canImport
                        ? '<button id="domus-unit-import" class="secondary">' + Domus.Utils.escapeHtml(t('domus', 'Import unit data')) + '</button>'
                        : '';
                    const header = '<div class="domus-toolbar">' +
                        '<button id="domus-unit-create" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Unit') })) + '</button>' +
                        importButton +
                        Domus.UI.buildScopeAddButton('domus-icon-unit', t('domus', 'Add {entity}', { entity: t('domus', 'Unit') }), {
                            id: 'domus-unit-create',
                            className: 'primary'
                        }) +
                        Domus.UI.buildYearFilter(renderList) +
                        '</div>';

                    const table = renderStatisticsTable(statistics, {
                        buildRowDataset: (row) => row.unitId ? { navigate: 'unitDetail', args: row.unitId } : null,
                        totals: [
                            { key: 'gwb', label: t('domus', 'Total {label}', { label: t('domus', 'Gross profit') }) }
                        ]
                    });

                    Domus.UI.renderContent(header + table);
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            const createBtn = document.getElementById('domus-unit-create');
            if (createBtn) createBtn.addEventListener('click', () => openCreateModal());
            const importBtn = document.getElementById('domus-unit-import');
            if (importBtn) importBtn.addEventListener('click', () => openImportModal());
            Domus.UI.bindRowNavigation();
        }

        function renderListInline(units) {
            const rows = (units || []).map(u => ({
                cells: [
                    Domus.Utils.escapeHtml(u.label || ''),
                    Domus.Utils.escapeHtml(u.unitNumber || ''),
                    Domus.Utils.escapeHtml(u.unitType || '')
                ],
                dataset: u.id ? { navigate: 'unitDetail', args: u.id } : null
            }));
            return Domus.UI.buildTable([t('domus', 'Label'), t('domus', 'Number'), t('domus', 'Type')], rows, { wrapPanel: false });
        }

        function renderStatisticsTable(statistics, options = {}) {
            if (!statistics) {
                return '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'No {entity} available.', { entity: t('domus', 'Statistics') })) + '</div>';
            }

            const wrapPanel = options.wrapPanel !== false;
            const columns = statistics.columns || [];
            const rowsData = statistics.rows || [];
            const yearColumn = columns.find(col => (col.key || '').toLowerCase() === 'year' || (col.label || '').toLowerCase() === 'year');

            function shouldAlignRight(format, hasNumericValues) {
                if (!format && !hasNumericValues) return false;
                if (format === 'year') return false;
                return ['currency', 'percentage', 'ratio', 'number'].includes(format || (hasNumericValues ? 'currency' : ''));
            }

            const columnMeta = columns.map(col => {
                const isYearColumn = (col.key || '').toLowerCase() === 'year';
                const columnFormat = col.format || (isYearColumn ? 'year' : null);
                const hasNumericValues = rowsData.some(row => {
                    const value = row[col.key];
                    return value !== undefined && value !== null && !Number.isNaN(Number(value));
                });
                return Object.assign({}, col, {
                    format: columnFormat,
                    alignRight: isYearColumn ? false : shouldAlignRight(columnFormat, hasNumericValues)
                });
            });

            const headers = columnMeta.map(col => ({ label: col.label || col.key || '', alignRight: col.alignRight }));
            const sortedRows = [...rowsData];
            if (yearColumn) {
                sortedRows.sort((a, b) => (parseInt(b[yearColumn.key], 10) || 0) - (parseInt(a[yearColumn.key], 10) || 0));
            }

            const rows = sortedRows.map(row => {
                const cells = columnMeta.map((col, index) => {
                    const value = row[col.key];
                    const formatted = formatStatValue(value, col.format, col.unit);
                    if (formatted && formatted.alignRight && headers[index]) {
                        headers[index].alignRight = true;
                    }
                    const isYearColumn = (col.key || '').toLowerCase() === 'year';
                    if (isYearColumn && row.isProvisional) {
                        const yearLabel = Domus.Utils.escapeHtml(formatted.content);
                        const badgeLabel = Domus.Utils.escapeHtml(t('domus', 'Provisional'));
                        return {
                            content: '<span class="domus-statistics-year-value">' + yearLabel + '</span>' +
                                '<span class="domus-badge domus-badge-muted domus-badge-provisional">' +
                                badgeLabel +
                                '</span>',
                            alignRight: false,
                            className: 'domus-statistics-year-cell'
                        };
                    }
                    return {
                        content: Domus.Utils.escapeHtml(formatted.content),
                        alignRight: isYearColumn ? false : formatted.alignRight
                    };
                });

                if (typeof options.buildRowDataset === 'function') {
                    const dataset = options.buildRowDataset(row) || null;
                    if (dataset) {
                        return { cells, dataset };
                    }
                }

                return cells;
            });

            const totalsHtml = buildStatisticsTotals(columnMeta, rowsData, options.totals || []);
            const tableHtml = Domus.UI.buildTable(headers, rows, { wrapPanel: false });
            if (!wrapPanel) {
                return '<div class="domus-panel-table">' + tableHtml + totalsHtml + '</div>';
            }
            return '<div class="domus-panel domus-panel-table">' + tableHtml + totalsHtml + '</div>';
        }

        function buildStatisticsTotals(columnMeta, rowsData, totalsConfig) {
            if (!totalsConfig.length) {
                return '';
            }

            const items = totalsConfig.map(config => {
                const column = columnMeta.find(col => col.key === config.key);
                if (!column) {
                    return null;
                }
                let sum = 0;
                let hasValues = false;
                rowsData.forEach(row => {
                    const value = Number(row[column.key]);
                    if (!Number.isNaN(value)) {
                        sum += value;
                        hasValues = true;
                    }
                });
                if (!hasValues) {
                    return null;
                }
                const formatted = formatStatValue(sum, column.format, column.unit);
                const label = config.label || t('domus', 'Total {label}', { label: column.label || column.key });
                return '<div class="domus-table-summary-item">' +
                    '<span class="domus-table-summary-label">' + Domus.Utils.escapeHtml(label) + '</span>' +
                    '<span class="domus-table-summary-value">' + Domus.Utils.escapeHtml(formatted.content) + '</span>' +
                    '</div>';
            }).filter(Boolean);

            if (!items.length) {
                return '';
            }

            return '<div class="domus-table-summary">' + items.join('') + '</div>';
        }

        function formatStatValue(value, format, unit) {
            if (value === undefined || value === null) {
                return { content: '', alignRight: false };
            }

            const numeric = Number(value);
            const isNumeric = !Number.isNaN(numeric);

            const resolvedFormat = format || (isNumeric ? 'currency' : null);
            const resolvedUnit = unit || (resolvedFormat === 'currency' ? '€' : null);

            const withUnit = (content) => {
                if (content === undefined || content === null || content === '') {
                    return content;
                }
                return resolvedUnit ? `${content} ${resolvedUnit}` : content;
            };

            if ((resolvedFormat === 'percentage' || resolvedFormat === 'ratio') && isNumeric) {
                return { content: withUnit(Domus.Utils.formatPercentage(numeric)), alignRight: true };
            }

            if (resolvedFormat === 'currency' && isNumeric) {
                const formatted = Domus.Utils.formatNumber(numeric, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return { content: withUnit(formatted), alignRight: true };
            }

            if (resolvedFormat === 'year' && isNumeric) {
                return { content: withUnit(Domus.Utils.formatYear(numeric)), alignRight: false };
            }

            if (isNumeric) {
                return { content: withUnit(Domus.Utils.formatNumber(numeric)), alignRight: true };
            }

            return { content: withUnit(String(value)), alignRight: false };
        }

        function collectStatisticsYears(statistics) {
            const years = new Set();
            ['revenue', 'cost'].forEach(key => {
                const rows = statistics?.[key]?.rows || [];
                rows.forEach(row => {
                    const year = Number(row?.year);
                    if (!Number.isNaN(year) && year) {
                        years.add(year);
                    }
                });
            });
            if (years.size === 0) {
                years.add(Domus.state.currentYear);
            }
            return Array.from(years).sort((a, b) => b - a);
        }

        function collectProvisionalMap(statistics) {
            const map = {};
            ['revenue', 'cost'].forEach(key => {
                const rows = statistics?.[key]?.rows || [];
                rows.forEach(row => {
                    const year = Number(row?.year);
                    if (!Number.isNaN(year) && year && map[year] === undefined) {
                        map[year] = !!row?.isProvisional;
                    }
                });
            });
            return map;
        }

        function openYearStatusModal(unitId, statistics, onComplete, modalOptions = {}) {
            const years = collectStatisticsYears(statistics);
            const provisionalMap = collectProvisionalMap(statistics);
            const yearOptions = years.map(year => '<option value="' + Domus.Utils.escapeHtml(String(year)) + '">' + Domus.Utils.escapeHtml(String(year)) + '</option>').join('');
            const content = '<form id="domus-year-status-form">' +
                '<label>' + Domus.Utils.escapeHtml(t('domus', 'Year')) +
                '<select id="domus-year-status-year" name="year">' + yearOptions + '</select></label>' +
                '<div class="muted domus-year-status-hint" id="domus-year-status-hint"></div>' +
                '<div class="domus-modal-footer">' +
                '<button type="button" id="domus-year-status-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '<button type="submit" class="primary" id="domus-year-status-submit"></button>' +
                '</div>' +
                '</form>';

            const modal = Domus.UI.openModal({ title: t('domus', 'Manage year status'), content });
            const form = modal.modalEl.querySelector('#domus-year-status-form');
            const yearSelect = modal.modalEl.querySelector('#domus-year-status-year');
            const hint = modal.modalEl.querySelector('#domus-year-status-hint');
            const submitBtn = modal.modalEl.querySelector('#domus-year-status-submit');
            const cancelBtn = modal.modalEl.querySelector('#domus-year-status-cancel');

            function updateState() {
                const year = Number(yearSelect?.value);
                const isProvisional = provisionalMap[year] !== undefined ? provisionalMap[year] : true;
                if (hint) {
                    hint.textContent = isProvisional
                        ? t('domus', 'This year is still open. Figures are provisional.')
                        : t('domus', 'This year is closed.');
                }
                if (submitBtn) {
                    submitBtn.textContent = isProvisional ? t('domus', 'Close year') : t('domus', 'Reopen year');
                }
            }

            const defaultYear = modalOptions.defaultYear !== undefined ? Number(modalOptions.defaultYear) : null;
            if (defaultYear && yearSelect && years.includes(defaultYear)) {
                yearSelect.value = String(defaultYear);
            }
            updateState();

            yearSelect?.addEventListener('change', updateState);
            cancelBtn?.addEventListener('click', modal.close);

            form?.addEventListener('submit', (event) => {
                event.preventDefault();
                const year = Number(yearSelect?.value);
                const isProvisional = provisionalMap[year] !== undefined ? provisionalMap[year] : true;
                const action = isProvisional ? Domus.Api.closeBookingYear : Domus.Api.reopenBookingYear;
                action(year, { unitId })
                    .then(() => {
                        Domus.UI.showNotification(isProvisional ? t('domus', 'Year closed.') : t('domus', 'Year reopened.'), 'success');
                        modal.close();
                        if (typeof onComplete === 'function') {
                            onComplete();
                        }
                    })
                    .catch(err => Domus.UI.showError(err.message));
            });
        }

        function bindYearStatusAction(unitId, statistics) {
            document.getElementById('domus-unit-year-status')?.addEventListener('click', () => {
                openYearStatusModal(unitId, statistics, () => renderDetail(unitId));
            });
        }

        function openCreateModal(defaults = {}, onCreated) {
            Domus.Api.getProperties()
                .then(properties => {
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const availableProperties = propertyOptions.slice(1);
                    const requireProperty = Domus.Permission.shouldRequireProperty();
                    const firstPropertyId = availableProperties[0]?.value;

                    if (requireProperty && !availableProperties.length) {
                        Domus.UI.showNotification(t('domus', 'Create a property first before adding units.'), 'error');
                        return;
                    }

                    const effectiveDefaults = Object.assign({ propertyId: requireProperty ? firstPropertyId : '' }, defaults);
                    const showPropertySelect = !Domus.Permission.shouldHidePropertyField(effectiveDefaults)
                        && (requireProperty || availableProperties.length > 1);
                    const defaultPropertyId = effectiveDefaults.propertyId;

                    const modal = Domus.UI.openModal({
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Unit') }),
                        content: buildUnitForm(propertyOptions, effectiveDefaults, { showPropertySelect, requireProperty, defaultPropertyId })
                    });
                    bindUnitForm(modal, data => Domus.Api.createUnit(data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Unit') }), 'success');
                            modal.close();
                            (onCreated || renderList)();
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { requireProperty });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function getStatisticsRowYear(row, statistics) {
            if (!statistics || !statistics.columns) {
                return null;
            }
            const yearColumn = statistics.columns.find(col => {
                const key = (col.key || '').toLowerCase();
                const label = (col.label || '').toLowerCase();
                return key === 'year' || label === 'year';
            });
            if (!yearColumn) {
                return null;
            }
            const value = row[yearColumn.key];
            return value === undefined || value === null || value === '' ? null : value;
        }

        function renderUnitBookingsByYear(unitId, year) {
            const panel = document.getElementById('domus-unit-bookings-panel');
            const body = document.getElementById('domus-unit-bookings-body');
            if (!panel || !body) {
                return;
            }
            panel.removeAttribute('hidden');
            body.innerHTML = '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'Loading bookings…')) + '</div>';
            Domus.Api.getBookings({ unitId, year })
                .then(bookings => {
                    body.innerHTML = Domus.Bookings.renderInline(bookings || [], { refreshView: 'unitDetail', refreshId: unitId });
                    Domus.UI.bindRowNavigation();
                    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                })
                .catch(err => {
                    body.innerHTML = '<div class="muted">' + Domus.Utils.escapeHtml(err.message || '') + '</div>';
                });
        }

        function renderUnitDocumentsByYear(unitId, year, options = {}) {
            Domus.Documents.renderList('unit', unitId, {
                showLinkAction: options.showLinkAction,
                year
            });
        }

        function bindStatisticsBookingRows(unitId, options = {}) {
            const detailArea = document.getElementById('domus-unit-kpi-detail');
            if (!detailArea) {
                return;
            }
            detailArea.querySelectorAll('table.domus-table tr[data-stat-year]').forEach(row => {
                row.addEventListener('click', (event) => {
                    if (event.target.closest('a') || event.target.closest('button')) {
                        return;
                    }
                    const year = row.getAttribute('data-stat-year');
                    if (!year) {
                        return;
                    }
                    renderUnitBookingsByYear(unitId, year);
                    renderUnitDocumentsByYear(unitId, year, options);
                });
            });
        }

        function renderDetail(id) {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Unit') }));
            Domus.Api.get('/units/' + id)
                .then(unit => {
                    const distributionsPromise = Domus.Role.isBuildingMgmtView()
                        ? Domus.Distributions.loadForUnit(id).catch(() => [])
                        : Promise.resolve([]);
                    return Promise.all([
                        Promise.resolve(unit),
                        Domus.Api.getUnitStatistics(id).catch(() => null),
                        Domus.Api.getBookings({ unitId: id }).catch(() => []),
                        distributionsPromise,
                        Domus.Api.getUnitPartners(id).catch(() => [])
                    ]);
                })
                .then(([unit, statistics, bookings, distributions, partners]) => {

                    const tenancyLabels = Domus.Role.getTenancyLabels();
                    const unitDetailConfig = Domus.Role.getUnitDetailConfig();
                    const canManageTenancies = Domus.Role.hasCapability('manageTenancies');
                    const canManageBookings = Domus.Role.hasCapability('manageBookings') && unitDetailConfig.showBookings;
                    const canManageDistributions = Domus.Distributions.canManageDistributions();
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const isLandlord = Domus.Role.getCurrentRole() === 'landlord';
                    const isBuildingManagement = Domus.Role.isBuildingMgmtView();
                    const useKpiLayout = isLandlord;
                    const showPartners = isLandlord;
                    const showRentabilityPanels = !isBuildingManagement;
                    const filteredDistributions = Domus.Distributions.filterList(distributions, { excludeSystemDefaults: true });
                    const allTenancies = (unit.activeTenancies || []).concat(unit.historicTenancies || []);
                    const currentTenancy = (unit.activeTenancies || [])
                        .slice()
                        .sort((a, b) => {
                            const aDate = new Date(a?.startDate || 0);
                            const bDate = new Date(b?.startDate || 0);
                            return (bDate.getTime() || 0) - (aDate.getTime() || 0);
                        })[0];
                    const currentTenantPartners = currentTenancy
                        ? Domus.Partners.renderPartnerContactList(currentTenancy.partners, { fallbackName: currentTenancy.partnerName })
                        : '';
                    const currentBaseRent = currentTenancy?.baseRent;
                    const previousYear = Domus.state.currentYear - 1;
                    const rentabilityRow = (statistics?.revenue?.rows || [])
                        .find(row => Number(row.year) === previousYear);
                    const rentabilityValue = rentabilityRow?.netRentab;
                    const livingAreaLabel = unit.livingArea ? `${Domus.Utils.formatAmount(unit.livingArea)} m²` : '';
                    const kickerParts = [livingAreaLabel, unit.notes].filter(Boolean);
                    const kicker = kickerParts.length ? kickerParts.join(' | ') : '';
                    const street = unit.street || unit.propertyStreet;
                    const zip = unit.zip || unit.propertyZip;
                    const city = unit.city || unit.propertyCity;
                    const country = unit.country || unit.propertyCountry;
                    const addressParts = [];
                    if (unit.address) {
                        addressParts.push(unit.address);
                    }
                    const cityLine = [zip, city].filter(Boolean).join(' ');
                    if (street || cityLine || country) {
                        if (street) addressParts.push(street);
                        if (cityLine) addressParts.push(cityLine);
                        if (country) addressParts.push(country);
                    } else if (unit.address) {
                        addressParts.push(unit.address);
                    }
                    const addressLine = addressParts.join(', ');
                    const stats = useKpiLayout ? '' : Domus.UI.buildStatCards([
                        {
                            label: t('domus', 'Current Tenancy'),
                            value: Domus.Utils.formatCurrency(currentBaseRent) || '—',
                            hint: t('domus', 'Base rent') || '—',
                            formatValue: false
                        },
                        {
                            label: ' ',
                            value: Domus.Utils.formatPercentage(rentabilityValue) || '—',
                            hint: t('domus', 'Rentability'),
                            formatValue: false
                        },
                        { label: t('domus', 'Living area'), value: unit.livingArea ? `${Domus.Utils.formatAmount(unit.livingArea)} m²` : '—', hint: t('domus', 'Reported size') },
                        { label: t('domus', 'Year'), value: Domus.Utils.formatYear(Domus.state.currentYear), hint: t('domus', 'Reporting context'), formatValue: false }
                    ]);
                    const standardActions = [
                        Domus.UI.buildIconButton('domus-icon-details', t('domus', 'Details'), { id: 'domus-unit-details' }),
                        Domus.UI.buildIconButton('domus-icon-document', t('domus', 'Export data'), { id: 'domus-unit-export' }),
                        Domus.UI.buildIconButton('domus-icon-delete', t('domus', 'Delete'), { id: 'domus-unit-delete' })
                    ];
                    const contextActions = isBuildingManagement
                        ? [
                            (canManageDistributions ? '<button id="domus-unit-distribution-report">' + Domus.Utils.escapeHtml(t('domus', 'Distribution Report')) + '</button>' : '')
                        ].filter(Boolean)
                        : (isLandlord
                            ? [
                                '<button id="domus-unit-service-charge">' + Domus.Utils.escapeHtml(t('domus', 'Utility Bill Statement')) + '</button>',
                                '<button id="domus-unit-toggle-partners">' + Domus.Utils.escapeHtml(t('domus', 'Partners')) + '</button>'
                            ]
                            : [
                                (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action ? '<button id="domus-add-tenancy" data-unit-id="' + id + '">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : ''),
                                (canManageBookings ? '<button id="domus-add-unit-booking">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Booking') })) + '</button>' : ''),
                                (canManageDistributions ? '<button id="domus-add-unit-distribution">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') })) + '</button>' : ''),
                                (canManageDistributions ? '<button id="domus-unit-distribution-report">' + Domus.Utils.escapeHtml(t('domus', 'Distribution Report')) + '</button>' : ''),
                                '<button id="domus-unit-service-charge">' + Domus.Utils.escapeHtml(t('domus', 'Utility Bill Statement')) + '</button>',
                                (showPartners ? '<button id="domus-unit-toggle-partners">' + Domus.Utils.escapeHtml(t('domus', 'Partners')) + '</button>' : '')
                            ]
                        ).filter(Boolean);

                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-content">' +
                        '<div class="domus-hero-indicator"><span class="domus-icon domus-icon-unit" aria-hidden="true"></span></div>' +
                        '<div class="domus-hero-main">' +
                        (kicker ? '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(kicker) + '</div>' : '') +
                        '<h2>' + Domus.Utils.escapeHtml(unit.label || '') + '</h2>' +
                        (addressLine ? '<p class="domus-hero-meta">' + Domus.Utils.escapeHtml(addressLine) + '</p>' : '') +
                        (unit.unitType ? '<div class="domus-hero-tags"><span class="domus-badge">' + Domus.Utils.escapeHtml(unit.unitType) + '</span></div>' : '') +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        (standardActions.length ? '<div class="domus-hero-actions-row domus-hero-actions-standard">' + standardActions.join('') + '</div>' : '') +
                        (contextActions.length ? '<div class="domus-hero-actions-row">' + contextActions.join('') + '</div>' : '') +
                        '</div>' +
                        '</div>';

                    const tenanciesHeader = Domus.UI.buildSectionHeader(tenancyLabels.plural, (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action) ? {
                        id: 'domus-add-tenancy-inline',
                        title: tenancyLabels.action,
                        iconClass: 'domus-icon-add'
                    } : null);
                    const distributionsHeader = Domus.UI.buildSectionHeader(t('domus', 'Distribution'), canManageDistributions ? {
                        id: 'domus-add-unit-distribution-inline',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') }),
                        iconClass: 'domus-icon-add'
                    } : null);
                    const bookingsHeader = canManageBookings ? Domus.UI.buildSectionHeader(t('domus', 'Bookings'), {
                        id: 'domus-add-unit-booking-inline',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Booking') }),
                        iconClass: 'domus-icon-add'
                    }) : '';
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Documents'), documentActionsEnabled ? {
                        id: 'domus-unit-link-doc',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        label: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                        iconClass: 'domus-icon-add',
                        dataset: { entityType: 'unit', entityId: id }
                    } : null);

                    const yearStatusAction = {
                        id: 'domus-unit-year-status',
                        title: t('domus', 'Manage year status'),
                        iconClass: 'domus-icon-confirm-year'
                    };
                    const statisticsHeader = Domus.UI.buildSectionHeader(t('domus', 'Revenue'), yearStatusAction);
                    const revenueTable = renderStatisticsTable(statistics ? statistics.revenue : null, {
                        buildRowDataset: row => {
                            const year = getStatisticsRowYear(row, statistics ? statistics.revenue : null);
                            return year ? { 'stat-year': year } : null;
                        },
                        wrapPanel: false
                    });
                    const costTable = statistics && statistics.cost
                        ? '<div class="domus-section">' + Domus.UI.buildSectionHeader(t('domus', 'Costs')) + renderStatisticsTable(statistics.cost, {
                            buildRowDataset: row => {
                                const year = getStatisticsRowYear(row, statistics ? statistics.cost : null);
                                return year ? { 'stat-year': year } : null;
                            },
                            wrapPanel: false
                        }) + '</div>'
                        : '';
                    const rentabilityChartPanel = (useKpiLayout || !showRentabilityPanels) ? '' : (isLandlord ? buildRentabilityChartPanel(statistics) : '');

                    const rentabilityTrend = getRentabilityChartSeries(statistics);
                    const hasRentabilityTrend = !!(rentabilityTrend?.rentability || []).some(value => value !== null);
                    const hasColdRentTrend = !!(rentabilityTrend?.coldRent || []).some(value => value !== null);
                    const rentabilityValueLabel = rentabilityValue === undefined || rentabilityValue === null
                        ? '—'
                        : Domus.Utils.formatPercentage(rentabilityValue);
                    const coldRentValueLabel = currentBaseRent === undefined || currentBaseRent === null
                        ? '—'
                        : Domus.Utils.formatCurrency(currentBaseRent);
                    const currentTenantLabel = currentTenantPartners || '—';
                    const openTaskCount = Domus.Role.isTenantView()
                        ? 0
                        : (unit.activeOpenTasks || 0);
                    const openTaskLabel = buildOpenTasksValue(openTaskCount);
                    const tasksPanel = Domus.Role.isTenantView() ? '' : Domus.Tasks.buildUnitTasksPanel();
                    const tasksPanelContent = Domus.Role.isTenantView() ? '' : Domus.Tasks.buildUnitTasksPanel({ wrapPanel: false });
                    const kpiTiles = useKpiLayout
                        ? '<div class="domus-kpi-tiles">' +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Open issues'),
                            valueHtml: openTaskLabel,
                            showChart: false,
                            linkLabel: t('domus', 'More'),
                            detailTarget: 'tasks'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Rentability'),
                            value: rentabilityValueLabel,
                            chartId: 'domus-kpi-rentability-chart',
                            showChart: hasRentabilityTrend,
                            linkLabel: t('domus', 'More'),
                            detailTarget: 'revenue'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Cold rent'),
                            value: coldRentValueLabel,
                            chartId: 'domus-kpi-cold-rent-chart',
                            showChart: hasColdRentTrend,
                            linkLabel: t('domus', 'More'),
                            detailTarget: 'cost'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Current rental'),
                            valueHtml: currentTenantLabel,
                            showChart: false,
                            linkLabel: t('domus', 'More'),
                            detailTarget: 'tenancies'
                        }) +
                        '</div>'
                        : '';

                    const partnersPanel = showPartners
                        ? Domus.PartnerRelations.renderSection(partners || [], { entityType: 'unit', entityId: id })
                        : '';
                    const partnersPanelWrapper = showPartners
                        ? '<div id="domus-unit-partners-panel"' + (useKpiLayout ? ' class="domus-hidden"' : '') + '>' +
                        partnersPanel +
                        '</div>'
                        : '';

                    const kpiDetailArea = useKpiLayout
                        ? '<div class="domus-panel domus-kpi-detail" id="domus-unit-kpi-detail" hidden></div>'
                        : '';

                    const bookingsPanel = canManageBookings
                        ? '<div class="domus-panel" id="domus-unit-bookings-panel"' + (useKpiLayout ? ' hidden' : '') + '>' + bookingsHeader + '<div class="domus-panel-body" id="domus-unit-bookings-body">' +
                        Domus.Bookings.renderInline(bookings || [], { refreshView: 'unitDetail', refreshId: id }) +
                        '</div></div>'
                        : '';

                    const documentsPanel = '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('unit', id, { showLinkAction: documentActionsEnabled }) +
                        '</div></div>';

                    const content = useKpiLayout
                        ? '<div class="domus-detail domus-dashboard domus-unit-detail-landlord">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        kpiTiles +
                        kpiDetailArea +
                        bookingsPanel +
                        documentsPanel +
                        partnersPanelWrapper +
                        '</div>'
                        : '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid domus-dashboard-grid-single">' +
                        '<div class="domus-dashboard-main">' +
                        rentabilityChartPanel +
                        (canManageDistributions ? '<div class="domus-panel">' + distributionsHeader + '<div class="domus-panel-body" id="domus-unit-distributions">' +
                        Domus.Distributions.renderTable(filteredDistributions, { showUnitValue: true, hideConfig: true, excludeSystemDefaults: true, wrapPanel: false }) + '</div></div>' : '') +
                        '<div class="domus-panel">' + tenanciesHeader + '<div class="domus-panel-body">' +
                        Domus.Tenancies.renderInline(allTenancies) + '</div></div>' +
                        tasksPanel +
                        partnersPanelWrapper +
                        (showRentabilityPanels ? '<div class="domus-panel">' + statisticsHeader + '<div class="domus-panel-body">' +
                        revenueTable + costTable + '</div></div>' : '') +
                        (canManageBookings ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(bookings || [], { refreshView: 'unitDetail', refreshId: id }) + '</div></div>' : '') +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('unit', id, { showLinkAction: documentActionsEnabled }) + '</div></div>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    Domus.UI.bindRowNavigation();
                    Domus.UI.bindCollapsibles();
                    if (!useKpiLayout) {
                        bindYearStatusAction(id, statistics);
                    }
                    Domus.Partners.bindContactActions();
                    if (canManageDistributions && !useKpiLayout) {
                        Domus.Distributions.bindTable('domus-unit-distributions', filteredDistributions, {
                            mode: 'unit',
                            onUnitEdit: (distribution) => Domus.Distributions.openCreateUnitValueModal(unit, () => renderDetail(id), { distributionKeyId: distribution?.id })
                        });
                    }
                    if (showPartners) {
                        Domus.PartnerRelations.bindSection({ entityType: 'unit', entityId: id, onRefresh: () => renderDetail(id) });
                    }
                    if (useKpiLayout) {
                        renderKpiTileCharts(statistics);
                        const detailMap = {
                            tasks: tasksPanel,
                            revenue: buildKpiDetailPanel(t('domus', 'Revenue'), revenueTable, yearStatusAction),
                            cost: buildKpiDetailPanel(t('domus', 'Costs'), renderStatisticsTable(statistics ? statistics.cost : null)),
                            tenancies: buildKpiDetailPanel(tenancyLabels.plural, Domus.Tenancies.renderInline(allTenancies), (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action) ? {
                                id: 'domus-add-tenancy-inline',
                                title: tenancyLabels.action,
                                iconClass: 'domus-icon-add'
                            } : null)
                        };
                        bindKpiDetailArea(detailMap, (target) => {
                            document.getElementById('domus-add-tenancy-inline')?.addEventListener('click', () => {
                                Domus.Tenancies.openCreateModal({ unitId: id }, () => renderDetail(id));
                            });
                            if (target === 'tasks') {
                                Domus.Tasks.loadUnitTasks(id, {
                                    onOpenCount: (count, status) => {
                                        unit.activeOpenTasks = count;
                                        updateOpenTasksValue(count, status);
                                    }
                                });
                                Domus.Tasks.bindUnitTaskButtons(id, () => Domus.Tasks.loadUnitTasks(id));
                            }
                            if (target === 'revenue') {
                                bindYearStatusAction(id, statistics);
                            }
                            bindStatisticsBookingRows(id, { showLinkAction: documentActionsEnabled });
                        });
                    } else if (showRentabilityPanels) {
                        renderRentabilityChart(isLandlord ? statistics : null);
                    }
                    bindDetailActions(id, unit);
                    if (!Domus.Role.isTenantView()) {
                        Domus.Tasks.loadUnitTasks(id, {
                            onOpenCount: (count, status) => {
                                unit.activeOpenTasks = count;
                                updateOpenTasksValue(count, status);
                            }
                        });
                        Domus.Tasks.bindUnitTaskButtons(id, () => Domus.Tasks.loadUnitTasks(id));
                    }
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, unit) {
            const detailsBtn = document.getElementById('domus-unit-details');
            const deleteBtn = document.getElementById('domus-unit-delete');
            const exportBtn = document.getElementById('domus-unit-export');
            const partnersToggleBtn = document.getElementById('domus-unit-toggle-partners');
            const partnersPanel = document.getElementById('domus-unit-partners-panel');

            detailsBtn?.addEventListener('click', () => openUnitModal(id, 'view'));
            deleteBtn?.addEventListener('click', () => {
                if (!confirm(t('domus', 'Delete {entity}?', { entity: t('domus', 'Unit') }))) {
                    return;
                }
                Domus.Api.deleteUnit(id)
                    .then(() => {
                        Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: t('domus', 'Unit') }), 'success');
                        Domus.UI.renderSidebar('');
                        renderList();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
            exportBtn?.addEventListener('click', () => openExportModal(id));
            partnersToggleBtn?.addEventListener('click', () => {
                if (!partnersPanel) {
                    return;
                }
                partnersPanel.classList.toggle('domus-hidden');
                if (!partnersPanel.classList.contains('domus-hidden')) {
                    partnersPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });

            document.getElementById('domus-add-tenancy')?.addEventListener('click', () => {
                Domus.Tenancies.openCreateModal({ unitId: id }, () => renderDetail(id));
            });
            document.getElementById('domus-add-tenancy-inline')?.addEventListener('click', () => {
                Domus.Tenancies.openCreateModal({ unitId: id }, () => renderDetail(id));
            });
            document.getElementById('domus-add-unit-booking')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({ propertyId: unit?.propertyId, unitId: id }, () => renderDetail(id), {
                    accountFilter: (nr) => String(nr).startsWith('2'),
                    hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                });
            });
            document.getElementById('domus-add-unit-booking-inline')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({ propertyId: unit?.propertyId, unitId: id }, () => renderDetail(id), {
                    accountFilter: (nr) => String(nr).startsWith('2'),
                    hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                });
            });
            document.getElementById('domus-add-unit-buying-price')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({ propertyId: unit?.propertyId, unitId: id }, () => renderDetail(id), {
                    accountFilter: (nr) => String(nr).startsWith('3'),
                    title: t('domus', 'Add {entity}', { entity: t('domus', 'Buying price') }),
                    hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                });
            });
            document.getElementById('domus-unit-service-charge')?.addEventListener('click', () => {
                Domus.UnitSettlements.openModal(id, () => renderDetail(id));
            });
            document.getElementById('domus-unit-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('unit', id, () => renderDetail(id));
            });
            document.getElementById('domus-add-unit-distribution')?.addEventListener('click', () => {
                Domus.Distributions.openCreateUnitValueModal(unit, () => renderDetail(id));
            });
            document.getElementById('domus-add-unit-distribution-inline')?.addEventListener('click', () => {
                Domus.Distributions.openCreateUnitValueModal(unit, () => renderDetail(id));
            });
            document.getElementById('domus-unit-distribution-report')?.addEventListener('click', () => {
                Domus.DistributionReports.openModal({
                    propertyId: unit?.propertyId,
                    unitId: id,
                    year: Domus.state.currentYear
                });
            });
        }

        function openEditModal(id) {
            openUnitModal(id, 'edit');
        }

        function openUnitModal(id, mode = 'edit') {
            Promise.all([
                Domus.Api.get('/units/' + id),
                Domus.Api.getProperties()
            ])
                .then(([unit, properties]) => {
                    const propertyOptions = [{ value: '', label: t('domus', 'Select property') }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const availableProperties = propertyOptions.slice(1);
                    const hidePropertyField = Domus.Permission.shouldHidePropertyField(unit || {});
                    const showPropertySelect = !hidePropertyField
                        && (Domus.Role.isBuildingMgmtView() || availableProperties.length > 1);
                    const requireProperty = Domus.Permission.shouldRequireProperty();
                    const defaultPropertyId = unit.propertyId || (showPropertySelect ? availableProperties[0]?.value : null);

                    let modal;
                    const headerActions = [];
                    if (mode === 'view') {
                        headerActions.push(Domus.UI.buildModalAction(t('domus', 'Edit'), () => {
                            modal?.close();
                            openUnitModal(id, 'edit');
                        }));
                    }

                    modal = Domus.UI.openModal({
                        title: mode === 'view' ? t('domus', 'Unit details') : t('domus', 'Edit {entity}', { entity: t('domus', 'Unit') }),
                        content: buildUnitForm(propertyOptions, unit, { showPropertySelect, requireProperty, defaultPropertyId, mode }),
                        headerActions
                    });
                    bindUnitForm(modal, data => Domus.Api.updateUnit(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: t('domus', 'Unit') }), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { requireProperty, mode, hidePropertyField });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function openExportModal(unitId) {
            Domus.Api.exportUnitDataset(unitId)
                .then(payload => {
                    const json = JSON.stringify(payload, null, 2);
                    const content = '<div class="domus-form-row">' +
                        '<label for="domus-unit-export-data">' + Domus.Utils.escapeHtml(t('domus', 'Export data')) + '</label>' +
                        '<textarea id="domus-unit-export-data" rows="14" readonly></textarea>' +
                        '<p class="muted">' + Domus.Utils.escapeHtml(t('domus', 'Documents are not included.')) + '</p>' +
                        '</div>' +
                        '<div class="domus-form-actions">' +
                        '<button type="button" class="secondary" id="domus-unit-export-copy">' + Domus.Utils.escapeHtml(t('domus', 'Copy')) + '</button>' +
                        '<button type="button" id="domus-unit-export-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button>' +
                        '</div>';
                    const modalContext = Domus.UI.openModal({
                        title: t('domus', 'Export unit data'),
                        content,
                        size: 'large'
                    });
                    const textarea = modalContext.modalEl.querySelector('#domus-unit-export-data');
                    const copyBtn = modalContext.modalEl.querySelector('#domus-unit-export-copy');
                    const closeBtn = modalContext.modalEl.querySelector('#domus-unit-export-close');
                    if (textarea) {
                        textarea.value = json;
                    }
                    if (copyBtn) {
                        copyBtn.addEventListener('click', () => {
                            const text = textarea ? textarea.value : json;
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                navigator.clipboard.writeText(text).then(() => {
                                    Domus.UI.showNotification(t('domus', 'Export data copied to clipboard.'), 'success');
                                });
                                return;
                            }
                            if (textarea) {
                                textarea.select();
                                document.execCommand('copy');
                                Domus.UI.showNotification(t('domus', 'Export data copied to clipboard.'), 'success');
                            }
                        });
                    }
                    if (closeBtn) {
                        closeBtn.addEventListener('click', () => modalContext.close());
                    }
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function openImportModal() {
            const isBuildingManagement = Domus.Permission.isBuildingManagement();
            const propertyPromise = isBuildingManagement ? Domus.Api.getProperties().catch(() => []) : Promise.resolve([]);
            propertyPromise.then(properties => {
                const propertyOptions = (properties || []).map(property => (
                    '<option value="' + Domus.Utils.escapeHtml(String(property.id)) + '">' +
                    Domus.Utils.escapeHtml(property.name || property.id) +
                    '</option>'
                ));
                const propertySelect = isBuildingManagement
                    ? '<div class="domus-form-row">' +
                        '<label for="domus-unit-import-property">' + Domus.Utils.escapeHtml(t('domus', 'Select property')) + '</label>' +
                        '<select id="domus-unit-import-property" required>' +
                        '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'Select property')) + '</option>' +
                        propertyOptions.join('') +
                        '</select>' +
                        '</div>'
                    : '';
                const content = '<form id="domus-unit-import-form">' +
                    propertySelect +
                    '<div class="domus-form-row">' +
                    '<label for="domus-unit-import-data">' + Domus.Utils.escapeHtml(t('domus', 'Paste export data')) + '</label>' +
                    '<textarea id="domus-unit-import-data" rows="14" required></textarea>' +
                    '</div>' +
                    '<div class="domus-form-actions">' +
                    '<button type="button" id="domus-unit-import-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                    '<button type="submit" class="primary" id="domus-unit-import-submit">' + Domus.Utils.escapeHtml(t('domus', 'Import')) + '</button>' +
                    '</div>' +
                    '</form>';
                const modalContext = Domus.UI.openModal({
                    title: t('domus', 'Import unit data'),
                    content,
                    size: 'large'
                });
                const form = modalContext.modalEl.querySelector('#domus-unit-import-form');
                const cancelBtn = modalContext.modalEl.querySelector('#domus-unit-import-cancel');
                const submitBtn = modalContext.modalEl.querySelector('#domus-unit-import-submit');
                const textArea = modalContext.modalEl.querySelector('#domus-unit-import-data');
                const propertySelectEl = modalContext.modalEl.querySelector('#domus-unit-import-property');
                cancelBtn?.addEventListener('click', () => modalContext.close());
                form?.addEventListener('submit', (event) => {
                    event.preventDefault();
                    if (submitBtn) submitBtn.disabled = true;
                    let data;
                    try {
                        data = JSON.parse(textArea ? textArea.value : '{}');
                    } catch (error) {
                        if (submitBtn) submitBtn.disabled = false;
                        Domus.UI.showNotification(t('domus', 'Import data must be valid JSON.'), 'error');
                        return;
                    }

                    const selectedPropertyId = propertySelectEl ? propertySelectEl.value : '';
                    if (isBuildingManagement && !selectedPropertyId) {
                        if (submitBtn) submitBtn.disabled = false;
                        Domus.UI.showNotification(t('domus', 'Property is required.'), 'error');
                        return;
                    }

                    Domus.Api.importUnitDataset(data, selectedPropertyId || null)
                        .then(response => {
                            modalContext.close();
                            Domus.UI.showNotification(t('domus', 'Import completed.'), 'success');
                            (response?.warnings || []).forEach(message => {
                                Domus.UI.showNotification(message, 'info');
                            });
                            if (response?.unitId) {
                                Domus.Router.navigate('unitDetail', [response.unitId]);
                            } else {
                                renderList();
                            }
                        })
                        .catch(err => {
                            Domus.UI.showNotification(err.message, 'error');
                            if (submitBtn) submitBtn.disabled = false;
                        });
                });
            });
        }

        function bindUnitForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-unit-form');
            const mode = options.mode || 'edit';
            const cancel = modalContext.modalEl.querySelector('#domus-unit-cancel');
            const closeBtn = modalContext.modalEl.querySelector('#domus-unit-close');

            if (mode === 'view') {
                closeBtn?.addEventListener('click', modalContext.close);
                form?.addEventListener('submit', function(e) {
                    e.preventDefault();
                    modalContext.close();
                });
                return;
            }

            cancel?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = {};
                Array.prototype.forEach.call(form.elements, el => { if (el.name) data[el.name] = el.value; });
            if (options.requireProperty && !data.propertyId) {
                Domus.UI.showNotification(t('domus', 'Property is required.'), 'error');
                return;
            }
            if (!data.label) {
                Domus.UI.showNotification(t('domus', 'Label is required.'), 'error');
                return;
            }
            if (options.hidePropertyField) {
                data.propertyId = null;
            }
            onSubmit?.(data);
        });
    }


        function buildUnitForm(propertyOptions, unit, options = {}) {
            const mode = options.mode || 'edit';
            const isView = mode === 'view';
            const selectedPropertyId = unit?.propertyId
                ? String(unit.propertyId)
                : (options.defaultPropertyId ? String(options.defaultPropertyId) : '');
            const showPropertySelect = options.showPropertySelect !== false && propertyOptions.length;
            const includeManagementExcludedFields = !Domus.Role.isBuildingMgmtView();
            const hiddenFields = [];

            const propertyMap = propertyOptions.reduce((map, opt) => {
                if (opt && opt.value !== undefined) {
                    map[String(opt.value)] = opt.label;
                }
                return map;
            }, {});

            function displayValue(value, formatter) {
                if (value === undefined || value === null || value === '') {
                    return '';
                }
                const resolved = typeof formatter === 'function' ? formatter(value) : value;
                return resolved === undefined || resolved === null ? '' : resolved;
            }

            function renderDisplay(value, formatter) {
                const resolved = displayValue(value, formatter);
                const text = typeof resolved === 'string' ? resolved : (resolved || resolved === 0 ? String(resolved) : '');
                const escaped = Domus.Utils.escapeHtml(text).replace(/\n/g, '<br>');
                return '<div class="domus-form-value-text">' + escaped + '</div>';
            }

            function inputField(name, label, value, options = {}) {
                const id = `domus-unit-${name}`;
                const required = options.required && !isView;
                const attrs = [
                    `name="${Domus.Utils.escapeHtml(name)}"`,
                    `id="${Domus.Utils.escapeHtml(id)}"`
                ];
                if (options.type) attrs.push(`type="${Domus.Utils.escapeHtml(options.type)}"`);
                if (options.step) attrs.push(`step="${Domus.Utils.escapeHtml(options.step)}"`);
                if (required) attrs.push('required');
                if (isView) attrs.push('disabled');
                const escapedValue = value || value === 0 ? Domus.Utils.escapeHtml(String(value)) : '';
                const content = options.isTextarea
                    ? `<textarea ${attrs.join(' ')}>${escapedValue}</textarea>`
                    : `<input ${attrs.join(' ')} value="${escapedValue}">`;

                const viewContent = renderDisplay(value, options.viewFormatter);
                return Domus.UI.buildFormRow({
                    label,
                    required: required,
                    content: isView ? viewContent : content
                });
            }

            const rows = [];

            if (showPropertySelect) {
                const propertyLabel = propertyMap[selectedPropertyId] || unit?.propertyName || selectedPropertyId;
                const content = isView
                    ? renderDisplay(propertyLabel)
                    : '<select name="propertyId" id="domus-unit-property"' + (options.requireProperty ? ' required' : '') + (isView ? ' disabled' : '') + '>' +
                    propertyOptions.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (String(opt.value) === selectedPropertyId ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                    '</select>';
                rows.push(Domus.UI.buildFormRow({
                    label: t('domus', 'Property'),
                    required: options.requireProperty && !isView,
                    content
                }));
            } else if (selectedPropertyId) {
                hiddenFields.push('<input type="hidden" name="propertyId" value="' + Domus.Utils.escapeHtml(selectedPropertyId) + '">');
            }

            rows.push(
                inputField('label', t('domus', 'Label'), unit?.label || '', { required: true }),
                inputField('unitNumber', t('domus', 'Unit number'), unit?.unitNumber || ''),
                inputField('unitType', t('domus', 'Unit type'), unit?.unitType || '')
            );

            if (includeManagementExcludedFields) {
                rows.push(inputField('landRegister', t('domus', 'Land register'), unit?.landRegister || ''));
            }

            rows.push(
                inputField('livingArea', t('domus', 'Living area'), unit?.livingArea || '', {
                    type: 'number',
                    step: '0.01',
                    viewFormatter: (val) => `${Domus.Utils.formatAmount(val)} m²`
                })
            );

            rows.push(
                inputField('notes', t('domus', 'Description'), unit?.notes || '', {
                    isTextarea: true
                })
            );

            if (includeManagementExcludedFields) {
                rows.push(
                    inputField('buyDate', t('domus', 'Buy date'), unit?.buyDate || '', {
                        type: 'date',
                        viewFormatter: Domus.Utils.formatDate
                    }),
                    inputField('totalCosts', t('domus', 'Total costs'), unit?.totalCosts || '', {
                        type: 'number',
                        step: '0.01',
                        viewFormatter: Domus.Utils.formatCurrency
                    }),
                    inputField('taxId', t('domus', 'Tax ID'), unit?.taxId || ''),
                    inputField('iban', t('domus', 'IBAN'), unit?.iban || ''),
                    inputField('bic', t('domus', 'BIC'), unit?.bic || '')
                );
            }

            const actions = isView
                ? '<div class="domus-form-actions"><button type="button" id="domus-unit-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button></div>'
                : '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-unit-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-unit-form" data-mode="' + Domus.Utils.escapeHtml(mode) + '">' +
                hiddenFields.join('') +
                Domus.UI.buildFormTable(rows) +
                actions +
                '</form>' +
                '</div>';
        }

        return { renderList, renderDetail, renderListInline, renderStatisticsTable, openCreateModal, openYearStatusModal };
    })();
    Domus.UnitSettlements = (function() {
        function openModal(unitId, onComplete) {
            const defaultYear = (new Date()).getFullYear() - 1;
            let selectedYear = defaultYear;
            let selectedGroup = null;
            let settlements = [];

            const container = document.createElement('div');
            container.innerHTML = '<div class="domus-form">'
                + '<label>' + Domus.Utils.escapeHtml(t('domus', 'Year')) + ' '
                + '<select id="domus-settlement-year"></select>'
                + '</label>'
                + '</div>'
                + '<div class="domus-table" id="domus-settlement-table"></div>'
                + '<div class="domus-modal-footer">'
                + '<button id="domus-create-settlement" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Abrechnung erstellen')) + '</button>'
                + '</div>';

            const modal = Domus.UI.openModal({
                title: t('domus', 'Utility Bill Statement'),
                content: container,
                size: 'large'
            });

            const yearSelect = container.querySelector('#domus-settlement-year');
            const tableContainer = container.querySelector('#domus-settlement-table');
            const createBtn = container.querySelector('#domus-create-settlement');

            yearSelect.innerHTML = buildYearOptions(defaultYear).map(y => '<option value="' + y + '">' + Domus.Utils.escapeHtml(y) + '</option>').join('');
            yearSelect.value = String(defaultYear);

            yearSelect.addEventListener('change', () => {
                selectedYear = parseInt(yearSelect.value, 10);
                loadSettlements();
            });

            createBtn.addEventListener('click', () => {
                if (!selectedGroup) {
                    Domus.UI.showNotification(t('domus', 'Select a partner first.'), 'error');
                    return;
                }
                const selected = settlements.find(item => item.groupId === selectedGroup);
                if (!selected) {
                    Domus.UI.showNotification(t('domus', 'Select a partner first.'), 'error');
                    return;
                }
                createBtn.disabled = true;
                Domus.Api.createUnitSettlementReport(unitId, { year: selectedYear, partnerId: selected.partnerId })
                    .then(() => {
                        Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Report') }), 'success');
                        modal.close();
                        onComplete?.();
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'))
                    .finally(() => { createBtn.disabled = false; });
            });

            function buildYearOptions(defaultYear) {
                const current = (new Date()).getFullYear();
                const years = [];
                for (let i = 0; i < 6; i++) {
                    years.push(current - i);
                }
                if (!years.includes(defaultYear)) {
                    years.push(defaultYear);
                }
                return years.sort((a, b) => b - a);
            }

            function renderTable() {
                if (!settlements.length) {
                    tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'No settlements for the selected year.')) + '</div>';
                    return;
                }

                const rows = settlements.map((entry, idx) => {
                    const radio = '<input type="radio" name="domus-settlement-select" value="' + Domus.Utils.escapeHtml(entry.groupId) + '" ' + (selectedGroup === entry.groupId || (!selectedGroup && idx === 0) ? 'checked' : '') + '>';
                    return [
                        radio,
                        Domus.Utils.escapeHtml(entry.partnerName || ''),
                        Domus.Utils.formatCurrency(entry.serviceCharge),
                        Domus.Utils.formatCurrency(entry.houseFee),
                        Domus.Utils.formatCurrency(entry.propertyTax),
                        Domus.Utils.formatCurrency(entry.saldo)
                    ];
                });

                tableContainer.innerHTML = Domus.UI.buildTable([
                    '',
                    t('domus', 'Partner'),
                    t('domus', 'Utility costs'),
                    t('domus', 'Maintenance fee'),
                    t('domus', 'Property tax'),
                    t('domus', 'Saldo')
                ], rows);

                const radios = tableContainer.querySelectorAll('input[name="domus-settlement-select"]');
                radios.forEach(radio => {
                    radio.addEventListener('change', () => {
                        selectedGroup = radio.value;
                    });
                });
                if (!selectedGroup && settlements[0]) {
                    selectedGroup = settlements[0].groupId;
                }
            }

            function loadSettlements() {
                tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'Loading…')) + '</div>';
                Domus.Api.getUnitSettlements(unitId, selectedYear)
                    .then(data => {
                        settlements = (data || []).map(item => Object.assign({ groupId: item.groupId || String(item.partnerId) }, item));
                        selectedGroup = settlements[0]?.groupId || null;
                        renderTable();
                    })
                    .catch(err => {
                        tableContainer.innerHTML = '<div class="domus-error">' + Domus.Utils.escapeHtml(err.message || t('domus', 'An error occurred')) + '</div>';
                    });
            }

            loadSettlements();
        }

        return { openModal };
    })();

    /**
     * Partners view
     */
})();

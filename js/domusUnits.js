(function () {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Units = (function () {
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

            return {labels, rentability, coldRent};
        }

        function getLatestClosedYear(rows = []) {
            const parsedRows = rows
                .map(row => ({
                    year: normalizeChartValue(row?.year),
                    isProvisional: row?.isProvisional !== undefined ? !!row.isProvisional : true
                }))
                .filter(row => row.year);
            if (!parsedRows.length) {
                return null;
            }
            const closedYears = parsedRows
                .filter(row => !row.isProvisional)
                .map(row => row.year);
            if (!closedYears.length) {
                return null;
            }
            return Math.max(...closedYears);
        }

        function getLatestYear(rows = []) {
            const years = rows
                .map(row => normalizeChartValue(row?.year))
                .filter(year => year);
            if (!years.length) {
                return null;
            }
            return Math.max(...years);
        }

        function getOpenTasksTone(status) {
            if (status === 'overdue') {
                return {className: 'domus-kpi-number-alert', iconClass: 'domus-icon-alert'};
            }
            if (status === 'warning') {
                return {className: 'domus-kpi-number-warning', iconClass: 'domus-icon-warning'};
            }
            return {className: 'domus-kpi-number-ok', iconClass: 'domus-icon-checkmark'};
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

        function buildFilesFolderUrl(path) {
            if (!path || typeof OC === 'undefined' || typeof OC.generateUrl !== 'function') {
                return '';
            }
            const normalizedPath = path.startsWith('/') ? path : `/${path}`;
            return OC.generateUrl('/apps/files/?dir=' + encodeURIComponent(normalizedPath));
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
                return `${Domus.Utils.formatNumber(numeric * 100, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                    useGrouping: false
                })}%`;
            };
            const formatAxisCurrency = (value) => {
                const numeric = Number(value);
                if (Number.isNaN(numeric)) {
                    return '';
                }
                return `€ ${Domus.Utils.formatNumber(numeric, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
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
                        legend: {display: false},
                        tooltip: {enabled: false}
                    },
                    scales: {
                        x: {display: false, grid: {display: false}},
                        y: {
                            display: true,
                            ticks: {display: false},
                            border: {display: false},
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

        function bindKpiDetailArea(detailMap, onRender, options = {}) {
            const detailArea = document.getElementById('domus-unit-kpi-detail');
            if (!detailArea) {
                return;
            }

            const openTarget = (target, forceOpen = false) => {
                const content = target ? detailMap[target] : null;
                if (!content) {
                    return;
                }
                const currentTarget = detailArea.dataset.kpiTarget || '';
                const isVisible = !detailArea.hasAttribute('hidden');
                if (!forceOpen && isVisible && currentTarget === target) {
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
                if (target === 'tasks') {
                    detailArea.scrollIntoView({behavior: 'smooth', block: 'start'});
                }
            };

            document.querySelectorAll('.domus-kpi-more[data-kpi-target]').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    if (btn.tagName.toLowerCase() === 'a') {
                        event.preventDefault();
                    }
                    const target = btn.getAttribute('data-kpi-target');
                    openTarget(target);
                });
            });

            if (options.initialTarget) {
                openTarget(options.initialTarget, true);
            }
        }

        function renderList() {
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', {entity: t('domus', 'Units')}));
            Domus.Api.getUnitsStatisticsOverview()
                .then(statistics => {
                    const canImport = !Domus.Role.isTenantView();
                    const importButton = canImport
                        ? Domus.UI.createIconButton('domus-icon-add', t('domus', 'Import'), {
                            id: 'domus-unit-import',
                            className: 'domus-scope-add-button secondary'
                        }).outerHTML
                        : '';
                    const header = '<div class="domus-toolbar">' +
                        Domus.UI.buildScopeAddButton('domus-icon-unit', t('domus', 'Add {entity}', {entity: t('domus', 'Unit')}), {
                            id: 'domus-unit-create',
                            className: 'primary'
                        }) +
                        importButton +
                        '</div>';

                    const hasRows = (statistics?.rows || []).length > 0;
                    const table = renderStatisticsTable(statistics, {
                        buildRowDataset: (row) => row.unitId ? {navigate: 'unitDetail', args: row.unitId} : null,
                        sortByYear: false,
                        totals: [
                            {key: 'gwb', label: t('domus', 'Total {label}', {label: t('domus', 'Gross profit')})}
                        ]
                    });
                    const emptyState = Domus.UI.buildEmptyStateAction(
                        t('domus', 'There is no {entity} yet. Create the first one', {
                            entity: t('domus', 'Units')
                        }),
                        {
                            iconClass: 'domus-icon-unit',
                            actionId: 'domus-units-empty-create'
                        }
                    );

                    Domus.UI.renderContent(header + (hasRows ? table : emptyState));
                    bindList();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindList() {
            const createBtn = document.getElementById('domus-unit-create');
            if (createBtn) createBtn.addEventListener('click', () => openCreateModal());
            document.getElementById('domus-units-empty-create')?.addEventListener('click', () => openCreateModal());
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
                dataset: u.id ? {navigate: 'unitDetail', args: u.id} : null
            }));
            return Domus.UI.buildTable([t('domus', 'Label'), t('domus', 'Number'), t('domus', 'Type')], rows, {wrapPanel: false});
        }

        function renderStatisticsTable(statistics, options = {}) {
            if (!statistics) {
                return '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'No {entity} available.', {entity: t('domus', 'Statistics')})) + '</div>';
            }

            const wrapPanel = options.wrapPanel !== false;
            const columns = statistics.columns || [];
            const rowsData = statistics.rows || [];
            const yearColumn = columns.find(col => (col.key || '').toLowerCase() === 'year' || (col.label || '').toLowerCase() === 'year');

            if (!rowsData.length && options.emptyMessage) {
                return Domus.UI.buildEmptyStateAction(options.emptyMessage, {
                    iconClass: options.emptyIconClass,
                    actionId: options.emptyActionId
                });
            }

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

            const headers = columnMeta.map(col => ({label: col.label || col.key || '', alignRight: col.alignRight}));
            const sortedRows = [...rowsData];
            if (yearColumn && options.sortByYear !== false) {
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
                        return {cells, dataset};
                    }
                }

                return cells;
            });

            const totalsHtml = buildStatisticsTotals(columnMeta, rowsData, options.totals || []);
            const tableHtml = Domus.UI.buildTable(headers, rows, {wrapPanel: false});
            if (!wrapPanel) {
                return tableHtml + totalsHtml;
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
                const label = config.label || t('domus', 'Total {label}', {label: column.label || column.key});
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
                return {content: '', alignRight: false};
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
                return {content: withUnit(Domus.Utils.formatPercentage(numeric)), alignRight: true};
            }

            if (resolvedFormat === 'currency' && isNumeric) {
                const formatted = Domus.Utils.formatNumber(numeric, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
                return {content: withUnit(formatted), alignRight: true};
            }

            if (resolvedFormat === 'year' && isNumeric) {
                return {content: withUnit(Domus.Utils.formatYear(numeric)), alignRight: false};
            }

            if (isNumeric) {
                return {content: withUnit(Domus.Utils.formatNumber(numeric)), alignRight: true};
            }

            return {content: withUnit(String(value)), alignRight: false};
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

            const modal = Domus.UI.openModal({title: t('domus', 'Manage year status'), content});
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
                action(year, {unitId})
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

        function getUnitWorkflowSteps(partnerTypeLabel) {
            return [
                {label: t('domus', 'Create unit')},
                {label: t('domus', 'Create {partnerType}', {partnerType: partnerTypeLabel})},
                {label: t('domus', 'Create tenancy')}
            ];
        }

        function openUnitCreateForm(defaults = {}, onCreated, modalOptions = {}) {
            Domus.Api.getProperties()
                .then(properties => {
                    const propertyOptions = [{
                        value: '',
                        label: t('domus', 'Select property')
                    }].concat((properties || []).map(p => ({
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

                    const effectiveDefaults = Object.assign({propertyId: requireProperty ? firstPropertyId : ''}, defaults);
                    const showPropertySelect = !Domus.Permission.shouldHidePropertyField(effectiveDefaults)
                        && (requireProperty || availableProperties.length > 1);
                    const defaultPropertyId = effectiveDefaults.propertyId;

                    const content = buildUnitForm(propertyOptions, effectiveDefaults, {
                        showPropertySelect,
                        requireProperty,
                        defaultPropertyId
                    });
                    const wrappedContent = typeof modalOptions.wrapContent === 'function' ? modalOptions.wrapContent(content) : content;
                    const modal = Domus.UI.openModal({
                        title: modalOptions.title || t('domus', 'Add {entity}', {entity: t('domus', 'Unit')}),
                        content: wrappedContent,
                        size: modalOptions.size
                    });
                    bindUnitForm(modal, data => Domus.Api.createUnit(data)
                            .then(created => {
                                Domus.UI.showNotification(t('domus', '{entity} created.', {entity: t('domus', 'Unit')}), 'success');
                                modal.close();
                                if (typeof onCreated === 'function') {
                                    onCreated(created);
                                } else {
                                    renderList();
                                }
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error')),
                        {requireProperty});
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }

        function openGuidedPartnerStep(unit, steps, partnerType, partnerTypeLabel, onFinished) {
            const partnerTypeConfig = {
                defaultType: partnerType,
                hideField: true,
                disabled: true
            };
            Domus.Partners.openCreateModal(
                {partnerType},
                createdPartner => {
                    openGuidedTenancyStep(unit, createdPartner, steps, onFinished);
                },
                {
                    title: t('domus', 'Create {partnerType}', {partnerType: partnerTypeLabel}),
                    successMessage: t('domus', '{entity} created.', {entity: partnerTypeLabel}),
                    partnerTypeConfig,
                    wrapContent: content => Domus.UI.buildGuidedWorkflowLayout(steps, 1, content),
                    size: 'large'
                }
            );
        }

        function openGuidedTenancyStep(unit, partner, steps, onFinished) {
            const prefill = {
                unitId: unit?.id,
                partnerIds: partner?.id ? [partner.id] : []
            };
            Domus.Tenancies.openCreateModal(
                prefill,
                created => {
                    if (Domus.Permission.isBuildingManagement()) {
                        openGuidedUnitDistributionStep(unit, steps, onFinished);
                        return;
                    }
                    finalizeGuidedUnitWorkflow(unit, onFinished, created);
                },
                Domus.Api.createTenancy,
                t('domus', 'Create tenancy'),
                null,
                {
                    useGuidedWorkflow: false,
                    wrapContent: content => Domus.UI.buildGuidedWorkflowLayout(steps, 2, content),
                    size: 'large'
                }
            );
        }

        function openGuidedUnitDistributionStep(unit, steps, onFinished) {
            Domus.Distributions.openCreateUnitValueModal(
                unit,
                null,
                {},
                {
                    allowMultiple: true,
                    onContinue: () => finalizeGuidedUnitWorkflow(unit, onFinished),
                    wrapContent: content => Domus.UI.buildGuidedWorkflowLayout(steps, 3, content),
                    size: 'large'
                }
            );
        }

        function finalizeGuidedUnitWorkflow(unit, onFinished, createdTenancy) {
            if (typeof onFinished === 'function') {
                onFinished(createdTenancy);
                return;
            }
            if (unit?.id) {
                Domus.Router.navigate('unitDetail', [unit.id]);
                return;
            }
            renderList();
        }

        function openGuidedCreateWorkflow(defaults = {}, onFinished) {
            const partnerType = Domus.Permission.getTenancyPartnerFilter();
            const partnerTypeLabel = Domus.Partners.getPartnerTypeLabel(partnerType);
            const steps = getUnitWorkflowSteps(partnerTypeLabel);
            openUnitCreateForm(
                defaults,
                createdUnit => {
                    openGuidedPartnerStep(createdUnit, steps, partnerType, partnerTypeLabel, onFinished);
                },
                {
                    title: t('domus', 'Create unit'),
                    wrapContent: content => Domus.UI.buildGuidedWorkflowLayout(steps, 0, content),
                    size: 'large'
                }
            );
        }

        function openCreateModal(defaults = {}, onCreated, options = {}) {
            if (options.useGuidedWorkflow === false) {
                openUnitCreateForm(defaults, onCreated, options);
                return;
            }
            openGuidedCreateWorkflow(defaults, onCreated);
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
            const wasHidden = panel.hasAttribute('hidden');
            panel.removeAttribute('hidden');
            body.innerHTML = '<div class="muted">' + Domus.Utils.escapeHtml(t('domus', 'Loading bookings…')) + '</div>';
            Domus.Api.getBookings({unitId, year})
                .then(bookings => {
                    body.innerHTML = Domus.Bookings.renderInline(bookings || [], {
                        refreshView: 'unitDetail',
                        refreshId: unitId
                    });
                    Domus.UI.bindRowNavigation();
                    Domus.Bookings.bindInlineTables();
                    if (wasHidden) {
                        panel.scrollIntoView({behavior: 'smooth', block: 'start'});
                    }
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

        function isValueFilled(value) {
            return value !== undefined && value !== null && value !== '';
        }

        function getUnitMasterdataStatus(unit, options = {}) {
            const includeManagementExcludedFields = options.includeManagementExcludedFields !== false;
            const showPropertySelect = options.showPropertySelect === true;
            let total = 0;
            let completed = 0;

            const addField = (value) => {
                total += 1;
                if (isValueFilled(value)) {
                    completed += 1;
                }
            };

            if (showPropertySelect) {
                addField(unit?.propertyId);
            }
            addField(unit?.label);
            addField(unit?.unitNumber);
            addField(unit?.unitType);
            if (includeManagementExcludedFields) {
                addField(unit?.landRegister);
            }
            addField(unit?.livingArea);
            addField(unit?.notes);
            if (includeManagementExcludedFields) {
                addField(unit?.buyDate);
                addField(unit?.totalCosts);
                addField(unit?.taxId);
                addField(unit?.iban);
                addField(unit?.bic);
            }

            return {completed, total};
        }

        function bindStatisticsBookingRows(unitId, options = {}) {
            const detailArea = document.getElementById('domus-unit-kpi-detail');
            if (!detailArea) {
                return;
            }
            const selectedClass = 'domus-stat-year-selected';
            const updateSelectedRow = (selectedRow) => {
                detailArea.querySelectorAll('table.domus-table tr[data-stat-year]').forEach(currentRow => {
                    currentRow.classList.toggle(selectedClass, currentRow === selectedRow);
                });
            };
            detailArea.querySelectorAll('table.domus-table tr[data-stat-year]').forEach(row => {
                row.addEventListener('click', (event) => {
                    if (event.target.closest('a') || event.target.closest('button')) {
                        return;
                    }
                    const year = row.getAttribute('data-stat-year');
                    if (!year) {
                        return;
                    }
                    updateSelectedRow(row);
                    renderUnitBookingsByYear(unitId, year);
                    renderUnitDocumentsByYear(unitId, year, options);
                });
            });
        }

        function renderDetail(id, initialTarget) {
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', {entity: t('domus', 'Unit')}));
            Domus.Api.get('/units/' + id)
                .then(unit => {
                    const distributionsPromise = Domus.Role.isBuildingMgmtView()
                        ? Domus.Distributions.loadForUnit(id).catch(() => [])
                        : Promise.resolve([]);
                    const propertyPromise = unit.propertyId
                        ? Domus.Api.getProperty(unit.propertyId).catch(() => null)
                        : Promise.resolve(null);
                    return Promise.all([
                        Promise.resolve(unit),
                        Domus.Api.getUnitStatistics(id).catch(() => null),
                        Domus.Api.getBookings({unitId: id}).catch(() => []),
                        distributionsPromise,
                        Domus.Api.getUnitPartners(id).catch(() => []),
                        propertyPromise,
                        Domus.Api.getProperties().catch(() => [])
                    ]);
                })
                .then(([unit, statistics, bookings, distributions, partners, property, properties]) => {

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
                    const filteredDistributions = Domus.Distributions.filterList(distributions, {excludeSystemDefaults: true});
                    const allTenancies = (unit.activeTenancies || []).concat(unit.historicTenancies || []);
                    const currentTenancy = (unit.activeTenancies || [])
                        .slice()
                        .sort((a, b) => {
                            const aDate = new Date(a?.startDate || 0);
                            const bDate = new Date(b?.startDate || 0);
                            return (bDate.getTime() || 0) - (aDate.getTime() || 0);
                        })[0];
                    const currentTenantPartners = currentTenancy
                        ? Domus.Partners.renderPartnerContactList(currentTenancy.partners, {fallbackName: currentTenancy.partnerName})
                        : '';
                    const currentBaseRent = currentTenancy?.baseRent;
                    const rentabilityRows = statistics?.revenue?.rows || [];
                    const latestClosedYear = getLatestClosedYear(rentabilityRows);
                    const latestYear = getLatestYear(rentabilityRows);
                    const rentabilityRow = latestClosedYear
                        ? rentabilityRows.find(row => Number(row.year) === latestClosedYear)
                        : null;
                    const rentabilityValue = rentabilityRow?.netRentab;
                    const coldRentRow = latestYear
                        ? rentabilityRows.find(row => Number(row.year) === latestYear)
                        : null;
                    const coldRentValue = coldRentRow?.rent;
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
                    const propertyOptions = [{
                        value: '',
                        label: t('domus', 'Select property')
                    }].concat((properties || []).map(p => ({
                        value: p.id,
                        label: p.name || `${t('domus', 'Property')} #${p.id}`
                    })));
                    const availableProperties = propertyOptions.slice(1);
                    const hidePropertyField = Domus.Permission.shouldHidePropertyField(unit || {});
                    const showPropertySelect = !hidePropertyField
                        && (Domus.Role.isBuildingMgmtView() || availableProperties.length > 1);
                    const masterdataStatus = getUnitMasterdataStatus(unit, {
                        showPropertySelect,
                        includeManagementExcludedFields: !Domus.Role.isBuildingMgmtView()
                    });
                    const masterdataIndicator = Domus.UI.buildCompletionIndicator(t('domus', 'Masterdata'), masterdataStatus.completed, masterdataStatus.total, {
                        id: 'domus-unit-masterdata'
                    });
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
                        {
                            label: t('domus', 'Living area'),
                            value: unit.livingArea ? `${Domus.Utils.formatAmount(unit.livingArea)} m²` : '—',
                            hint: t('domus', 'Reported size')
                        },
                        {
                            label: t('domus', 'Year'),
                            value: Domus.Utils.formatYear(Domus.state.currentYear),
                            hint: t('domus', 'Reporting context'),
                            formatValue: false
                        }
                    ]);
                    const menuActions = [
                        Domus.UI.buildIconLabelButton('domus-icon-settings', t('domus', 'Document location'), {
                            id: 'domus-unit-document-location',
                            className: 'domus-action-menu-item'
                        }),
                        Domus.UI.buildIconLabelButton('domus-icon-document', t('domus', 'Export data'), {
                            id: 'domus-unit-export',
                            className: 'domus-action-menu-item'
                        }),
                        Domus.UI.buildIconLabelButton('domus-icon-delete', t('domus', 'Delete'), {
                            id: 'domus-unit-delete',
                            className: 'domus-action-menu-item'
                        })
                    ];
                    const actionMenu = Domus.UI.buildActionMenu(menuActions, {
                        label: t('domus', 'Settings'),
                        ariaLabel: t('domus', 'Settings')
                    });
                    const contextActions = isBuildingManagement
                        ? [
                            (canManageDistributions ? '<button id="domus-unit-distribution-report">' + Domus.Utils.escapeHtml(t('domus', 'Distribution Report')) + '</button>' : '')
                        ].filter(Boolean)
                        : (isLandlord
                                ? [
                                    '<button id="domus-unit-service-charge">' + Domus.Utils.escapeHtml(t('domus', 'Create utility report')) + '</button>',
                                    '<button id="domus-unit-toggle-partners">' + Domus.Utils.escapeHtml(t('domus', 'Contacts')) + '</button>'
                                ]
                                : [
                                    (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action ? '<button id="domus-add-tenancy" data-unit-id="' + id + '">' + Domus.Utils.escapeHtml(tenancyLabels.action) + '</button>' : ''),
                                    (canManageBookings ? '<button id="domus-add-unit-booking">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', {entity: t('domus', 'Booking')})) + '</button>' : ''),
                                    (canManageDistributions ? '<button id="domus-add-unit-distribution">' + Domus.Utils.escapeHtml(t('domus', 'Add {entity}', {entity: t('domus', 'Distribution')})) + '</button>' : ''),
                                    (canManageDistributions ? '<button id="domus-unit-distribution-report">' + Domus.Utils.escapeHtml(t('domus', 'Distribution Report')) + '</button>' : ''),
                                    '<button id="domus-unit-service-charge">' + Domus.Utils.escapeHtml(t('domus', 'Create utility report')) + '</button>',
                                    (showPartners ? '<button id="domus-unit-toggle-partners">' + Domus.Utils.escapeHtml(t('domus', 'Contacts')) + '</button>' : '')
                                ]
                        ).filter(Boolean);

                    const actionRowActions = contextActions.slice();
                    if (actionMenu) {
                        actionRowActions.push(actionMenu);
                    }
                    const actionRowLabel = '<span class="domus-detail-action-label">' + Domus.Utils.escapeHtml(t('domus', 'Actions:')) + '</span>';
                    const actionRow = actionRowActions.length
                        ? '<div class="domus-detail-action-row">' + actionRowLabel + actionRowActions.join('') + '</div>'
                        : '';

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
                        '<div class="domus-hero-actions-row domus-hero-actions-indicator">' + masterdataIndicator + '</div>' +
                        '</div>' +
                        '</div>';

                    const tenanciesHeader = Domus.UI.buildSectionHeader(tenancyLabels.plural, (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action) ? {
                        id: 'domus-add-tenancy-inline',
                        title: tenancyLabels.action,
                        iconClass: 'domus-icon-add'
                    } : null);
                    const distributionsHeader = Domus.UI.buildSectionHeader(t('domus', 'Distribution'), canManageDistributions ? {
                        id: 'domus-add-unit-distribution-inline',
                        title: t('domus', 'Add {entity}', {entity: t('domus', 'Distribution')}),
                        iconClass: 'domus-icon-add'
                    } : null);
                    const bookingsHeader = canManageBookings ? Domus.UI.buildSectionHeader(t('domus', 'Bookings'), {
                        id: 'domus-add-unit-booking-inline',
                        title: t('domus', 'Add {entity}', {entity: t('domus', 'Booking')}),
                        iconClass: 'domus-icon-add'
                    }) : '';
                    const yearStatusAction = {
                        id: 'domus-unit-year-status',
                        title: t('domus', 'Manage year status'),
                        iconClass: 'domus-icon-confirm-year'
                    };
                    const statisticsHeader = Domus.UI.buildSectionHeader(t('domus', 'Revenue'), yearStatusAction);
                    const bookingEmptyState = canManageBookings ? {
                        emptyMessage: t('domus', 'There is no {entity} yet. Create the first one', {
                            entity: t('domus', 'Booking')
                        }),
                        emptyActionId: 'domus-unit-statistics-booking-create',
                        emptyIconClass: 'domus-icon-booking'
                    } : {};
                    const revenueTable = renderStatisticsTable(statistics ? statistics.revenue : null, {
                        buildRowDataset: row => {
                            const year = getStatisticsRowYear(row, statistics ? statistics.revenue : null);
                            return year ? {'stat-year': year} : null;
                        },
                        wrapPanel: false,
                        ...bookingEmptyState
                    });
                    const costTable = statistics && statistics.cost
                        ? Domus.UI.buildSectionHeader(t('domus', 'Costs')) + renderStatisticsTable(statistics.cost, {
                        buildRowDataset: row => {
                            const year = getStatisticsRowYear(row, statistics ? statistics.cost : null);
                            return year ? {'stat-year': year} : null;
                        },
                        wrapPanel: false,
                        ...bookingEmptyState
                    })
                        : '';
                    const rentabilityChartPanel = (useKpiLayout || !showRentabilityPanels) ? '' : (isLandlord ? buildRentabilityChartPanel(statistics) : '');

                    const rentabilityTrend = getRentabilityChartSeries(statistics);
                    const hasRentabilityTrend = !!(rentabilityTrend?.rentability || []).some(value => value !== null);
                    const hasColdRentTrend = !!(rentabilityTrend?.coldRent || []).some(value => value !== null);
                    const rentabilityValueLabel = rentabilityValue === undefined || rentabilityValue === null
                        ? '—'
                        : Domus.Utils.formatPercentage(rentabilityValue);
                    const coldRentFormatted = coldRentValue === undefined || coldRentValue === null
                        ? ''
                        : Domus.Utils.formatNumber(coldRentValue, {minimumFractionDigits: 0, maximumFractionDigits: 0});
                    const coldRentValueLabel = coldRentFormatted ? `€ ${coldRentFormatted}` : '—';
                    const rentabilityYearLabel = latestClosedYear
                        ? `(${Domus.Utils.formatYear(latestClosedYear)})`
                        : '';
                    const coldRentYearLabel = latestYear
                        ? `(${Domus.Utils.formatYear(latestYear)})`
                        : '';
                    const currentTenantLabel = currentTenantPartners || '—';
                    const unitDocumentPath = unit.documentPath || '';
                    const unitDocumentUrl = unitDocumentPath ? buildFilesFolderUrl(unitDocumentPath) : '';
                    const documentsOpenLink = unitDocumentUrl
                        ? '<a class="domus-kpi-documents-open" target="_blank" rel="noopener" href="' + Domus.Utils.escapeHtml(unitDocumentUrl) + '"' +
                        ' title="' + Domus.Utils.escapeHtml(t('domus', 'Open all documents')) + '">' +
                        '<span class="domus-icon domus-icon-folder" aria-hidden="true"></span>' +
                        '<span class="domus-visually-hidden">' + Domus.Utils.escapeHtml(t('domus', 'Open all documents')) + '</span>' +
                        '</a>'
                        : '<div class="domus-kpi-documents-open" title="' + Domus.Utils.escapeHtml(t('domus', 'Open all documents')) + '">' +
                        '<span class="domus-icon domus-icon-folder" aria-hidden="true"></span>' +
                        '<span class="domus-visually-hidden">' + Domus.Utils.escapeHtml(t('domus', 'Open all documents')) + '</span>' +
                        '</div>';
                    const documentsTileValue = '<div class="domus-kpi-documents">' +
                        '<div class="domus-kpi-documents-row">' +
                        documentsOpenLink +
                        '</div>' +
                        '</div>';
                    const openTaskCount = Domus.Role.isTenantView()
                        ? 0
                        : (unit.activeOpenTasks || 0);
                    const openTaskLabel = buildOpenTasksValue(openTaskCount);
                    const tasksPanel = Domus.Role.isTenantView() ? '' : Domus.Tasks.buildUnitTasksPanel();
                    const tasksPanelContent = Domus.Role.isTenantView() ? '' : Domus.Tasks.buildUnitTasksPanel({wrapPanel: false});
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
                            subline: rentabilityYearLabel,
                            chartId: 'domus-kpi-rentability-chart',
                            showChart: hasRentabilityTrend,
                            linkLabel: t('domus', 'More'),
                            detailTarget: 'revenue'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Cold rent'),
                            value: coldRentValueLabel,
                            subline: coldRentYearLabel,
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
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Documents'),
                            valueHtml: documentsTileValue,
                            showChart: false,
                            linkLabel: t('domus', 'Latest documents'),
                            detailTarget: 'documents'
                        }) +
                        '</div>'
                        : '';

                    const partnersPanel = showPartners
                        ? Domus.PartnerRelations.renderSection(partners || [], {entityType: 'unit', entityId: id, sectionTitle: t('domus', 'Contacts')})
                        : '';
                    const partnersPanelWrapper = showPartners
                        ? '<div id="domus-unit-partners-panel"' + (useKpiLayout ? ' class="domus-hidden"' : '') + '>' +
                        partnersPanel +
                        '</div>'
                        : '';

                    const kpiDetailArea = useKpiLayout
                        ? '<div class="domus-panel domus-kpi-detail" id="domus-unit-kpi-detail" hidden></div>'
                        : '';

                    const bookingsPanelInline = canManageBookings
                        ? '<div class="domus-panel-body" id="domus-unit-bookings-panel" hidden>' + bookingsHeader + '<div class="domus-panel-body" id="domus-unit-bookings-body">' +
                        Domus.Bookings.renderInline(bookings || [], {refreshView: 'unitDetail', refreshId: id}) +
                        '</div></div>'
                        : '';
                    const bookingsPanel = (!useKpiLayout && canManageBookings)
                        ? '<div class="domus-panel-body" id="domus-unit-bookings-panel">' + bookingsHeader + '<div class="domus-panel-body" id="domus-unit-bookings-body">' +
                        Domus.Bookings.renderInline(bookings || [], {refreshView: 'unitDetail', refreshId: id}) +
                        '</div></div>'
                        : '';

                    const content = useKpiLayout
                        ? '<div class="domus-detail domus-dashboard domus-unit-detail-landlord">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        actionRow +
                        kpiTiles +
                        kpiDetailArea +
                        partnersPanelWrapper +
                        '</div>'
                        : '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        actionRow +
                        stats +
                        '<div class="domus-dashboard-grid domus-dashboard-grid-single">' +
                        '<div class="domus-dashboard-main">' +
                        rentabilityChartPanel +
                        (canManageDistributions ? '<div class="domus-panel">' + distributionsHeader + '<div class="domus-panel-body" id="domus-unit-distributions">' +
                            Domus.Distributions.renderTable(filteredDistributions, {
                                showUnitValue: true,
                                hideConfig: true,
                                excludeSystemDefaults: true,
                                wrapPanel: false
                            }) + '</div></div>' : '') +
                        '<div class="domus-panel">' + tenanciesHeader + '<div class="domus-panel-body">' +
                        Domus.Tenancies.renderInline(allTenancies, {
                            hideUnitColumn: true,
                            statusAsBadge: true
                        }) + '</div></div>' +
                        tasksPanel +
                        partnersPanelWrapper +
                        (showRentabilityPanels ? '<div class="domus-panel">' + statisticsHeader + '<div class="domus-panel-body">' +
                            revenueTable + costTable + '</div></div>' : '') +
                        (canManageBookings ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                            Domus.Bookings.renderInline(bookings || [], {
                                refreshView: 'unitDetail',
                                refreshId: id
                            }) + '</div></div>' : '') +
                        '</div>' +
                        '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    Domus.UI.bindRowNavigation();
                    Domus.Bookings.bindInlineTables();
                    Domus.UI.bindActionMenus();
                    Domus.UI.bindCollapsibles();
                    if (!useKpiLayout) {
                        bindYearStatusAction(id, statistics);
                    }
                    Domus.Partners.bindContactActions();
                    if (canManageDistributions && !useKpiLayout) {
                        Domus.Distributions.bindTable('domus-unit-distributions', filteredDistributions, {
                            mode: 'unit',
                            onUnitEdit: (distribution) => Domus.Distributions.openCreateUnitValueModal(unit, () => renderDetail(id), {distributionKeyId: distribution?.id})
                        });
                    }
                    if (showPartners) {
                        Domus.PartnerRelations.bindSection({
                            entityType: 'unit',
                            entityId: id,
                            onRefresh: () => renderDetail(id)
                        });
                    }
                    if (useKpiLayout) {
                        renderKpiTileCharts(statistics);
                        const costDetailTable = renderStatisticsTable(statistics ? statistics.cost : null, {
                            ...bookingEmptyState
                        });
                        const detailMap = {
                            tasks: tasksPanel,
                            revenue: buildKpiDetailPanel(t('domus', 'Revenue'), revenueTable, yearStatusAction) + bookingsPanelInline,
                            cost: buildKpiDetailPanel(t('domus', 'Costs'), costDetailTable) + bookingsPanelInline,
                            tenancies: buildKpiDetailPanel(tenancyLabels.plural, Domus.Tenancies.renderInline(allTenancies, {
                                hideUnitColumn: true,
                                statusAsBadge: true,
                                emptyMessage: t('domus', 'There is no {entity} yet. Create the first one', {
                                    entity: tenancyLabels.plural
                                }),
                                emptyActionId: 'domus-unit-tenancies-empty-create',
                                emptyIconClass: 'domus-icon-tenancy'
                            }), (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action) ? {
                                id: 'domus-add-tenancy-inline',
                                title: tenancyLabels.action,
                                iconClass: 'domus-icon-add'
                            } : null),
                            documents: buildKpiDetailPanel(t('domus', 'Latest documents'), Domus.Documents.renderLatestList('unit', id, {
                                defer: true,
                                pageSize: 10
                            }))
                        };
                        bindKpiDetailArea(detailMap, (target) => {
                            document.getElementById('domus-add-tenancy-inline')?.addEventListener('click', () => {
                                Domus.Tenancies.openCreateModal({unitId: id}, () => renderDetail(id));
                            });
                            document.getElementById('domus-unit-tenancies-empty-create')?.addEventListener('click', () => {
                                Domus.Tenancies.openCreateModal({unitId: id}, () => renderDetail(id));
                            });
                            if (target === 'revenue' || target === 'cost') {
                                document.getElementById('domus-unit-statistics-booking-create')?.addEventListener('click', () => {
                                    Domus.Bookings.openCreateModal({
                                        propertyId: unit?.propertyId,
                                        unitId: id
                                    }, () => renderDetail(id), {
                                        accountFilter: (nr) => String(nr).startsWith('2'),
                                        hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                                    });
                                });
                            }
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
                            if (target === 'documents') {
                                Domus.Documents.loadLatestList('unit', id, {pageSize: 10});
                            }
                            bindStatisticsBookingRows(id, {showLinkAction: documentActionsEnabled});
                            Domus.Bookings.bindInlineTables();
                        }, {
                            initialTarget: initialTarget
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
            const detailsBtn = document.getElementById('domus-unit-masterdata');
            const deleteBtn = document.getElementById('domus-unit-delete');
            const exportBtn = document.getElementById('domus-unit-export');
            const partnersToggleBtn = document.getElementById('domus-unit-toggle-partners');
            const partnersPanel = document.getElementById('domus-unit-partners-panel');

            detailsBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                openUnitModal(id, 'view');
            });
            document.getElementById('domus-unit-document-location')?.addEventListener('click', () => {
                openDocumentLocationModal(unit);
            });
            deleteBtn?.addEventListener('click', () => {
                Domus.Api.getUnitDeletionSummary(id)
                    .then(summary => openUnitDeleteModal(unit, summary, () => {
                        Domus.Api.deleteUnit(id)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', '{entity} deleted.', {entity: t('domus', 'Unit')}), 'success');
                                renderList();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'));
                    }))
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
            exportBtn?.addEventListener('click', () => openExportModal(id));
            partnersToggleBtn?.addEventListener('click', () => {
                if (!partnersPanel) {
                    return;
                }
                partnersPanel.classList.toggle('domus-hidden');
                if (!partnersPanel.classList.contains('domus-hidden')) {
                    partnersPanel.scrollIntoView({behavior: 'smooth', block: 'start'});
                }
            });

            document.getElementById('domus-add-tenancy')?.addEventListener('click', () => {
                Domus.Tenancies.openCreateModal({unitId: id}, () => renderDetail(id));
            });
            document.getElementById('domus-add-tenancy-inline')?.addEventListener('click', () => {
                Domus.Tenancies.openCreateModal({unitId: id}, () => renderDetail(id));
            });
            document.getElementById('domus-add-unit-booking')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({propertyId: unit?.propertyId, unitId: id}, () => renderDetail(id), {
                    accountFilter: (nr) => String(nr).startsWith('2'),
                    hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                });
            });
            document.getElementById('domus-add-unit-booking-inline')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({propertyId: unit?.propertyId, unitId: id}, () => renderDetail(id), {
                    accountFilter: (nr) => String(nr).startsWith('2'),
                    hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                });
            });
            document.getElementById('domus-unit-statistics-booking-create')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({propertyId: unit?.propertyId, unitId: id}, () => renderDetail(id), {
                    accountFilter: (nr) => String(nr).startsWith('2'),
                    hidePropertyField: Domus.Role.getCurrentRole() === 'landlord'
                });
            });
            document.getElementById('domus-add-unit-buying-price')?.addEventListener('click', () => {
                Domus.Bookings.openCreateModal({propertyId: unit?.propertyId, unitId: id}, () => renderDetail(id), {
                    accountFilter: (nr) => String(nr).startsWith('3'),
                    title: t('domus', 'Add {entity}', {entity: t('domus', 'Buying price')}),
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

        function openDocumentLocationModal(unit) {
            const currentPath = unit.documentPath || '';
            const pickerId = 'domus-unit-document-location-picker';
            const displayId = 'domus-unit-document-location-display';
            const rows = [
                Domus.UI.buildFormRow({
                    label: t('domus', 'Current location'),
                    content: '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(currentPath || '—') + '</div>'
                }),
                Domus.UI.buildFormRow({
                    label: t('domus', 'Folder path'),
                    required: true,
                    content: '<div class="domus-doc-picker-row">' +
                        '<button type="button" class="domus-ghost" id="' + Domus.Utils.escapeHtml(pickerId) + '">' + Domus.Utils.escapeHtml(t('domus', 'Select folder')) + '</button>' +
                        '<div class="domus-doc-picker-display muted" id="' + Domus.Utils.escapeHtml(displayId) + '">' + Domus.Utils.escapeHtml(currentPath || t('domus', 'No folder selected')) + '</div>' +
                        '<input type="hidden" name="documentPath" value="' + Domus.Utils.escapeHtml(currentPath) + '" required>' +
                        '</div>'
                })
            ];
            const modal = Domus.UI.openModal({
                title: t('domus', 'Change document location'),
                content: '<div class="domus-form">' +
                    '<form id="domus-unit-document-location-form">' +
                    Domus.UI.buildFormTable(rows) +
                    '<div class="domus-form-actions">' +
                    '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                    '<button type="button" id="domus-unit-document-location-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                    '</div>' +
                    '</form>' +
                    '</div>'
            });

            const form = modal.modalEl.querySelector('#domus-unit-document-location-form');
            const documentPathInput = form?.querySelector('input[name="documentPath"]');
            const pickerButton = modal.modalEl.querySelector('#' + pickerId);
            const pickerDisplay = modal.modalEl.querySelector('#' + displayId);
            if (pickerButton && typeof OC !== 'undefined' && OC.dialogs?.filepicker) {
                pickerButton.addEventListener('click', function (e) {
                    e.preventDefault();
                    OC.dialogs.filepicker(t('domus', 'Select folder'), function (path) {
                        if (documentPathInput) {
                            documentPathInput.value = path || '';
                        }
                        if (pickerDisplay) {
                            pickerDisplay.textContent = path || t('domus', 'No folder selected');
                        }
                    }, false, 'httpd/unix-directory', true, 1);
                });
            }
            form?.addEventListener('submit', function (e) {
                e.preventDefault();
                const value = documentPathInput?.value?.trim() || '';
                if (!value) {
                    Domus.UI.showNotification(t('domus', 'Document location is required.'), 'error');
                    return;
                }
                Domus.Api.updateUnit(unit.id, {documentPath: value})
                    .then(() => {
                        Domus.UI.showNotification(t('domus', 'Document location updated.'), 'success');
                        modal.close();
                        renderDetail(unit.id);
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
            modal.modalEl.querySelector('#domus-unit-document-location-cancel')?.addEventListener('click', modal.close);
        }

        function openUnitModal(id, mode = 'edit') {
            Promise.all([
                Domus.Api.get('/units/' + id),
                Domus.Api.getProperties()
            ])
                .then(([unit, properties]) => {
                    const propertyOptions = [{
                        value: '',
                        label: t('domus', 'Select property')
                    }].concat((properties || []).map(p => ({
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
                        title: mode === 'view' ? t('domus', 'Unit details') : t('domus', 'Edit {entity}', {entity: t('domus', 'Unit')}),
                        content: buildUnitForm(propertyOptions, unit, {
                            showPropertySelect,
                            requireProperty,
                            defaultPropertyId,
                            mode
                        }),
                        headerActions
                    });
                    bindUnitForm(modal, data => Domus.Api.updateUnit(id, data)
                            .then(() => {
                                Domus.UI.showNotification(t('domus', '{entity} updated.', {entity: t('domus', 'Unit')}), 'success');
                                modal.close();
                                renderDetail(id);
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error')),
                        {requireProperty, mode, hidePropertyField});
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

        function openUnitDeleteModal(unit, summary, onConfirm) {
            const expectedTitle = unit?.label || '';
            const content = document.createElement('div');
            const warning = document.createElement('p');
            warning.className = 'domus-modal-message';
            warning.textContent = `${t('domus', 'Deleting this unit will remove the linked data listed below.')} ${t('domus', 'This action cannot be undone.')}`;
            content.appendChild(warning);

            const summaryTitle = document.createElement('h4');
            summaryTitle.textContent = t('domus', 'Linked objects');
            content.appendChild(summaryTitle);

            const summaryList = document.createElement('ul');
            summaryList.className = 'domus-delete-summary';
            const summaryItems = [
                {label: t('domus', 'Tasks'), value: summary?.tasks},
                {label: t('domus', 'Task steps'), value: summary?.taskSteps},
                {label: t('domus', 'Tenancies'), value: summary?.tenancies},
                {label: t('domus', 'Bookings'), value: summary?.bookings},
                ...(Domus.Role.isBuildingMgmtView()
                    ? [{label: t('domus', 'Distribution values'), value: summary?.distributions}]
                    : []),
                {label: t('domus', 'Document links'), value: summary?.documentLinks},
                {label: t('domus', 'Year status'), value: summary?.yearStatus}
            ];
            summaryItems.forEach(item => {
                const listItem = document.createElement('li');
                const label = document.createElement('span');
                label.className = 'domus-delete-summary-label';
                label.textContent = item.label;
                const value = document.createElement('span');
                value.className = 'domus-delete-summary-value';
                value.textContent = String(item.value || 0);
                listItem.appendChild(label);
                listItem.appendChild(value);
                summaryList.appendChild(listItem);
            });
            content.appendChild(summaryList);

            const exportHint = document.createElement('p');
            exportHint.className = 'domus-modal-message domus-delete-export';
            const exportActionLabel = t('domus', 'Export');
            const exportHintText = t('domus', '{action} a backup before deleting this unit.', {action: exportActionLabel});
            const exportTextParts = exportHintText.split(exportActionLabel);
            const exportLink = document.createElement('button');
            exportLink.type = 'button';
            exportLink.id = 'domus-unit-delete-export';
            exportLink.className = 'domus-link domus-link-underline';
            exportLink.textContent = exportActionLabel;
            exportLink.addEventListener('click', () => openExportModal(unit?.id));
            if (exportTextParts.length === 2) {
                exportHint.appendChild(document.createTextNode(exportTextParts[0]));
                exportHint.appendChild(exportLink);
                exportHint.appendChild(document.createTextNode(exportTextParts[1]));
            } else {
                exportHint.textContent = exportHintText;
                exportHint.appendChild(document.createTextNode(' '));
                exportHint.appendChild(exportLink);
            }
            content.appendChild(exportHint);

            const form = document.createElement('form');
            form.className = 'domus-form';
            form.addEventListener('submit', event => event.preventDefault());

            const inputId = 'domus-unit-delete-confirm-title';
            const row = document.createElement('div');
            row.className = 'domus-form-row domus-form-row-full';
            const labelWrap = document.createElement('div');
            labelWrap.className = 'domus-form-label';
            labelWrap.classList.add('domus-delete-confirm-field');
            const label = document.createElement('label');
            label.setAttribute('for', inputId);
            label.textContent = t('domus', 'Type the unit title to confirm.');
            const help = document.createElement('div');
            help.className = 'domus-form-help';
            help.textContent = t('domus', 'Expected title: {title}', {title: expectedTitle});
            labelWrap.appendChild(label);
            labelWrap.appendChild(help);
            const valueWrap = document.createElement('div');
            valueWrap.className = 'domus-form-value';
            valueWrap.classList.add('domus-delete-confirm-field');
            const input = document.createElement('input');
            input.type = 'text';
            input.id = inputId;
            input.required = true;
            input.autocomplete = 'off';
            valueWrap.appendChild(input);
            row.appendChild(labelWrap);
            row.appendChild(valueWrap);
            form.appendChild(row);
            content.appendChild(form);

            const footer = document.createElement('div');
            footer.className = 'domus-modal-footer';
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.textContent = t('domus', 'Cancel');
            const confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.textContent = t('domus', 'Delete');
            confirmButton.className = 'primary';
            confirmButton.disabled = true;
            footer.appendChild(cancelButton);
            footer.appendChild(confirmButton);
            content.appendChild(footer);

            let modal;
            const closeModal = () => modal?.close();

            const checkInput = () => {
                const value = input.value.trim();
                confirmButton.disabled = value !== expectedTitle.trim();
            };
            input.addEventListener('input', checkInput);
            checkInput();

            modal = Domus.UI.openModal({
                title: t('domus', 'Delete {entity}?', {entity: t('domus', 'Unit')}),
                content
            });
            cancelButton.addEventListener('click', closeModal);
            confirmButton.addEventListener('click', () => {
                closeModal();
                if (typeof onConfirm === 'function') {
                    onConfirm();
                }
            });
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
                form?.addEventListener('submit', function (e) {
                    e.preventDefault();
                    modalContext.close();
                });
                return;
            }

            cancel?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function (e) {
                e.preventDefault();
                const data = {};
                Array.prototype.forEach.call(form.elements, el => {
                    if (el.name) data[el.name] = el.value;
                });
                if (options.requireProperty && !data.propertyId) {
                    Domus.UI.showNotification(t('domus', 'Property is required.'), 'error');
                    return;
                }
                if (!data.label) {
                    Domus.UI.showNotification(t('domus', 'Label is required.'), 'error');
                    return;
                }
                if (data.iban) {
                    const normalizedIban = Domus.Utils.normalizeIban(data.iban);
                    if (!Domus.Utils.isValidIban(normalizedIban)) {
                        Domus.UI.showNotification(t('domus', 'IBAN is invalid.'), 'error');
                        return;
                    }
                    data.iban = normalizedIban;
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
                inputField('label', t('domus', 'Label'), unit?.label || '', {required: true}),
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

        return {
            renderList,
            renderDetail,
            renderListInline,
            renderStatisticsTable,
            openCreateModal,
            openYearStatusModal
        };
    })();
    Domus.UnitSettlements = (function () {
        function openModal(unitId, onComplete) {
            const defaultYear = (new Date()).getFullYear() - 1;
            let selectedYear = defaultYear;
            let selectedGroup = null;
            let settlements = [];
            let provisionalMap = {};
            let availableYears = [];
            let isLoadingYears = false;
            const steps = [
                { label: t('domus', 'Select year') },
                { label: t('domus', 'Preview') },
                { label: t('domus', 'Create') }
            ];
            let currentStep = 0;

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

            const container = document.createElement('div');

            const modal = Domus.UI.openModal({
                title: t('domus', 'Create utility report'),
                content: container,
                size: 'large'
            });

            function buildYearOptions(defaultYear, statistics) {
                const years = collectStatisticsYears(statistics);
                if (!years.includes(defaultYear)) {
                    years.push(defaultYear);
                }
                return years.sort((a, b) => b - a);
            }

            function renderYearOptions(years, provisionalMap, yearSelect) {
                yearSelect.innerHTML = years.map(year => {
                    const isProvisional = provisionalMap[year] !== undefined ? provisionalMap[year] : true;
                    const label = isProvisional
                        ? `${year} (${t('domus', 'provisional')})`
                        : String(year);
                    return '<option value="' + Domus.Utils.escapeHtml(String(year)) + '">' + Domus.Utils.escapeHtml(label) + '</option>';
                }).join('');
                if (!years.includes(selectedYear)) {
                    selectedYear = years[0];
                }
                yearSelect.value = String(selectedYear);
            }

            function ensureYearOptions(yearSelect) {
                if (availableYears.length) {
                    renderYearOptions(availableYears, provisionalMap, yearSelect);
                    return;
                }
                if (isLoadingYears) {
                    return;
                }
                isLoadingYears = true;
                yearSelect.innerHTML = '<option>' + Domus.Utils.escapeHtml(t('domus', 'Loading…')) + '</option>';
                Domus.Api.getUnitStatistics(unitId)
                    .then(statistics => {
                        provisionalMap = collectProvisionalMap(statistics);
                        availableYears = buildYearOptions(defaultYear, statistics);
                    })
                    .catch(() => {
                        availableYears = buildYearOptions(defaultYear);
                    })
                    .finally(() => {
                        isLoadingYears = false;
                        renderYearOptions(availableYears, provisionalMap, yearSelect);
                    });
            }

            function renderTable(tableContainer) {
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
                    t('domus', 'Tenant'),
                    t('domus', 'Prepayment'),
                    t('domus', 'Maintenance fee'),
                    t('domus', 'Property tax'),
                    t('domus', 'Saldo')
                ], rows, { wrapPanel: false });

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

            function loadSettlements(tableContainer) {
                tableContainer.innerHTML = '<div>' + Domus.Utils.escapeHtml(t('domus', 'Loading…')) + '</div>';
                Domus.Api.getUnitSettlements(unitId, selectedYear)
                    .then(data => {
                        settlements = (data || []).map(item => Object.assign({groupId: item.groupId || String(item.partnerId)}, item));
                        selectedGroup = settlements[0]?.groupId || null;
                        renderTable(tableContainer);
                    })
                    .catch(err => {
                        tableContainer.innerHTML = '<div class="domus-error">' + Domus.Utils.escapeHtml(err.message || t('domus', 'An error occurred')) + '</div>';
                    });
            }

            function getSelectedSettlement() {
                return settlements.find(item => item.groupId === selectedGroup);
            }

            function renderYearStep() {
                return '<div class="domus-form">' +
                    '<label>' + Domus.Utils.escapeHtml(t('domus', 'Year')) + ' ' +
                    '<select id="domus-settlement-year"></select>' +
                    '</label>' +
                    '</div>' +
                    '<div class="domus-modal-footer">' +
                    '<button id="domus-settlement-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                    '<button id="domus-settlement-continue" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Continue')) + '</button>' +
                    '</div>';
            }

            function renderPreviewStep() {
                const info = Domus.UI.buildInfoList([
                    { label: t('domus', 'Year'), value: selectedYear }
                ]);
                return info +
                    '<div id="domus-settlement-table"></div>' +
                    '<div class="domus-modal-footer">' +
                    '<button id="domus-settlement-back">' + Domus.Utils.escapeHtml(t('domus', 'Back')) + '</button>' +
                    '<button id="domus-settlement-next" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Continue')) + '</button>' +
                    '</div>';
            }

            function renderCreateStep() {
                const selected = getSelectedSettlement();
                if (!selected) {
                    return '<div class="domus-empty-state">' +
                        Domus.Utils.escapeHtml(t('domus', 'Select a tenant first.')) +
                        '</div>' +
                        '<div class="domus-modal-footer">' +
                        '<button id="domus-settlement-back">' + Domus.Utils.escapeHtml(t('domus', 'Back')) + '</button>' +
                        '</div>';
                }

                let saldoText = t('domus', 'Credit');

                if (selected.saldo < 0) {
                    saldoText = t('domus', 'Pay back');
                }

                const info = Domus.UI.buildInfoList([
                    { label: t('domus', 'Tenant'), value: selected.partnerName || '' },
                    { label: t('domus', 'Year'), value: selectedYear },
                    { label: t('domus', 'Prepayment'), value: Domus.Utils.formatCurrency(selected.serviceCharge) },
                    { label: t('domus', 'Maintenance fee'), value: Domus.Utils.formatCurrency(selected.houseFee) },
                    { label: t('domus', 'Property tax'), value: Domus.Utils.formatCurrency(selected.propertyTax) },
                    { label: saldoText, value: Domus.Utils.formatCurrency(selected.saldo) }
                ]);
                return '<div class="domus-form">' + info + '</div>' +
                    '<div class="domus-modal-footer">' +
                    '<button id="domus-settlement-back">' + Domus.Utils.escapeHtml(t('domus', 'Back')) + '</button>' +
                    '<button id="domus-create-settlement" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Create')) + '</button>' +
                    '</div>';
            }

            function renderStep() {
                let content = '';
                if (currentStep === 0) {
                    content = renderYearStep();
                } else if (currentStep === 1) {
                    content = renderPreviewStep();
                } else {
                    content = renderCreateStep();
                }
                container.innerHTML = Domus.UI.buildGuidedWorkflowLayout(steps, currentStep, content);

                if (currentStep === 0) {
                    const yearSelect = container.querySelector('#domus-settlement-year');
                    ensureYearOptions(yearSelect);
                    yearSelect.addEventListener('change', () => {
                        selectedYear = parseInt(yearSelect.value, 10);
                    });
                    container.querySelector('#domus-settlement-cancel')?.addEventListener('click', modal.close);
                    container.querySelector('#domus-settlement-continue')?.addEventListener('click', () => {
                        selectedYear = parseInt(yearSelect.value, 10);
                        currentStep = 1;
                        renderStep();
                    });
                    return;
                }

                if (currentStep === 1) {
                    const tableContainer = container.querySelector('#domus-settlement-table');
                    loadSettlements(tableContainer);
                    container.querySelector('#domus-settlement-back')?.addEventListener('click', () => {
                        currentStep = 0;
                        renderStep();
                    });
                    container.querySelector('#domus-settlement-next')?.addEventListener('click', () => {
                        if (!getSelectedSettlement()) {
                            Domus.UI.showNotification(t('domus', 'Select a partner first.'), 'error');
                            return;
                        }
                        currentStep = 2;
                        renderStep();
                    });
                    return;
                }

                container.querySelector('#domus-settlement-back')?.addEventListener('click', () => {
                    currentStep = 1;
                    renderStep();
                });
                const createBtn = container.querySelector('#domus-create-settlement');
                if (createBtn) {
                    createBtn.addEventListener('click', () => {
                        const selected = getSelectedSettlement();
                        if (!selected) {
                            Domus.UI.showNotification(t('domus', 'Select a partner first.'), 'error');
                            return;
                        }
                        createBtn.disabled = true;
                        Domus.Api.createUnitSettlementReport(unitId, {year: selectedYear, partnerId: selected.partnerId})
                            .then(() => {
                                Domus.UI.showNotification(t('domus', '{entity} created.', {entity: t('domus', 'Report')}), 'success');
                                modal.close();
                                onComplete?.();
                            })
                            .catch(err => Domus.UI.showNotification(err.message, 'error'))
                            .finally(() => {
                                createBtn.disabled = false;
                            });
                    });
                }
            }

            renderStep();
        }

        return {openModal};
    })();

    /**
     * Partners view
     */
})();

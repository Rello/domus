(function () {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Units = (function () {
        let rentabilityChartInstance = null;
        let kpiChartInstances = [];
        let kpiPartnerNameFitRafId = null;
        let kpiPartnerNameResizeBound = false;
        const statisticsPaginationState = {};
        const statisticsTablePageSize = 10;
        const listState = {
            units: [],
            query: ''
        };

        function getTenancySearchValues(tenancy) {
            const values = [tenancy?.partnerName];
            (tenancy?.partners || []).forEach(partner => {
                values.push(partner?.name);
                values.push(partner?.email);
                values.push(partner?.phone);
            });
            return values;
        }

        function getUnitSearchText(unit) {
            const values = [
                unit?.label,
                unit?.propertyName,
                unit?.street,
                unit?.zip,
                unit?.city,
                unit?.country,
                unit?.unitNumber,
                unit?.landRegister,
                unit?.unitType,
                unit?.taxId,
                unit?.notes
            ];
            (unit?.activeTenancies || []).forEach(tenancy => values.push(...getTenancySearchValues(tenancy)));
            (unit?.historicTenancies || []).forEach(tenancy => values.push(...getTenancySearchValues(tenancy)));
            return Domus.Utils.normalizeSearchValue(values.filter(Boolean).join(' '));
        }

        function getSortedUnits(units) {
            return (units || [])
                .slice()
                .sort((a, b) => {
                    const propertyA = (a?.propertyName || '').toLowerCase();
                    const propertyB = (b?.propertyName || '').toLowerCase();
                    if (propertyA < propertyB) {
                        return -1;
                    }
                    if (propertyA > propertyB) {
                        return 1;
                    }
                    const labelA = (a?.label || '').toLowerCase();
                    const labelB = (b?.label || '').toLowerCase();
                    if (labelA < labelB) {
                        return -1;
                    }
                    if (labelA > labelB) {
                        return 1;
                    }
                    return 0;
                });
        }

        function filterUnits(units, query) {
            const normalizedQuery = Domus.Utils.normalizeSearchValue(query);
            if (!normalizedQuery) {
                return getSortedUnits(units);
            }
            return getSortedUnits(units).filter(unit => getUnitSearchText(unit).includes(normalizedQuery));
        }

        function updateNavSearch() {
            Domus.Navigation.setPrimarySearch({
                views: ['units'],
                label: t('domus', 'Search units'),
                placeholder: t('domus', 'Search units, addresses or renters'),
                value: listState.query,
                onInput: value => {
                    listState.query = value || '';
                    renderListContent();
                }
            });
        }

        function buildOccupancyBadge(value) {
            const normalized = String(value || '').toLowerCase();
            if (normalized === 'occupied') {
                return '<span class="domus-badge domus-badge-occupied">' + Domus.Utils.escapeHtml(t('domus', 'Occupied')) + '</span>';
            }
            if (normalized === 'vacant') {
                return '<span class="domus-badge domus-badge-alert domus-badge-vacant">' + Domus.Utils.escapeHtml(t('domus', 'Vacant')) + '</span>';
            }
            return '';
        }

        function buildUnitAddress(unit) {
            const parts = [unit?.street, unit?.city]
                .filter(Boolean)
                .map(part => Domus.Utils.escapeHtml(part));
            if (!parts.length) {
                return Domus.Utils.escapeHtml(unit?.propertyName || t('domus', 'No property assigned'));
            }
            return '<span class="domus-icon domus-icon-location domus-overview-subtitle-icon" aria-hidden="true"></span>' +
                '<span class="domus-overview-subtitle-text">' + parts.join(', ') + '</span>';
        }

        function getUnitOccupancyStatus(unit) {
            return (unit?.activeTenancies || []).length > 0 ? 'occupied' : 'vacant';
        }

        function getUnitMonthlyBaseRent(unit) {
            return (unit?.activeTenancies || []).reduce((sum, tenancy) => {
                return sum + (Number(tenancy?.baseRent) || 0);
            }, 0);
        }

        function getUnitRentability(unit) {
            const annualBaseRent = getUnitMonthlyBaseRent(unit) * 12;
            const totalCosts = Number(unit?.totalCosts);
            if (!annualBaseRent || !totalCosts || Number.isNaN(totalCosts) || totalCosts <= 0) {
                return '';
            }
            return Domus.Utils.formatPercentage(annualBaseRent / totalCosts);
        }

        function buildUnitCard(unit) {
            const occupancyStatus = getUnitOccupancyStatus(unit);
            const address = buildUnitAddress(unit);
            const isLandlord = Domus.Role.getCurrentRole() === 'landlord';
            const stats = isLandlord
                ? [
                    {
                        label: t('domus', 'Living area'),
                        value: Domus.Utils.escapeHtml(unit?.livingArea ? `${Domus.Utils.formatNumber(unit.livingArea, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m²` : '—')
                    },
                    {
                        label: t('domus', 'Monthly base rent'),
                        value: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(getUnitMonthlyBaseRent(unit)) || '€ 0.00')
                    },
                    {
                        label: t('domus', 'Rentability'),
                        value: Domus.Utils.escapeHtml(getUnitRentability(unit) || '—')
                    }
                ]
                : [
                    {
                        label: t('domus', 'Property'),
                        value: Domus.Utils.escapeHtml(unit?.propertyName || '—')
                    },
                    {
                        label: t('domus', 'Number'),
                        value: Domus.Utils.escapeHtml(unit?.unitNumber || '—')
                    },
                    {
                        label: t('domus', 'Monthly base rent'),
                        value: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(getUnitMonthlyBaseRent(unit)) || '€ 0.00')
                    }
                ];

            return {
                imageHtml: Domus.UI.buildEntityImage('unit', unit, {
                    variant: 'overview',
                    alt: unit.label || t('domus', 'Unit')
                }),
                title: Domus.Utils.escapeHtml(unit.label || ''),
                subtitle: address,
                metaTitle: '',
                metaHtml: unit?.unitType
                    ? '<span class="domus-badge domus-badge-outline">' + Domus.Utils.escapeHtml(unit.unitType) + '</span>'
                    : '<span class="domus-overview-meta-empty">—</span>',
                statusHtml: buildOccupancyBadge(occupancyStatus),
                badgesHtml: !isLandlord && unit?.propertyName
                    ? '<span class="domus-badge domus-badge-muted">' + Domus.Utils.escapeHtml(unit.propertyName) + '</span>'
                    : '',
                stats,
                footerHtml: '',
                dataset: unit.id ? { navigate: 'unitDetail', args: unit.id } : null
            };
        }

        function resetStatisticsPaginationState() {
            Object.keys(statisticsPaginationState).forEach(key => {
                delete statisticsPaginationState[key];
            });
        }

        function getStatisticsPaginationWrapperId(paginationKey) {
            const safeKey = String(paginationKey || '').replace(/[^a-zA-Z0-9-]/g, '-');
            return 'domus-unit-statistics-' + safeKey;
        }

        function bindStatisticsPagination(root = document) {
            const container = root || document;
            container.querySelectorAll('[data-domus-stat-pagination]').forEach(wrapper => {
                const paginationKey = wrapper.getAttribute('data-domus-stat-pagination');
                if (!paginationKey || !statisticsPaginationState[paginationKey]) {
                    return;
                }
                const state = statisticsPaginationState[paginationKey];
                Domus.UI.bindPagination(wrapper, {
                    currentPage: state.currentPage || 1,
                    onPageChange: nextPage => {
                        renderStatisticsTablePage(paginationKey, nextPage);
                    }
                });
            });
        }

        function resetStatisticsPaginationForContainer(container) {
            if (!container) {
                return;
            }
            container.querySelectorAll('[data-domus-stat-pagination]').forEach(wrapper => {
                const paginationKey = wrapper.getAttribute('data-domus-stat-pagination');
                if (!paginationKey || !statisticsPaginationState[paginationKey]) {
                    return;
                }
                statisticsPaginationState[paginationKey].currentPage = 1;
            });
        }

        function renderStatisticsTablePage(paginationKey, page) {
            const state = statisticsPaginationState[paginationKey];
            if (!state) {
                return;
            }
            const wrapper = document.getElementById(getStatisticsPaginationWrapperId(paginationKey));
            if (!wrapper) {
                return;
            }
            const markup = renderStatisticsTable(state.statistics, {
                ...state.options,
                page: page,
                wrapPanel: false
            });
            wrapper.outerHTML = markup;
            Domus.UI.bindRowNavigation();
            bindStatisticsPagination();
            const nextState = statisticsPaginationState[paginationKey];
            if (nextState && typeof nextState.options?.onPageRender === 'function') {
                nextState.options.onPageRender();
            }
        }

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

        function fitKpiPartnerNames() {
            const defaultFontSize = 25;
            const minFontSize = 14;
            const names = document.querySelectorAll('.domus-kpi-value .domus-partner-name');
            names.forEach(nameEl => {
                nameEl.style.fontSize = `${defaultFontSize}px`;
                nameEl.style.whiteSpace = 'nowrap';
                nameEl.style.wordBreak = 'normal';
                nameEl.style.overflowWrap = 'normal';
                const availableWidth = nameEl.clientWidth;
                if (!availableWidth) {
                    return;
                }
                let fontSize = defaultFontSize;
                while (fontSize > minFontSize && nameEl.scrollWidth > availableWidth) {
                    fontSize -= 1;
                    nameEl.style.fontSize = `${fontSize}px`;
                }
                if (nameEl.scrollWidth > availableWidth) {
                    nameEl.style.whiteSpace = 'normal';
                    nameEl.style.wordBreak = 'break-word';
                    nameEl.style.overflowWrap = 'anywhere';
                }
            });
        }

        function scheduleKpiPartnerNameFit() {
            if (kpiPartnerNameFitRafId !== null) {
                cancelAnimationFrame(kpiPartnerNameFitRafId);
            }
            kpiPartnerNameFitRafId = requestAnimationFrame(() => {
                kpiPartnerNameFitRafId = null;
                fitKpiPartnerNames();
            });
        }

        function bindKpiPartnerNameFitResize() {
            if (kpiPartnerNameResizeBound) {
                return;
            }
            kpiPartnerNameResizeBound = true;
            window.addEventListener('resize', () => {
                if (Domus.state.currentView === 'unitDetail') {
                    scheduleKpiPartnerNameFit();
                }
            });
        }

        function buildKpiDetailPanel(title, body, action) {
            const header = title ? Domus.UI.buildSectionHeader(title, action) : '';
            return header + '<div class="domus-panel-body">' + body + '</div>';
        }

        function buildKpiDetailShell(content) {
            return '<div class="domus-kpi-detail-shell">' +
                '<button type="button" class="domus-kpi-detail-close domus-icon-only-button" aria-label="' + Domus.Utils.escapeHtml(t('domus', 'Exit fullscreen')) + '" title="' + Domus.Utils.escapeHtml(t('domus', 'Exit fullscreen')) + '">' +
                '<span class="domus-icon domus-icon-fullscreen-exit" aria-hidden="true"></span>' +
                '</button>' +
                '<div class="domus-kpi-detail-content">' + content + '</div>' +
                '</div>';
        }

        function bindKpiDetailArea(detailMap, onRender, options = {}) {
            const detailArea = document.getElementById('domus-unit-kpi-detail');
            if (!detailArea) {
                return;
            }
            const detailView = detailArea.closest('.domus-unit-detail-landlord');
            const routeId = options.routeId ? String(options.routeId) : '';

            const clearTransitionState = () => {
                detailArea.classList.remove('domus-kpi-detail-opening', 'domus-kpi-detail-opening-active');
                detailArea.style.removeProperty('--domus-kpi-detail-from-x');
                detailArea.style.removeProperty('--domus-kpi-detail-from-y');
                detailArea.style.removeProperty('--domus-kpi-detail-from-scale-x');
                detailArea.style.removeProperty('--domus-kpi-detail-from-scale-y');
            };

            const setDetailMode = (active) => {
                detailView?.classList.toggle('domus-unit-detail-table-mode', active);
            };

            const closeTarget = () => {
                clearTransitionState();
                detailArea.setAttribute('hidden', '');
                detailArea.dataset.kpiTarget = '';
                detailArea.innerHTML = '';
                setDetailMode(false);
                Domus.state.unitDetailTarget = '';
                if (routeId && Domus.state.currentView === 'unitDetail') {
                    Domus.Router.setCurrentArgs([routeId], {replaceHash: true});
                }
            };

            const getTransitionSource = (triggerEl) => {
                const tile = triggerEl?.closest('.domus-kpi-tile');
                if (!tile) {
                    return null;
                }
                const rect = tile.getBoundingClientRect();
                if (!rect.width || !rect.height) {
                    return null;
                }
                return {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height
                };
            };

            const animateOpenFromTile = (sourceRect) => {
                if (!sourceRect || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    clearTransitionState();
                    return;
                }
                const detailRect = detailArea.getBoundingClientRect();
                if (!detailRect.width || !detailRect.height) {
                    clearTransitionState();
                    return;
                }
                clearTransitionState();
                detailArea.style.setProperty('--domus-kpi-detail-from-x', `${sourceRect.left - detailRect.left}px`);
                detailArea.style.setProperty('--domus-kpi-detail-from-y', `${sourceRect.top - detailRect.top}px`);
                detailArea.style.setProperty('--domus-kpi-detail-from-scale-x', `${sourceRect.width / detailRect.width}`);
                detailArea.style.setProperty('--domus-kpi-detail-from-scale-y', `${sourceRect.height / detailRect.height}`);
                detailArea.classList.add('domus-kpi-detail-opening');
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        detailArea.classList.add('domus-kpi-detail-opening-active');
                    });
                });
                detailArea.addEventListener('transitionend', clearTransitionState, {once: true});
            };

            const openTarget = (target, forceOpen = false, triggerEl = null) => {
                const content = target ? detailMap[target] : null;
                if (!content) {
                    if (forceOpen) {
                        closeTarget();
                    }
                    return;
                }
                const currentTarget = detailArea.dataset.kpiTarget || '';
                const isVisible = !detailArea.hasAttribute('hidden');
                if (!forceOpen && isVisible && currentTarget === target) {
                    return;
                }
                const sourceRect = getTransitionSource(triggerEl);
                setDetailMode(true);
                detailArea.innerHTML = buildKpiDetailShell(content);
                resetStatisticsPaginationForContainer(detailArea);
                detailArea.removeAttribute('hidden');
                detailArea.dataset.kpiTarget = target;
                Domus.state.unitDetailTarget = target || '';
                if (routeId && Domus.state.currentView === 'unitDetail') {
                    const routeArgs = target ? [routeId, target] : [routeId];
                    Domus.Router.setCurrentArgs(routeArgs, {replaceHash: true});
                }
                detailArea.querySelector('.domus-kpi-detail-close')?.addEventListener('click', closeTarget);
                Domus.UI.bindRowNavigation();
                if (typeof onRender === 'function') {
                    onRender(target);
                }
                animateOpenFromTile(sourceRect);
            };

            document.querySelectorAll('.domus-kpi-more[data-kpi-target]').forEach(btn => {
                btn.addEventListener('click', (event) => {
                    if (btn.tagName.toLowerCase() === 'a') {
                        event.preventDefault();
                    }
                    const target = btn.getAttribute('data-kpi-target');
                    openTarget(target, false, btn);
                });
            });

            if (options.initialTarget) {
                openTarget(options.initialTarget, true);
            }
        }

        function renderList() {
            Domus.state.selectedUnitId = null;
            Domus.state.unitDetailTarget = '';
            updateNavSearch();
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', {entity: t('domus', 'Units')}));
            Domus.Api.getUnits()
                .then(units => {
                    listState.units = units || [];
                    renderListContent();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function renderListContent() {
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
            const filteredUnits = filterUnits(listState.units, listState.query);
            const cards = filteredUnits.map(buildUnitCard);
            const hasSearch = Domus.Utils.normalizeSearchValue(listState.query) !== '';
            const emptyState = Domus.UI.buildEmptyStateAction(
                t('domus', 'There is no {entity} yet. Create the first one', {
                    entity: t('domus', 'Units')
                }),
                {
                    iconClass: 'domus-icon-unit',
                    actionId: 'domus-units-empty-create'
                }
            );
            const content = cards.length
                ? Domus.UI.buildOverviewList(cards)
                : hasSearch
                    ? Domus.UI.buildOverviewList([], {
                        emptyMessage: t('domus', 'No matching {entity} found.', {entity: t('domus', 'Units')})
                    })
                    : emptyState;

            Domus.UI.renderContent(header + content);
            bindList();
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
                    '<div class="domus-table-entity">' +
                    Domus.UI.buildEntityImage('unit', u, {
                        variant: 'table',
                        alt: u.label || t('domus', 'Unit')
                    }) +
                    '<div class="domus-table-entity-label">' + Domus.Utils.escapeHtml(u.label || '') + '</div>' +
                    '</div>',
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
            const paginationEnabled = options.pagination === true && !!options.paginationKey;
            const paginationKey = paginationEnabled ? String(options.paginationKey) : '';
            const pageSize = Math.max(1, parseInt(options.pageSize, 10) || statisticsTablePageSize);
            const requestedPage = parseInt(options.page, 10);
            const currentPage = Number.isNaN(requestedPage)
                ? (statisticsPaginationState[paginationKey]?.currentPage || 1)
                : requestedPage;
            const pageInfo = paginationEnabled
                ? Domus.UI.paginateArray(sortedRows, currentPage, pageSize)
                : null;
            const visibleRows = pageInfo ? pageInfo.items : sortedRows;

            if (paginationEnabled) {
                const stateOptions = {
                    ...options,
                    pagination: true,
                    paginationKey,
                    pageSize
                };
                delete stateOptions.page;
                statisticsPaginationState[paginationKey] = {
                    statistics,
                    options: stateOptions,
                    currentPage: pageInfo.page
                };
            }

            const rows = visibleRows.map(row => {
                const cells = columnMeta.map((col, index) => {
                    const value = row[col.key];
                    if (col.key === 'label') {
                        return {
                            content: '<div class="domus-table-entity">' +
                                Domus.UI.buildEntityImage('unit', row, {
                                    variant: 'table',
                                    alt: value || t('domus', 'Unit')
                                }) +
                                '<div class="domus-table-entity-label">' + Domus.Utils.escapeHtml(value || '') + '</div>' +
                                '</div>',
                            alignRight: false
                        };
                    }
                    if (col.format === 'occupancy') {
                        return {
                            content: buildOccupancyBadge(value),
                            alignRight: false,
                            isHtml: true
                        };
                    }
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
                        content: formatted.isHtml ? formatted.content : Domus.Utils.escapeHtml(formatted.content),
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
            if (paginationEnabled) {
                const paginationHtml = Domus.UI.buildPagination(pageInfo, {pageSize});
                const wrapperId = getStatisticsPaginationWrapperId(paginationKey);
                const content = '<div class="domus-unit-statistics-table" id="' + Domus.Utils.escapeHtml(wrapperId) + '"' +
                    ' data-domus-stat-pagination="' + Domus.Utils.escapeHtml(paginationKey) + '">' +
                    tableHtml +
                    paginationHtml +
                    totalsHtml +
                    '</div>';
                if (!wrapPanel) {
                    return content;
                }
                return '<div class="domus-panel domus-panel-table">' + content + '</div>';
            }
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

        function openYearStatusModal(unitId, statistics, onComplete, modalOptions = {}) {
            const years = Domus.Utils.collectStatisticsYears(statistics);
            const provisionalMap = Domus.Utils.collectProvisionalMap(statistics);
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

        function getUnitMasterdataStatus(unit, options = {}) {
            const includeManagementExcludedFields = options.includeManagementExcludedFields !== false;
            const showPropertySelect = options.showPropertySelect === true;
            let total = 0;
            let completed = 0;

            const addField = (value) => {
                total += 1;
                if (Domus.Utils.isValueFilled(value)) {
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
                addField(unit?.street);
                addField(unit?.zip);
                addField(unit?.city);
                addField(unit?.country);
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
            Domus.Navigation.clearPrimarySearch();
            resetStatisticsPaginationState();
            const normalizedUnitId = id !== undefined && id !== null ? String(id) : '';
            const normalizedInitialTarget = initialTarget ? String(initialTarget) : '';
            Domus.state.selectedUnitId = normalizedUnitId;
            Domus.state.unitDetailTarget = normalizedInitialTarget;
            if (normalizedUnitId && Domus.state.currentView === 'unitDetail') {
                const routeArgs = normalizedInitialTarget ? [normalizedUnitId, normalizedInitialTarget] : [normalizedUnitId];
                Domus.Router.setCurrentArgs(routeArgs, {replaceHash: true});
            }
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
                    const kicker = unit.notes || '';
                    const street = !isBuildingManagement ? (unit.street || unit.propertyStreet) : '';
                    const city = !isBuildingManagement ? (unit.city || unit.propertyCity) : '';
                    const addressLine = [street, city].filter(Boolean).join(', ') || (!isBuildingManagement ? (unit.address || '') : '');
                    const stats = (useKpiLayout || isBuildingManagement) ? '' : Domus.UI.buildStatCards([
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
                    const masterdataStatus = getUnitMasterdataStatus(unit, {
                        showPropertySelect: false,
                        includeManagementExcludedFields: !Domus.Role.isBuildingMgmtView()
                    });
                    const masterdataIndicator = Domus.UI.buildCompletionIndicator(t('domus', 'Masterdata'), masterdataStatus.completed, masterdataStatus.total, {
                        id: 'domus-unit-masterdata'
                    });
                    const roleMenuActions = isBuildingManagement
                        ? [
                            canManageDistributions ? Domus.UI.buildIconLabelButton('domus-icon-document', t('domus', 'Distribution Report'), {
                                id: 'domus-unit-distribution-report',
                                className: 'domus-action-menu-item'
                            }) : ''
                        ]
                        : (isLandlord
                            ? [
                                Domus.UI.buildIconLabelButton('domus-icon-document', t('domus', 'Create utility report'), {
                                    id: 'domus-unit-service-charge',
                                    className: 'domus-action-menu-item'
                                }),
                                showPartners ? Domus.UI.buildIconLabelButton('domus-icon-partner', t('domus', 'Contacts'), {
                                    id: 'domus-unit-toggle-partners',
                                    className: 'domus-action-menu-item'
                                }) : ''
                            ]
                            : [
                                (unitDetailConfig.showTenancyActions && canManageTenancies && tenancyLabels.action) ? Domus.UI.buildIconLabelButton('domus-icon-tenancy', tenancyLabels.action, {
                                    id: 'domus-add-tenancy',
                                    className: 'domus-action-menu-item'
                                }) : '',
                                canManageBookings ? Domus.UI.buildIconLabelButton('domus-icon-booking', t('domus', 'Add {entity}', {entity: t('domus', 'Booking')}), {
                                    id: 'domus-add-unit-booking',
                                    className: 'domus-action-menu-item'
                                }) : '',
                                canManageDistributions ? Domus.UI.buildIconLabelButton('domus-icon-document', t('domus', 'Add {entity}', {entity: t('domus', 'Distribution')}), {
                                    id: 'domus-add-unit-distribution',
                                    className: 'domus-action-menu-item'
                                }) : '',
                                canManageDistributions ? Domus.UI.buildIconLabelButton('domus-icon-document', t('domus', 'Distribution Report'), {
                                    id: 'domus-unit-distribution-report',
                                    className: 'domus-action-menu-item'
                                }) : '',
                                Domus.UI.buildIconLabelButton('domus-icon-document', t('domus', 'Create utility report'), {
                                    id: 'domus-unit-service-charge',
                                    className: 'domus-action-menu-item'
                                }),
                                showPartners ? Domus.UI.buildIconLabelButton('domus-icon-partner', t('domus', 'Contacts'), {
                                    id: 'domus-unit-toggle-partners',
                                    className: 'domus-action-menu-item'
                                }) : ''
                            ]);
                    const menuActions = []
                        .concat(roleMenuActions, [
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
                    ]).filter(Boolean);
                    const actionMenu = Domus.UI.buildActionMenu(menuActions, {
                        label: t('domus', 'Quick Actions'),
                        ariaLabel: t('domus', 'Quick Actions')
                    });
                    const currentTenantSummary = currentTenancy
                        ? formatPartnerNames(currentTenancy.partners) || currentTenancy.partnerName
                        : '';
                    const unitInlineMeta = '<div class="domus-hero-meta-line domus-hero-meta-line-inline">' +
                        '<span class="domus-icon domus-icon-ruler" aria-hidden="true"></span>' +
                        '<span>' + Domus.Utils.escapeHtml(livingAreaLabel || '—') + '</span>' +
                        '<span class="domus-hero-meta-inline-spacer" aria-hidden="true"></span>' +
                        '<span class="domus-icon domus-icon-partner" aria-hidden="true"></span>' +
                        '<span>' + Domus.Utils.escapeHtml(currentTenantSummary || t('domus', 'Vacant')) + '</span>' +
                        '</div>';
                    const unitMetaLines = [
                        addressLine ? Domus.UI.buildHeroMetaLine('domus-icon-location', addressLine) : '',
                        unitInlineMeta
                    ].filter(Boolean).join('');
                    const occupancyBadge = buildOccupancyBadge(getUnitOccupancyStatus(unit));

                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-content">' +
                        '<div class="domus-hero-indicator domus-hero-image-card">' +
                        Domus.UI.buildEntityImage('unit', unit, {
                            variant: 'hero',
                            alt: unit.label || t('domus', 'Unit')
                        }) +
                        '<button type="button" class="domus-hero-image-edit" id="domus-unit-image-edit" aria-label="' + Domus.Utils.escapeHtml(t('domus', 'Edit picture')) + '">' +
                        '<span class="domus-icon domus-icon-edit" aria-hidden="true"></span>' +
                        '</button>' +
                        '</div>' +
                        '<div class="domus-hero-main">' +
                        (kicker ? '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(kicker) + '</div>' : '') +
                        '<div class="domus-hero-main-top">' +
                        '<div class="domus-hero-heading-group">' +
                        '<div class="domus-hero-heading-row">' +
                        '<h2>' + Domus.Utils.escapeHtml(unit.label || '') + '</h2>' +
                        occupancyBadge +
                        (unit.unitType ? '<span class="domus-badge">' + Domus.Utils.escapeHtml(unit.unitType) + '</span>' : '') +
                        '</div>' +
                        '<div class="domus-hero-meta-stack">' + unitMetaLines + '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        actionMenu +
                        '<div class="domus-hero-actions-status">' + masterdataIndicator + '</div>' +
                        '</div>' +
                        '</div>' +
                        '</div>' +
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
                        pagination: true,
                        paginationKey: `unit-${id}-result`,
                        pageSize: statisticsTablePageSize,
                        onPageRender: () => bindStatisticsBookingRows(id, {showLinkAction: documentActionsEnabled}),
                        ...bookingEmptyState
                    });
                    const costTable = statistics && statistics.cost
                        ? Domus.UI.buildSectionHeader(t('domus', 'Costs')) + renderStatisticsTable(statistics.cost, {
                        buildRowDataset: row => {
                            const year = getStatisticsRowYear(row, statistics ? statistics.cost : null);
                            return year ? {'stat-year': year} : null;
                        },
                        wrapPanel: false,
                        pagination: true,
                        paginationKey: `unit-${id}-cost`,
                        pageSize: statisticsTablePageSize,
                        onPageRender: () => bindStatisticsBookingRows(id, {showLinkAction: documentActionsEnabled}),
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
                    const unitDocumentUrl = unitDocumentPath ? Domus.Utils.buildFilesFolderUrl(unitDocumentPath) : '';
                    const defaultDocumentsContainerId = `domus-unit-default-documents-${id}`;
                    const detailDocumentsContainerId = `domus-unit-detail-documents-${id}`;
                    const documentsHeaderAction = unitDocumentUrl ? {
                        href: unitDocumentUrl,
                        target: '_blank',
                        rel: 'noopener',
                        label: t('domus', 'View all'),
                        title: t('domus', 'Open all documents')
                    } : null;
                    const actionLogHeader = Domus.UI.buildSectionHeader(t('domus', 'Action log'), {
                        id: 'domus-unit-action-log-create',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Action log entry') }),
                        iconClass: 'domus-icon-add'
                    });
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
                    const tasksPanel = Domus.Role.isTenantView() ? '' : Domus.Tasks.buildUnitTasksPanel();
                    const tasksPanelContent = Domus.Role.isTenantView() ? '' : Domus.Tasks.buildUnitTasksPanel({wrapPanel: false});
                    const kpiTiles = useKpiLayout
                        ? '<div class="domus-kpi-tiles domus-kpi-tiles-unit-detail domus-unit-landlord-default-block">' +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Rentability'),
                            value: rentabilityValueLabel,
                            subline: rentabilityYearLabel,
                            chartId: 'domus-kpi-rentability-chart',
                            showChart: hasRentabilityTrend,
                            tileClassName: 'domus-unit-kpi-tile',
                            linkLabel: t('domus', 'Open fullscreen'),
                            linkIconClass: 'domus-icon-fullscreen',
                            detailTarget: 'revenue'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Cold rent'),
                            value: coldRentValueLabel,
                            subline: coldRentYearLabel,
                            chartId: 'domus-kpi-cold-rent-chart',
                            showChart: hasColdRentTrend,
                            tileClassName: 'domus-unit-kpi-tile',
                            linkLabel: t('domus', 'Open fullscreen'),
                            linkIconClass: 'domus-icon-fullscreen',
                            detailTarget: 'cost'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Current rental'),
                            valueHtml: currentTenantLabel,
                            showChart: false,
                            tileClassName: 'domus-unit-kpi-tile',
                            linkLabel: t('domus', 'Open fullscreen'),
                            linkIconClass: 'domus-icon-fullscreen',
                            detailTarget: 'tenancies'
                        }) +
                        Domus.UI.buildKpiTile({
                            headline: t('domus', 'Documents'),
                            valueHtml: documentsTileValue,
                            showChart: false,
                            tileClassName: 'domus-unit-kpi-tile',
                            linkLabel: t('domus', 'Open fullscreen'),
                            linkIconClass: 'domus-icon-fullscreen',
                            detailTarget: 'documents'
                        }) +
                        '</div>'
                        : '';
                    const upcomingPanel = (!Domus.Role.isTenantView() && useKpiLayout)
                        ? '<div class="domus-panel domus-unit-default-panel domus-unit-upcoming-panel domus-upcoming-card-shell domus-upcoming-card-shell-compact" id="domus-unit-tasks-panel">' +
                        tasksPanelContent +
                        '</div>'
                        : '';
                    const documentsPanelDefault = useKpiLayout
                        ? '<div class="domus-panel domus-unit-default-panel domus-unit-documents-panel">' +
                        Domus.UI.buildSectionHeader(t('domus', 'Document Management'), documentsHeaderAction) +
                        '<div class="domus-panel-body">' +
                        Domus.Documents.renderLatestList('unit', id, {
                            defer: true,
                            pageSize: 8,
                            containerId: defaultDocumentsContainerId
                        }) +
                        '</div>' +
                        '</div>'
                        : '';
                    const actionLogPanel = '<div class="domus-panel domus-unit-default-panel domus-unit-action-log-panel">' +
                        actionLogHeader +
                        '<div class="domus-panel-body">' +
                        Domus.ActionLog.renderList('unit', id, {
                            containerId: `domus-unit-action-log-${id}`,
                            emptyActionId: 'domus-unit-action-log-empty-create',
                            entityLabel: unit?.label || '',
                            onSaved: () => renderDetail(id)
                        }) +
                        '</div>' +
                        '</div>';

                    const partnersPanel = showPartners
                        ? Domus.PartnerRelations.renderSection(partners || [], {entityType: 'unit', entityId: id, sectionTitle: t('domus', 'Contacts')})
                        : '';
                    const partnersPanelWrapper = showPartners
                        ? '<div id="domus-unit-partners-panel" class="' + (useKpiLayout ? 'domus-hidden ' : '') + 'domus-unit-landlord-default-block">' +
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
                    const managementSideBySidePanels = isBuildingManagement
                        ? [
                            tasksPanel,
                            canManageDistributions
                                ? '<div class="domus-panel domus-panel-half">' + distributionsHeader + '<div class="domus-panel-body" id="domus-unit-distributions">' +
                                    Domus.Distributions.renderTable(filteredDistributions, {
                                        showUnitValue: true,
                                        hideConfig: true,
                                        excludeSystemDefaults: true,
                                        wrapPanel: false,
                                        variant: 'propertyDetail'
                                    }) + '</div></div>'
                                : ''
                        ].filter(Boolean).join('')
                        : '';

                    const content = useKpiLayout
                        ? '<div class="domus-detail domus-dashboard domus-unit-detail-landlord">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        kpiTiles +
                        '<div class="domus-panel-row domus-panel-row-thirds domus-unit-landlord-panels domus-unit-landlord-default-block">' +
                        upcomingPanel +
                        documentsPanelDefault +
                        actionLogPanel +
                        '</div>' +
                        partnersPanelWrapper +
                        kpiDetailArea +
                        '</div>'
                        : '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('units') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid domus-dashboard-grid-single">' +
                        '<div class="domus-dashboard-main">' +
                        rentabilityChartPanel +
                        (managementSideBySidePanels ? '<div class="domus-panel-row">' + managementSideBySidePanels + '</div>' : '') +
                        (!isBuildingManagement && canManageDistributions ? '<div class="domus-panel">' + distributionsHeader + '<div class="domus-panel-body" id="domus-unit-distributions">' +
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
                        (isBuildingManagement ? '' : tasksPanel) +
                        partnersPanelWrapper +
                        (showRentabilityPanels ? '<div class="domus-panel">' + statisticsHeader + '<div class="domus-panel-body">' +
                            revenueTable + costTable + '</div></div>' : '') +
                        '<div class="domus-panel">' + actionLogHeader + '<div class="domus-panel-body">' +
                        Domus.ActionLog.renderList('unit', id, {
                            containerId: `domus-unit-action-log-${id}`,
                            emptyActionId: 'domus-unit-action-log-empty-create',
                            entityLabel: unit?.label || '',
                            onSaved: () => renderDetail(id)
                        }) + '</div></div>' +
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
                    bindStatisticsPagination();
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
                        bindKpiPartnerNameFitResize();
                        scheduleKpiPartnerNameFit();
                        renderKpiTileCharts(statistics);
                        const costDetailTable = renderStatisticsTable(statistics ? statistics.cost : null, {
                            buildRowDataset: row => {
                                const year = getStatisticsRowYear(row, statistics ? statistics.cost : null);
                                return year ? {'stat-year': year} : null;
                            },
                            wrapPanel: false,
                            pagination: true,
                            paginationKey: `unit-${id}-cost`,
                            pageSize: statisticsTablePageSize,
                            onPageRender: () => bindStatisticsBookingRows(id, {showLinkAction: documentActionsEnabled}),
                            ...bookingEmptyState
                        });
                        const detailMap = {
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
                            documents: buildKpiDetailPanel(t('domus', 'Document Management'), Domus.Documents.renderLatestList('unit', id, {
                                defer: true,
                                pageSize: 10,
                                containerId: detailDocumentsContainerId
                            }), documentsHeaderAction)
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
                            if (target === 'revenue') {
                                bindYearStatusAction(id, statistics);
                            }
                            if (target === 'documents') {
                                Domus.Documents.loadLatestList('unit', id, {
                                    pageSize: 10,
                                    containerId: detailDocumentsContainerId
                                });
                            }
                            bindStatisticsPagination();
                            bindStatisticsBookingRows(id, {showLinkAction: documentActionsEnabled});
                            Domus.Bookings.bindInlineTables();
                        }, {
                            initialTarget: initialTarget,
                            routeId: normalizedUnitId
                        });
                    } else if (showRentabilityPanels) {
                        renderRentabilityChart(isLandlord ? statistics : null);
                    }
                    bindDetailActions(id, unit);
                    if (!Domus.Role.isTenantView()) {
                        Domus.Tasks.loadUnitTasks(id);
                        Domus.Tasks.bindUnitTaskButtons(id, () => Domus.Tasks.loadUnitTasks(id));
                        if (useKpiLayout) {
                            Domus.Documents.loadLatestList('unit', id, {
                                pageSize: 8,
                                containerId: defaultDocumentsContainerId
                            });
                        }
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
            document.getElementById('domus-unit-image-edit')?.addEventListener('click', () => {
                openUnitImageModal(unit);
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
                                Domus.Router.back('units');
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
            Domus.ActionLog.bindCreateButtons(['domus-unit-action-log-create'], {
                entityType: 'unit',
                entityId: id,
                entityLabel: unit?.label || '',
                onSaved: () => renderDetail(id)
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
            Domus.UI.openDocumentLocationModal({
                currentPath: unit.documentPath || '',
                formIdPrefix: 'domus-unit-document-location',
                save: value => Domus.Api.updateUnit(unit.id, { documentPath: value }),
                onSaved: () => renderDetail(unit.id)
            });
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
                    const exportDate = payload?.exportedAt
                        ? new Date(payload.exportedAt * 1000)
                        : new Date();
                    const dateLabel = Number.isNaN(exportDate.getTime())
                        ? new Date().toISOString().slice(0, 10)
                        : exportDate.toISOString().slice(0, 10);
                    const unitLabel = (payload?.unit?.label || '').toString().toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/(^-+|-+$)/g, '');
                    const filename = 'domus-unit-' + (unitLabel || String(unitId)) + '-' + dateLabel + '.json';

                    const blob = new Blob([json], {type: 'application/json;charset=utf-8;'});
                    const downloadUrl = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = downloadUrl;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(downloadUrl);
                    Domus.UI.showNotification(t('domus', 'Documents are not included.'), 'info');
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
                    '<label for="domus-unit-import-file">' + Domus.Utils.escapeHtml(t('domus', 'Select file')) + '</label>' +
                    '<input id="domus-unit-import-file" type="file" accept=".json,application/json" required />' +
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
                const fileInput = modalContext.modalEl.querySelector('#domus-unit-import-file');
                const propertySelectEl = modalContext.modalEl.querySelector('#domus-unit-import-property');
                cancelBtn?.addEventListener('click', () => modalContext.close());
                form?.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    if (submitBtn) submitBtn.disabled = true;

                    const selectedFile = fileInput?.files && fileInput.files.length > 0
                        ? fileInput.files[0]
                        : null;
                    if (!selectedFile) {
                        if (submitBtn) submitBtn.disabled = false;
                        Domus.UI.showNotification(t('domus', 'No file selected'), 'error');
                        return;
                    }

                    let data;
                    try {
                        const fileContent = await selectedFile.text();
                        data = JSON.parse(fileContent);
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
                rows.push(
                    inputField('street', t('domus', 'Street'), unit?.street || ''),
                    inputField('zip', t('domus', 'ZIP'), unit?.zip || ''),
                    inputField('city', t('domus', 'City'), unit?.city || ''),
                    inputField('country', t('domus', 'Country'), unit?.country || ''),
                    inputField('landRegister', t('domus', 'Land register'), unit?.landRegister || '')
                );
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

        function bindUnitImageField(root) {
            const fileInput = root.querySelector('input[name="imageFile"]');
            const actionInput = root.querySelector('input[name="imageAction"]');
            const removeButton = root.querySelector('[data-image-remove]');
            const imageElement = root.querySelector('.domus-image-field-preview img');
            if (!fileInput || !actionInput || !imageElement) {
                return null;
            }

            const currentUrl = imageElement.getAttribute('src') || '';
            const fallbackUrl = Domus.UI.getEntityImageUrl('unit', {});
            const setPreview = (url) => imageElement.setAttribute('src', url || fallbackUrl);

            fileInput.addEventListener('change', () => {
                const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
                if (!file) {
                    actionInput.value = 'keep';
                    setPreview(currentUrl);
                    return;
                }
                actionInput.value = 'upload';
                const reader = new FileReader();
                reader.onload = event => setPreview(event.target?.result || currentUrl);
                reader.readAsDataURL(file);
            });

            removeButton?.addEventListener('click', () => {
                fileInput.value = '';
                actionInput.value = 'remove';
                setPreview(fallbackUrl);
            });

            return {
                getValue: () => ({
                    action: actionInput.value || 'keep',
                    file: fileInput.files && fileInput.files[0] ? fileInput.files[0] : null
                })
            };
        }

        function applyUnitImageChange(id, imageChange) {
            if (!imageChange || imageChange.action === 'keep') {
                return Promise.resolve();
            }
            if (imageChange.action === 'remove') {
                return Domus.Api.removeUnitImage(id).then(() => undefined);
            }
            if (imageChange.action === 'upload' && imageChange.file) {
                return Domus.Api.uploadUnitImage(id, imageChange.file).then(() => undefined);
            }
            return Promise.resolve();
        }

        function openUnitImageModal(unit) {
            const modal = Domus.UI.openModal({
                title: t('domus', 'Edit picture'),
                content: '<div class="domus-form">' +
                    '<form id="domus-unit-image-form">' +
                    Domus.UI.buildFormTable([
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Preview'),
                            content: '<div class="domus-image-field">' +
                                '<div class="domus-image-field-preview">' +
                                Domus.UI.buildEntityImage('unit', unit, {
                                    variant: 'form',
                                    alt: unit.label || t('domus', 'Unit')
                                }) +
                                '</div>' +
                                '<div class="domus-image-field-actions">' +
                                    '<input type="hidden" name="imageAction" value="keep">' +
                                    '<input type="file" name="imageFile" accept="image/*">' +
                                    '<button type="button" class="domus-ghost" data-image-remove>' + Domus.Utils.escapeHtml(t('domus', 'Use fallback image')) + '</button>' +
                                '</div>' +
                            '</div>'
                        })
                    ]) +
                    '<div class="domus-form-actions">' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                        '<button type="button" id="domus-unit-image-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                    '</div>' +
                    '</form>' +
                    '</div>'
            });
            const imageState = bindUnitImageField(modal.modalEl);
            modal.modalEl.querySelector('#domus-unit-image-cancel')?.addEventListener('click', modal.close);
            modal.modalEl.querySelector('#domus-unit-image-form')?.addEventListener('submit', event => {
                event.preventDefault();
                applyUnitImageChange(unit.id, imageState?.getValue())
                    .then(() => {
                        modal.close();
                        renderDetail(unit.id);
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }

        return {
            renderList,
            renderDetail,
            renderListInline,
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
            let createdReportDocument = null;
            let createdReportPath = '';
            const steps = [
                { label: t('domus', 'Select year') },
                { label: t('domus', 'Preview') },
                { label: t('domus', 'Create') },
                { label: t('domus', 'Details') }
            ];
            let currentStep = 0;

            const container = document.createElement('div');

            const modal = Domus.UI.openModal({
                title: t('domus', 'Create utility report'),
                content: container,
                size: 'large'
            });

            function buildYearOptions(defaultYear, statistics) {
                const years = Domus.Utils.collectStatisticsYears(statistics);
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
                        provisionalMap = Domus.Utils.collectProvisionalMap(statistics);
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

            function renderResultStep() {
                const reportUrl = createdReportDocument?.fileUrl || '';
                const reportLabel = createdReportDocument?.fileName || t('domus', 'Open link');
                const previewMarkup = createdReportPath
                    ? '<button type="button" id="domus-settlement-preview">' + Domus.Utils.escapeHtml(t('domus', 'Preview')) + '</button>'
                    : '';
                const linkMarkup = reportUrl
                    ? '<a class="domus-link" target="_blank" rel="noopener" href="' + Domus.Utils.escapeHtml(reportUrl) + '">' +
                    Domus.Utils.escapeHtml(t('domus', 'Open link')) + '</a>'
                    : '<span class="muted">' + Domus.Utils.escapeHtml(t('domus', 'No {entity} found.', { entity: t('domus', 'Document') })) + '</span>';
                const info = Domus.UI.buildInfoList([
                    { label: t('domus', 'Report'), value: reportLabel }
                ]);

                return '<div class="domus-form">' + info +
                    '<div class="domus-form-actions">' + previewMarkup + linkMarkup + '</div>' +
                    '</div>' +
                    '<div class="domus-modal-footer">' +
                    '<button id="domus-settlement-close" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button>' +
                    '</div>';
            }

            function renderStep() {
                let content = '';
                if (currentStep === 0) {
                    content = renderYearStep();
                } else if (currentStep === 1) {
                    content = renderPreviewStep();
                } else if (currentStep === 2) {
                    content = renderCreateStep();
                } else {
                    content = renderResultStep();
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

                if (currentStep === 3) {
                    container.querySelector('#domus-settlement-preview')?.addEventListener('click', () => {
                        if (!createdReportPath || !window?.OCA?.Viewer || typeof window.OCA.Viewer.open !== 'function') {
                            Domus.UI.showNotification(t('domus', 'An error occurred'), 'error');
                            return;
                        }
                        try {
                            window.OCA.Viewer.open({ path: createdReportPath });
                        } catch (error) {
                            Domus.UI.showNotification(t('domus', 'An error occurred'), 'error');
                        }
                    });
                    container.querySelector('#domus-settlement-close')?.addEventListener('click', modal.close);
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
                            .then(result => {
                                const createdDocuments = Array.isArray(result?.documents) ? result.documents : [];
                                createdReportDocument = createdDocuments.find(document => document?.fileId || document?.fileUrl) || null;
                                createdReportPath = result?.reportPath || '';
                                Domus.UI.showNotification(t('domus', '{entity} created.', {entity: t('domus', 'Report')}), 'success');
                                onComplete?.();
                                currentStep = 3;
                                renderStep();
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

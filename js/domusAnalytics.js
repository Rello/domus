/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
(function() {
    'use strict';
    window.Domus = window.Domus || {};

    Domus.Analytics = (function() {
        let chartInstance = null;
        let requestId = 0;
        let view = null;
        let data = null;
        let filtersReady = false;
        let options = [];
        let units = [];
        let properties = [];
        let stateRole = null;
        let state = { preset: 'annual', year: '', unitId: '', propertyId: '', accounts: [], search: '', metric: 'baseRent' };
        const escape = value => Domus.Utils.escapeHtml(String(value));
        const normalize = value => String(value).replace(/^0+/, '') || '0';
        const presets = () => [
            { value: 'portfolio', label: t('domus', 'Portfolio development') },
            { value: 'annual', label: t('domus', 'Annual booking breakdown') },
            { value: 'trend', label: t('domus', 'Yearly booking trend') },
            { value: 'custom', label: t('domus', 'Custom accounts') }
        ];
        const metrics = () => [
            { value: 'baseRent', label: t('domus', 'Annual base rent') },
            { value: 'netProfit', label: t('domus', 'Estimated annual net profit') },
            { value: 'netRentability', label: t('domus', 'Estimated profitability') }
        ];
        const option = (value, label) => '<option value="' + escape(value) + '">' + escape(label) + '</option>';
        const filter = (id, label, html) => '<label class="domus-analytics-filter"><span>' + escape(label) + '</span><select id="domus-analytics-' + id + '">' + html + '</select></label>';
        const element = id => document.getElementById('domus-analytics-' + id);

        function render() {
            const role = Domus.Role.isBuildingMgmtView() ? 'management' : 'landlord';
            if (stateRole !== role) {
                state = { preset: 'annual', year: '', unitId: '', propertyId: '', accounts: [], search: '', metric: 'baseRent' };
                stateRole = role;
            }
            view = Domus.Router.beginView();
            ++requestId;
            destroyChart();
            data = null;
            // Include disabled accounts: historical bookings remain relevant.
            options = Domus.Accounts.toOptions(false, null, true);
            Domus.UI.renderContent(buildLayout());
            Domus.UI.onContentDispose(destroyChart);
            element('preset').value = state.preset;
            element('search').value = state.search;
            bindControls();
            showCustomAccounts();
            loadFilters(view);
        }

        function buildLayout() {
            return '<div class="domus-analytics-layout"><div class="domus-analytics-panel">' +
                filter('preset', t('domus', 'View'), presets().map(p => option(p.value, p.label)).join('')) +
                (Domus.Role.isBuildingMgmtView() ? filter('property', t('domus', 'Property'), option('', t('domus', 'All properties'))) : '') +
                filter('unit', t('domus', 'Unit'), option('', t('domus', 'All units'))) +
                filter('year', t('domus', 'Year'), option('', t('domus', 'Latest year with bookings'))) +
                '<div id="domus-analytics-portfolio-controls" hidden>' +
                filter('metric', t('domus', 'Trend metric'), metrics().map(metric => option(metric.value, metric.label)).join('')) + '</div>' +
                '<div id="domus-analytics-custom" hidden><label class="domus-analytics-filter" for="domus-analytics-search">' + escape(t('domus', 'Search accounts')) +
                '<input id="domus-analytics-search" type="search"></label><fieldset class="domus-analytics-accounts"><legend>' + escape(t('domus', 'Accounts')) + '</legend>' +
                options.map((o, index) => '<label class="domus-analytics-account" data-search="' + escape(o.label.toLocaleLowerCase()) + '"><input type="checkbox" value="' + escape(o.value) + '" id="domus-analytics-account-' + index + '"' + (state.accounts.includes(normalize(o.value)) ? ' checked' : '') + '><span>' + escape(o.label) + '</span></label>').join('') +
                '<p id="domus-analytics-search-empty" hidden>' + escape(t('domus', 'No matching accounts.')) + '</p></fieldset></div>' +
                '<p id="domus-analytics-hint" class="domus-analytics-hint">' + escape(t('domus', 'Recorded bookings only. Each account shows its own postings; parent accounts do not include child accounts.')) + '</p>' +
                '<button id="domus-analytics-retry" type="button" hidden>' + escape(t('domus', 'Retry')) + '</button></div>' +
                '<div class="domus-analytics-results"><p id="domus-analytics-context"></p><p id="domus-analytics-status" role="status" aria-live="polite"></p>' +
                '<div id="domus-analytics-summary" class="domus-kpi-tiles domus-analytics-summary" hidden></div>' +
                '<div class="domus-analytics-chart" hidden><canvas id="domus-analytics-chart" role="img" aria-label="' + escape(t('domus', 'Recorded bookings by account')) + '"></canvas></div>' +
                '<div id="domus-analytics-values" class="domus-analytics-values" tabindex="0" role="region" aria-label="' + escape(t('domus', 'Booking totals')) + '"></div></div></div>';
        }

        function bindControls() {
            element('preset').addEventListener('change', event => {
                state.preset = event.target.value;
                showCustomAccounts();
                updateChart();
            });
            element('year').addEventListener('change', event => {
                state.year = event.target.value;
                draw();
            });
            element('property')?.addEventListener('change', event => {
                state.propertyId = event.target.value;
                state.unitId = '';
                populateUnits();
                updateChart();
            });
            element('unit').addEventListener('change', event => {
                state.unitId = event.target.value;
                updateChart();
            });
            element('metric').addEventListener('change', event => {
                state.metric = event.target.value;
                draw();
            });
            element('custom').addEventListener('change', () => {
                state.accounts = Array.from(element('custom').querySelectorAll('input[type="checkbox"]:checked')).map(input => normalize(input.value));
                updateChart();
            });
            element('search').addEventListener('input', event => {
                state.search = event.target.value;
                searchAccounts();
            });
            element('retry').addEventListener('click', () => loadFilters(view));
        }

        function showCustomAccounts() {
            element('custom').hidden = state.preset !== 'custom';
            element('portfolio-controls').hidden = state.preset !== 'portfolio';
            element('values').classList.toggle('domus-analytics-performance', state.preset === 'portfolio');
            element('year').closest('label').hidden = state.preset === 'portfolio';
            element('metric').value = state.metric;
            element('hint').textContent = state.preset === 'portfolio'
                ? t('domus', 'Development across all years. Rent and net profit are yearly totals. Annual net profit uses agreed rent and recorded unit costs after estimated taxes. Profitability divides this profit by current acquisition costs. Property-level postings are excluded.')
                : t('domus', 'Recorded bookings only. Each account shows its own postings; parent accounts do not include child accounts.');
            searchAccounts();
        }

        function searchAccounts() {
            const query = state.search.trim().toLocaleLowerCase();
            let matches = 0;
            element('custom').querySelectorAll('[data-search]').forEach(label => {
                label.hidden = !label.dataset.search.includes(query);
                if (!label.hidden) ++matches;
            });
            element('search-empty').hidden = matches > 0;
        }

        function populateUnits() {
            const select = element('unit');
            const visible = units.filter(unit => !state.propertyId || String(unit.propertyId) === state.propertyId);
            if (!visible.some(unit => String(unit.id) === state.unitId)) state.unitId = '';
            select.innerHTML = option('', t('domus', 'All units')) + visible.map(unit => {
                const property = properties.find(p => String(p.id) === String(unit.propertyId));
                const label = [unit.label || unit.name || String(unit.id), property?.name].filter(Boolean).join(' · ');
                return option(unit.id, label);
            }).join('');
            select.value = state.unitId;
        }

        function loadFilters(requestView) {
            filtersReady = false;
            element('retry').hidden = true;
            element('status').textContent = t('domus', 'Loading…');
            element('unit').disabled = true;
            if (element('property')) element('property').disabled = true;
            Promise.all([Domus.Api.getUnits(), Domus.Role.isBuildingMgmtView() ? Domus.Api.getProperties() : Promise.resolve([])])
                .then(([unitList, propertyList]) => {
                    if (!requestView.isCurrent() || !element('unit')) return;
                    units = unitList || [];
                    properties = propertyList || [];
                    const select = element('property');
                    if (select) {
                        if (!properties.some(p => String(p.id) === state.propertyId)) state.propertyId = '';
                        select.innerHTML = option('', t('domus', 'All properties')) + properties.map(p => option(p.id, p.name || String(p.id))).join('');
                        select.value = state.propertyId;
                        select.disabled = false;
                    }
                    populateUnits();
                    element('unit').disabled = false;
                    filtersReady = true;
                    updateChart();
                })
                .catch(() => {
                    if (!requestView.isCurrent() || !element('status')) return;
                    ++requestId;
                    data = null;
                    clearResults();
                    element('status').textContent = t('domus', 'Could not load the unit and property filters. Retry to view bookings.');
                    element('retry').hidden = false;
                });
        }

        function getSelectedAccounts() {
            const selected = state.preset === 'custom' ? options.filter(o => state.accounts.includes(normalize(o.value))) : options;
            // Totals are direct postings, not rollups. Request each number exactly once.
            return [...new Map(selected.map(o => [normalize(o.value), { number: normalize(o.value), label: o.label }])).values()];
        }

        function updateChart() {
            if (!filtersReady) return;
            const currentRequest = ++requestId;
            const requestView = view;
            data = null;
            clearResults();
            updateContext();
            element('retry').hidden = true;
            element('year').disabled = true;
            if (state.preset === 'portfolio') {
                loadPortfolio(currentRequest, requestView);
                return;
            }
            const accounts = getSelectedAccounts();
            if (!accounts.length) {
                element('status').textContent = state.preset === 'custom' ? t('domus', 'Select accounts to view recorded bookings.') : t('domus', 'No accounts available.');
                return;
            }
            element('status').textContent = t('domus', 'Loading…');
            Domus.Api.getAccountTotals(accounts.map(a => a.number), { unitId: state.unitId, propertyId: state.propertyId })
                .then(result => {
                    if (!requestView.isCurrent() || currentRequest !== requestId || !element('status')) return;
                    if (!Array.isArray(result?.years) || !result.series || typeof result.series !== 'object') throw new Error('Invalid statistics response');
                    data = result;
                    draw();
                })
                .catch(() => {
                    if (!requestView.isCurrent() || currentRequest !== requestId || !element('status')) return;
                    clearResults();
                    element('status').textContent = t('domus', 'Could not load recorded bookings. Please retry.');
                    element('retry').hidden = false;
                });
        }

        function loadPortfolio(currentRequest, requestView) {
            element('status').textContent = t('domus', 'Loading…');
            Domus.Api.getPortfolioPerformance({unitId: state.unitId, propertyId: state.propertyId})
                .then(result => {
                    if (!requestView.isCurrent() || currentRequest !== requestId || !element('status')) return;
                    if (!Array.isArray(result?.years) || !Array.isArray(result.trend)) throw new Error('Invalid performance response');
                    data = result;
                    draw();
                })
                .catch(() => {
                    if (!requestView.isCurrent() || currentRequest !== requestId || !element('status')) return;
                    data = null;
                    clearResults();
                    element('status').textContent = t('domus', 'Could not load portfolio development. Please retry.');
                    element('retry').hidden = false;
                });
        }

        function drawPortfolio() {
            const years = data.years.map(String);
            updateContext(years.length > 1 ? [years[0], years[years.length - 1]] : years);
            if (!data.trend.length) {
                element('status').textContent = data.unitCount ? t('domus', 'No financial history available for this scope.') : t('domus', 'No units available for this scope.');
                return;
            }
            const currency = value => value === null ? '—' : Domus.Utils.formatCurrency(value);
            const percentage = value => value === null ? '—' : Domus.Utils.formatPercentage(value);
            const provisional = t('domus', 'Provisional');
            const status = row => row.isProvisional ? provisional : t('domus', 'Closed');
            const latest = data.trend[data.trend.length - 1];
            const summary = element('summary');
            summary.hidden = false;
            summary.innerHTML = metrics().map(metric => Domus.UI.buildKpiTile({
                headline: metric.label,
                value: metric.value === 'netRentability' ? percentage(latest[metric.value]) : currency(latest[metric.value]),
                subline: String(latest.year) + ' · ' + status(latest)
            })).join('');
            const cells = row => [currency(row.baseRent), currency(row.netProfit), percentage(row.netRentability), status(row)].map(escape);
            const headers = [t('domus', 'Year'), ...metrics().map(metric => metric.label), t('domus', 'Status')];
            element('values').setAttribute('aria-label', t('domus', 'Portfolio development by year'));
            element('values').innerHTML = Domus.UI.buildTable(headers, data.trend.map(row => [
                {content: escape(row.year), rowHeader: true}, ...cells(row)
            ]), {wrapPanel: false, caption: t('domus', 'Portfolio development by year')});
            element('values').insertAdjacentHTML('beforeend', '<details><summary>' + escape(t('domus', 'Details by unit and year')) + '</summary>' +
                data.trend.map(period => '<details><summary>' + escape(period.year + ' · ' + status(period)) + '</summary>' +
                    Domus.UI.buildTable([t('domus', 'Unit'), ...headers.slice(1)], period.rows.map(row => ({
                        cells: [{content: escape(row.label || row.unitId), rowHeader: true}, ...cells(row)],
                        dataset: {navigate: 'unitDetail', args: row.unitId}
                    })), {wrapPanel: false, caption: String(period.year)}) + '</details>').join('') + '</details>');
            Domus.UI.bindRowNavigation();
            const notes = [t('domus', 'Applied tax rate') + ': ' + percentage(data.taxRate)];
            if (data.trend.some(row => row.missingCosts)) notes.push(t('domus', 'Profitability is unavailable because acquisition costs are missing for one or more units.'));
            if (data.trend.some(row => row.isProvisional)) notes.push(t('domus', 'Open years are provisional. Annual agreed rent includes the full tenancy period in that year; recorded costs may still be incomplete.'));
            element('status').textContent = notes.join(' ');
            const metric = metrics().find(item => item.value === state.metric);
            const format = state.metric === 'netRentability' ? percentage : currency;
            const values = data.trend.map(row => row[state.metric]);
            const labels = data.trend.map(row => String(row.year) + (row.isProvisional ? ' · ' + provisional : ''));
            if (!window.Chart || !values.some(value => value !== null && Number.isFinite(value))) return;
            const canvas = element('chart');
            canvas.setAttribute('aria-label', metric.label);
            canvas.parentElement.hidden = false;
            const color = getComputedStyle(canvas).getPropertyValue('--color-primary').trim() || '#0082c9';
            chartInstance = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {labels, datasets: [{label: metric.label, data: values, borderColor: color, backgroundColor: color, tension: 0.25, spanGaps: false}]},
                options: {responsive: true, maintainAspectRatio: false, animation: false,
                    plugins: {legend: {display: false}, tooltip: {callbacks: {label: context => format(context.raw)}}},
                    scales: {y: {beginAtZero: true, ticks: {callback: value => format(value)}}}}
            });
        }

        function updateContext(years = []) {
            const property = element('property');
            const unit = element('unit');
            const scope = [property?.selectedOptions[0]?.textContent, unit?.selectedOptions[0]?.textContent].filter(Boolean);
            if (state.preset === 'portfolio' && !years.length) years = [t('domus', 'All years')];
            const period = years.length ? years.join(' – ') : (data ? t('domus', 'No booking years') : state.year || (state.preset === 'annual' ? t('domus', 'Latest year with bookings') : t('domus', 'All booking years')));
            element('context').textContent = [presets().find(p => p.value === state.preset).label, ...scope, period].join(' · ');
        }

        function draw() {
            if (!data || !element('year')) return;
            clearResults();
            if (state.preset === 'portfolio') {
                drawPortfolio();
                return;
            }
            element('values').setAttribute('aria-label', t('domus', 'Booking totals'));
            element('chart').setAttribute('aria-label', t('domus', 'Recorded bookings by account'));
            const years = data.years.map(String);
            const annual = state.preset === 'annual';
            const select = element('year');
            select.innerHTML = (annual ? '' : option('', t('domus', 'All booking years'))) + years.map(year => option(year, year)).join('');
            if (state.year && !years.includes(state.year)) state.year = '';
            select.value = state.year || (annual ? years[years.length - 1] || '' : '');
            select.disabled = !years.length;
            const shownYears = select.value ? [select.value] : years;
            updateContext(shownYears.length > 2 ? [shownYears[0], shownYears[shownYears.length - 1]] : shownYears);
            if (!years.length) {
                element('status').textContent = t('domus', 'No recorded bookings for this scope and selection.');
                return;
            }
            const accounts = getSelectedAccounts();
            const rows = accounts.map(account => ({ ...account, values: shownYears.map(year => Number(data.series[account.number]?.[years.indexOf(year)] || 0)) }));
            // Hide inactive accounts in presets; retain explicit custom selections, even at zero.
            const visible = state.preset === 'custom' ? rows : rows.filter(row => row.values.some(value => value !== 0));
            const values = element('values');
            values.innerHTML = Domus.UI.buildTable(
                [t('domus', 'Account'), ...shownYears],
                visible.map(row => [
                    { content: escape(row.label), rowHeader: true },
                    ...row.values.map(value => escape(Domus.Utils.formatCurrency(value)))
                ]),
                {
                    wrapPanel: false,
                    emptyState: false,
                    caption: t('domus', 'Recorded booking totals'),
                    footer: [
                        { content: escape(t('domus', 'Selected booking total')), rowHeader: true },
                        ...shownYears.map((year, index) => escape(Domus.Utils.formatCurrency(rows.reduce((sum, row) => sum + row.values[index], 0))))
                    ]
                }
            );
            element('status').textContent = visible.length ? '' : t('domus', 'Recorded bookings have a net total of zero for this period.');
            if (!visible.length) return;
            if (!window.Chart) {
                element('status').textContent = t('domus', 'Chart library not available. Booking totals are shown below.');
                return;
            }
            const canvas = element('chart');
            canvas.parentElement.hidden = false;
            const colors = ['#2b7cd3', '#6c4bc1', '#e8793b', '#2f9e77', '#b84592', '#d1a215'];
            chartInstance = new Chart(canvas.getContext('2d'), {
                type: annual ? 'bar' : 'line',
                data: annual ? {
                    labels: visible.map(row => row.label),
                    datasets: [{ label: select.value, data: visible.map(row => row.values[0]), backgroundColor: colors[0] }]
                } : {
                    labels: shownYears,
                    datasets: visible.map((row, index) => ({ label: row.label, data: row.values, borderColor: colors[index % colors.length], backgroundColor: colors[index % colors.length], fill: false, tension: 0.25 }))
                },
                options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: !annual, position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
            });
        }

        function clearResults() {
            destroyChart();
            if (element('chart')) element('chart').parentElement.hidden = true;
            if (element('values')) element('values').innerHTML = '';
            if (element('summary')) {
                element('summary').innerHTML = '';
                element('summary').hidden = true;
            }
        }

        function destroyChart() {
            if (chartInstance) chartInstance.destroy();
            chartInstance = null;
        }
        return { render };
    })();
})();

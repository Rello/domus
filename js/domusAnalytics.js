(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Analytics = (function() {
        let chartInstance = null;
        let requestId = 0;
        let properties = [];
        let units = [];

        function render() {
            Domus.UI.renderSidebar('');
            Domus.UI.renderContent(buildLayout());
            bindControls();
            loadFilters();
        }

        function buildLayout() {
            const options = Domus.Accounts.toOptions(false);
            const optionHtml = options.map(opt => (
                '<option value="' + Domus.Utils.escapeHtml(opt.value) + '">' +
                Domus.Utils.escapeHtml(opt.label || opt.value) +
                '</option>'
            )).join('');
            const emptyState = options.length === 0
                ? '<div class="domus-analytics-empty">' + Domus.Utils.escapeHtml(t('domus', 'No {entity} available.', { entity: t('domus', 'Accounts') })) + '</div>'
                : '';
            const propertyFilter = Domus.Role.isBuildingMgmtView()
                ? '<label class="domus-analytics-filter domus-analytics-property-filter">' +
                    '<span>' + Domus.Utils.escapeHtml(t('domus', 'Property')) + '</span>' +
                    '<select id="domus-analytics-property">' +
                    '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All properties')) + '</option>' +
                    '</select>' +
                    '</label>'
                : '';

            return '<div class="domus-section-header"><h3>' + Domus.Utils.escapeHtml(t('domus', 'Analytics')) + '</h3></div>' +
                '<div class="domus-analytics-layout">' +
                '<div class="domus-analytics-panel">' +
                '<div class="domus-analytics-filters">' +
                propertyFilter +
                '<label class="domus-analytics-filter">' +
                '<span>' + Domus.Utils.escapeHtml(t('domus', 'Unit')) + '</span>' +
                '<select id="domus-analytics-unit">' +
                '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All units')) + '</option>' +
                '</select>' +
                '</label>' +
                '</div>' +
                '<label for="domus-analytics-accounts">' + Domus.Utils.escapeHtml(t('domus', 'Accounts')) + '</label>' +
                '<select id="domus-analytics-accounts" class="domus-analytics-select" multiple size="10">' +
                optionHtml +
                '</select>' +
                '<div class="domus-analytics-hint">' + Domus.Utils.escapeHtml(t('domus', 'Hold Ctrl (Windows) or Command (Mac) to select multiple accounts.')) + '</div>' +
                emptyState +
                '</div>' +
                '<div class="domus-analytics-chart">' +
                '<div id="domus-analytics-status" class="domus-analytics-status">' +
                Domus.Utils.escapeHtml(t('domus', 'Select accounts to view the yearly trend.')) +
                '</div>' +
                '<canvas id="domus-analytics-chart" class="domus-analytics-canvas" aria-label="' + Domus.Utils.escapeHtml(t('domus', 'Account analytics chart')) + '" role="img"></canvas>' +
                '</div>' +
                '</div>';
        }

        function bindControls() {
            const select = document.getElementById('domus-analytics-accounts');
            const unitSelect = document.getElementById('domus-analytics-unit');
            if (!select) {
                return;
            }

            select.addEventListener('change', () => {
                updateChart(getSelectedAccounts(select), getSelectedFilters());
            });

            const propertySelect = document.getElementById('domus-analytics-property');
            propertySelect?.addEventListener('change', () => {
                updateChart(getSelectedAccounts(select), getSelectedFilters());
            });

            unitSelect?.addEventListener('change', () => {
                updateChart(getSelectedAccounts(select), getSelectedFilters());
            });

            updateChart(getSelectedAccounts(select), getSelectedFilters());
        }

        function getSelectedAccounts(select) {
            return Array.from(select.selectedOptions || [])
                .map(option => {
                    const value = option.value;
                    const normalized = normalizeAccountNumber(value);
                    return {
                        value,
                        normalized,
                        label: option.textContent || value || normalized
                    };
                })
                .filter(entry => entry.normalized !== '');
        }

        function updateChart(accounts, filters = {}) {
            const status = document.getElementById('domus-analytics-status');
            if (!window.Chart) {
                if (status) {
                    status.textContent = t('domus', 'Chart library not available.');
                }
                return;
            }

            if (!accounts.length) {
                destroyChart();
                if (status) {
                    status.textContent = t('domus', 'Select accounts to view the yearly trend.');
                }
                return;
            }

            if (status) {
                status.textContent = t('domus', 'Loading…');
            }

            const currentRequest = ++requestId;
            const uniqueAccounts = [];
            const accountLabels = {};
            accounts.forEach(entry => {
                if (!entry || !entry.normalized) {
                    return;
                }
                if (!uniqueAccounts.includes(entry.normalized)) {
                    uniqueAccounts.push(entry.normalized);
                }
                accountLabels[entry.normalized] = entry.label || entry.value || entry.normalized;
            });

            Domus.Api.getAccountTotals(uniqueAccounts, filters)
                .then(data => {
                    if (currentRequest !== requestId) {
                        return;
                    }
                    renderChart(data || {}, uniqueAccounts, accountLabels);
                })
                .catch(err => {
                    destroyChart();
                    if (status) {
                        status.textContent = err.message || t('domus', 'An error occurred');
                    }
                });
        }

        function renderChart(data, accounts, accountLabels = {}) {
            const status = document.getElementById('domus-analytics-status');
            const canvas = document.getElementById('domus-analytics-chart');
            if (!canvas) {
                return;
            }

            const years = Array.isArray(data.years) ? data.years : [];
            const series = data.series || {};
            if (!years.length) {
                destroyChart();
                if (status) {
                    status.textContent = t('domus', 'No analytics data found.');
                }
                return;
            }

            if (status) {
                status.textContent = '';
            }

            const colors = [
                '#2b7cd3',
                '#6c4bc1',
                '#e8793b',
                '#2f9e77',
                '#b84592',
                '#d1a215',
                '#24689e',
                '#b05d24'
            ];

            const datasets = accounts.map((account, index) => {
                const values = Array.isArray(series[account]) ? series[account] : new Array(years.length).fill(0);
                const labelParts = [account, accountLabels[account] || Domus.Accounts.label(account)].filter(Boolean);
                return {
                    label: labelParts.join(' — '),
                    data: values,
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    fill: false,
                    tension: 0.25
                };
            });

            const chartData = {
                labels: years.map(year => year.toString()),
                datasets
            };

            destroyChart();
            chartInstance = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                        duration: 300
                    },
                    interaction: {
                        mode: 'nearest',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        function destroyChart() {
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
        }

        function normalizeAccountNumber(value) {
            const raw = (value || '').toString().trim();
            if (raw === '') {
                return '';
            }
            const normalized = raw.replace(/^0+/, '');
            return normalized === '' ? '0' : normalized;
        }

        function loadFilters() {
            const propertySelect = document.getElementById('domus-analytics-property');
            const unitSelect = document.getElementById('domus-analytics-unit');
            if (!unitSelect) {
                return;
            }
            if (propertySelect && Domus.Role.isBuildingMgmtView()) {
                Domus.Api.getProperties()
                    .then(list => {
                        properties = list || [];
                        propertySelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All properties')) + '</option>' +
                            properties.map(item => (
                                '<option value="' + Domus.Utils.escapeHtml(String(item.id)) + '">' +
                                Domus.Utils.escapeHtml(item.name || '') +
                                '</option>'
                            )).join('');
                    })
                    .catch(() => {
                        propertySelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All properties')) + '</option>';
                    });
            } else if (propertySelect) {
                propertySelect.closest('.domus-analytics-property-filter')?.classList.add('domus-hidden');
            }
            updateUnits();
        }

        function updateUnits() {
            const unitSelect = document.getElementById('domus-analytics-unit');
            if (!unitSelect) {
                return;
            }
            unitSelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All units')) + '</option>';
            unitSelect.disabled = false;
            Domus.Api.getUnits()
                .then(list => {
                    units = list || [];
                    unitSelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All units')) + '</option>' +
                        units.map(item => (
                            '<option value="' + Domus.Utils.escapeHtml(String(item.id)) + '">' +
                            Domus.Utils.escapeHtml(item.label || item.name || '') +
                            '</option>'
                        )).join('');
                })
                .catch(() => {
                    units = [];
                    unitSelect.innerHTML = '<option value="">' + Domus.Utils.escapeHtml(t('domus', 'All units')) + '</option>';
                });
        }

        function getSelectedFilters() {
            const propertySelect = document.getElementById('domus-analytics-property');
            const unitSelect = document.getElementById('domus-analytics-unit');
            const filters = {};
            if (propertySelect && Domus.Role.isBuildingMgmtView() && propertySelect.value) {
                filters.propertyId = propertySelect.value;
            }
            if (unitSelect && unitSelect.value) {
                filters.unitId = unitSelect.value;
            }
            return filters;
        }

        return { render };
    })();

    /**
     * Properties view
     */
})();

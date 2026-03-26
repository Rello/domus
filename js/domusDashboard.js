(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Dashboard = (function() {
        let occupancyChartInstance = null;

        function destroyOccupancyChart() {
            if (occupancyChartInstance) {
                occupancyChartInstance.destroy();
                occupancyChartInstance = null;
            }
        }

        function render() {
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Dashboard') }));

            const summaryPromise = Domus.Api.getDashboardSummary();

            Promise.resolve(summaryPromise)
                .then((data) => {
                    const html = buildContent(data || {});
                    Domus.UI.renderContent(html);
                    bindDashboard(data || {});
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDashboard(data) {
            destroyOccupancyChart();
            if (!Domus.Role.isBuildingMgmtView() && !Domus.Role.isTenantView()) {
                renderOccupancyChart(data?.occupancy || null);
            }
        }

        function buildContent(data) {
            if (Domus.Role.isTenantView()) {
                return buildTenantDashboard(data);
            }
            if (Domus.Role.isBuildingMgmtView()) {
                return buildBuildingMgmtDashboard(data);
            }
            return buildLandlordDashboard(data);
        }

        function buildLandlordDashboard(data) {
            const tenancyLabels = Domus.Role.getTenancyLabels();
            const cards = [
                { label: t('domus', 'Units'), value: data.unitCount || 0, link: '#/units' },
                { label: tenancyLabels.plural, value: data.tenancyCount || 0 },
                { label: t('domus', 'Monthly base rents'), value: data.monthlyBaseRentSum || 0, formatter: Domus.Utils.formatCurrency }
            ];

            const cardHtml = cards.map(card => {
                const renderedValue = card.formatter ? card.formatter(card.value) : card.value;
                const safeValue = renderedValue === undefined || renderedValue === null ? '' : renderedValue.toString();
                return '<div class="domus-kpi-tile domus-dashboard-summary-tile">' +
                    '<div class="domus-kpi-content">' +
                    '<div class="domus-kpi-headline">' + Domus.Utils.escapeHtml(card.label) + '</div>' +
                    '<div class="domus-kpi-value">' + Domus.Utils.escapeHtml(safeValue) + '</div>' +
                    (card.link
                        ? '<a href="' + Domus.Utils.escapeHtml(card.link) + '" class="domus-kpi-more">' + Domus.Utils.escapeHtml(card.label) + '</a>'
                        : '') +
                    '</div>' +
                    '</div>';
            }).join('');

            const hasUnits = (data.unitCount || 0) > 0;
            const openTasksTable = hasUnits
                ? Domus.Tasks.buildOpenTasksTable(data.openTasks || [], {
                    showTitle: false,
                    titleBelowUnit: true,
                    showType: true,
                    showAction: false,
                    emptyMessage: t('domus', 'There is no {entity} yet. Create the first one', {
                        entity: t('domus', 'Tasks')
                    }),
                    emptyActionId: 'domus-dashboard-task-create',
                    emptyIconClass: 'domus-icon-task'
                })
                : '';

            setTimeout(() => {
                Domus.UI.bindRowNavigation();
                if (hasUnits) {
                    Domus.Tasks.bindOpenTaskActions({ onRefresh: () => Domus.Router.navigate('dashboard') });
                }
                if (hasUnits) {
                    document.getElementById('domus-dashboard-task-create')?.addEventListener('click', () => {
                        Domus.Tasks.openCreateTaskModalWithUnitSelect(() => Domus.Router.navigate('dashboard'));
                    });
                }
            }, 0);

            const occupancy = data.occupancy || {};
            const occupiedUnits = Number(occupancy.occupied) || 0;
            const vacantUnits = Number(occupancy.vacant) || 0;
            const totalUnits = occupiedUnits + vacantUnits;
            const occupancyTile = hasUnits
                ? '<div class="domus-kpi-tiles domus-dashboard-kpi-row">' +
                    '<div class="domus-kpi-tile domus-dashboard-occupancy-tile">' +
                    '<div class="domus-kpi-content">' +
                    '<div class="domus-kpi-headline">' + Domus.Utils.escapeHtml(t('domus', 'Occupancy')) + '</div>' +
                    '<div class="domus-kpi-value">' + Domus.Utils.escapeHtml(`${occupiedUnits} ${t('domus', 'of')} ${totalUnits}`) + '</div>' +
                    '<a href="#/units" class="domus-kpi-more">' + Domus.Utils.escapeHtml(t('domus', 'Units')) + '</a>' +
                    '</div>' +
                    '<div class="domus-kpi-chart domus-dashboard-occupancy-chart">' +
                    '<div class="domus-kpi-chart-inner">' +
                    '<canvas id="domus-dashboard-occupancy-chart" class="domus-kpi-chart-canvas" aria-label="' + Domus.Utils.escapeHtml(t('domus', 'Occupied vs vacant units')) + '" role="img"></canvas>' +
                    '</div>' +
                    '</div>' +
                    '</div>' + cardHtml +
                    '</div>'
                : '';

            return occupancyTile +
                (!hasUnits ? '<div class="domus-kpi-tiles domus-dashboard-kpi-row">' + cardHtml + '</div>' : '') +
                (hasUnits ? '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Open tasks')) + '</h2>' + openTasksTable : '');
        }

        function renderOccupancyChart(occupancy) {
            const canvas = document.getElementById('domus-dashboard-occupancy-chart');
            if (!canvas || !window.Chart || !occupancy) {
                return;
            }

            const occupiedUnits = Number(occupancy.occupied) || 0;
            const vacantUnits = Number(occupancy.vacant) || 0;
            const totalUnits = occupiedUnits + vacantUnits;
            if (!totalUnits) {
                return;
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                return;
            }

            const rootStyles = getComputedStyle(document.documentElement);
            const occupiedColor = rootStyles.getPropertyValue('--color-success').trim() || '#0f6b2f';
            const vacantColor = rootStyles.getPropertyValue('--color-background-hover').trim() || '#d8dde6';

            occupancyChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [t('domus', 'Occupied'), t('domus', 'Vacant')],
                    datasets: [{
                        data: [occupiedUnits, vacantUnits],
                        backgroundColor: [occupiedColor, vacantColor],
                        borderWidth: 0,
                        hoverOffset: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '68%',
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => `${context.label}: ${context.parsed}`
                            }
                        }
                    }
                }
            });
        }

        function buildBuildingMgmtDashboard(data) {
            const cards = [
                { label: t('domus', 'Properties'), value: data.propertyCount || 0, link: '#/properties' },
                { label: t('domus', 'Units'), value: data.unitCount || 0, link: '#/units' },
                { label: t('domus', 'Managed owners'), value: data.tenancyCount || 0 },
                { label: t('domus', 'Bookings this year'), value: data.bookingCount || 0 }
            ];

            const cardHtml = cards.map(card => {
                const content = '<div class="domus-stat-label">' + Domus.Utils.escapeHtml(card.label) + '</div>' +
                    '<div class="domus-stat-value">' + Domus.Utils.escapeHtml(card.value.toString()) + '</div>';
                const wrappedContent = card.link
                    ? '<a class="domus-stat-card-link" href="' + Domus.Utils.escapeHtml(card.link) + '">' + content + '</a>'
                    : content;
                return '<div class="domus-stat-card">' + wrappedContent + '</div>';
            }).join('');

            const hasProperties = (data.propertyCount || 0) > 0;
            const openTasksTable = hasProperties
                ? Domus.Tasks.buildOpenTasksTable(data.openTasks || [], {
                    showTitle: false,
                    titleBelowUnit: true,
                    showType: true,
                    showAction: false,
                    emptyMessage: t('domus', 'There is no {entity} yet. Create the first one', {
                        entity: t('domus', 'Tasks')
                    }),
                    emptyActionId: 'domus-dashboard-task-create',
                    emptyIconClass: 'domus-icon-task'
                })
                : '';

            setTimeout(() => {
                Domus.UI.bindRowNavigation();
                if (hasProperties) {
                    Domus.Tasks.bindOpenTaskActions({ onRefresh: () => Domus.Router.navigate('dashboard') });
                }
                if (hasProperties) {
                    document.getElementById('domus-dashboard-task-create')?.addEventListener('click', () => {
                        Domus.Tasks.openCreateTaskModalWithUnitSelect(() => Domus.Router.navigate('dashboard'));
                    });
                }
            }, 0);

            return '<div class="domus-stat-grid">' + cardHtml + '</div>' +
                (hasProperties ? '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Open tasks')) + '</h2>' + openTasksTable : '');
        }

        function buildTenantDashboard(data) {
            const tenancyRows = (data.tenancies || []).map(tn => ({
                cells: [
                    Domus.Utils.escapeHtml(tn.unitLabel || ''),
                    Domus.Utils.escapeHtml(tn.period || ''),
                    Domus.Utils.escapeHtml(tn.status || '')
                ],
                dataset: { navigate: 'tenancyDetail', args: tn.id }
            }));
            const reportRows = (data.reports || []).map(rp => [
                Domus.Utils.escapeHtml(rp.propertyName || ''),
                Domus.Utils.escapeHtml((rp.year || Domus.state.currentYear).toString()),
                '<a class="domus-link" href="' + Domus.Utils.escapeHtml(rp.downloadUrl || '#') + '">' + Domus.Utils.escapeHtml(t('domus', 'Download')) + '</a>'
            ]);

            setTimeout(Domus.UI.bindRowNavigation, 0);

            return '<h2>' + Domus.Utils.escapeHtml(t('domus', 'My tenancies')) + '</h2>' +
                Domus.UI.buildTable([t('domus', 'Unit'), t('domus', 'Period'), t('domus', 'Status')], tenancyRows) +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'My reports')) + '</h2>' +
                Domus.UI.buildTable([t('domus', 'Property'), t('domus', 'Year'), ''], reportRows);
        }

        return { render };
    })();

    /**
     * Analytics view
     */
})();

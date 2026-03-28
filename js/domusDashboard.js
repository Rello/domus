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

        function buildUpcomingPanel(content) {
            return '<div class="domus-panel domus-panel-half">' +
                Domus.UI.buildSectionHeader(t('domus', 'Upcoming')) +
                '<div class="domus-panel-body">' + content + '</div>' +
                '</div>';
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
                return Domus.UI.buildKpiTile({
                    headline: card.label,
                    value: safeValue,
                    linkHref: card.link || '',
                    linkLabel: t('domus', 'More'),
                    tileClassName: 'domus-dashboard-summary-tile'
                });
            }).join('');

            const hasUnits = (data.unitCount || 0) > 0;
            const openTasksTable = hasUnits
                ? Domus.Tasks.buildOpenTasksTable(data.openTasks || [], {
                    showTitle: false,
                    showHeader: false,
                    titleBelowUnit: true,
                    showType: false,
                    showAction: false,
                    wrapPanel: false,
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
                    Domus.UI.buildKpiTile({
                        headline: t('domus', 'Occupancy'),
                        value: `${occupiedUnits} ${t('domus', 'of')} ${totalUnits}`,
                        linkHref: '#/units',
                        linkLabel: t('domus', 'More'),
                        chartId: 'domus-dashboard-occupancy-chart',
                        showChart: true,
                        chartClassName: 'domus-dashboard-occupancy-chart',
                        chartAriaLabel: t('domus', 'Occupied vs vacant units'),
                        chartRole: 'img',
                        tileClassName: 'domus-dashboard-occupancy-tile'
                    }) +
                    cardHtml +
                    '</div>'
                : '';

            return occupancyTile +
                (!hasUnits ? '<div class="domus-kpi-tiles domus-dashboard-kpi-row">' + cardHtml + '</div>' : '') +
                (hasUnits ? buildUpcomingPanel(openTasksTable) : '');
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
                return Domus.UI.buildKpiTile({
                    headline: card.label,
                    value: card.value.toString(),
                    linkHref: card.link || '',
                    linkLabel: t('domus', 'More'),
                    tileClassName: 'domus-dashboard-summary-tile'
                });
            }).join('');

            const hasProperties = (data.propertyCount || 0) > 0;
            const openTasksTable = hasProperties
                ? Domus.Tasks.buildOpenTasksTable(data.openTasks || [], {
                    showTitle: false,
                    showHeader: false,
                    titleBelowUnit: true,
                    showType: false,
                    showAction: false,
                    wrapPanel: false,
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

            return '<div class="domus-kpi-tiles domus-dashboard-kpi-row">' + cardHtml + '</div>' +
                (hasProperties ? buildUpcomingPanel(openTasksTable) : '');
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

(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Dashboard = (function() {
        function render() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Dashboard') }));

            const summaryPromise = Domus.Api.getDashboardSummary();
            const unitsPromise = Domus.Role.isTenantView() || Domus.Role.isBuildingMgmtView()
                ? Promise.resolve(null)
                : Domus.Api.getUnitsStatisticsOverview();

            Promise.all([summaryPromise, unitsPromise])
                .then(([data, unitsOverview]) => {
                    const html = buildHeader() + buildContent(data || {}, unitsOverview);
                    Domus.UI.renderContent(html);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function buildHeader() {
            const filter = Domus.UI.buildYearFilter(() => Domus.Router.navigate('dashboard'));
            return '<div class="domus-toolbar">' + filter + '</div>';
        }

        function buildContent(data, unitsOverview) {
            if (Domus.Role.isTenantView()) {
                return buildTenantDashboard(data);
            }
            if (Domus.Role.isBuildingMgmtView()) {
                return buildBuildingMgmtDashboard(data);
            }
            return buildLandlordDashboard(data, unitsOverview);
        }

        function buildLandlordDashboard(data, unitsOverview) {
            const tenancyLabels = Domus.Role.getTenancyLabels();
            const cards = [
                { label: t('domus', 'Units'), value: data.unitCount || 0 },
                { label: tenancyLabels.plural, value: data.tenancyCount || 0 },
                { label: t('domus', 'Monthly base rents'), value: data.monthlyBaseRentSum || 0, formatter: Domus.Utils.formatCurrency }
            ];

            const cardHtml = cards.map(card => {
                const renderedValue = card.formatter ? card.formatter(card.value) : card.value;
                const safeValue = renderedValue === undefined || renderedValue === null ? '' : renderedValue.toString();
                return '<div class="domus-stat-card"><div class="domus-stat-label">' +
                    Domus.Utils.escapeHtml(card.label) + '</div><div class="domus-stat-value">' +
                    Domus.Utils.escapeHtml(safeValue) + '</div></div>';
            }).join('');

            const hasUnits = (unitsOverview?.rows || []).length > 0;
            const table = hasUnits
                ? Domus.Units.renderStatisticsTable(unitsOverview, {
                    buildRowDataset: (row) => row.unitId ? { navigate: 'unitDetail', args: row.unitId } : null,
                    totals: [
                        { key: 'gwb', label: t('domus', 'Total {label}', { label: t('domus', 'Gross profit') }) }
                    ]
                })
                : Domus.UI.buildEmptyStateAction(
                    t('domus', 'There is no {entity} yet. Create the first one', {
                        entity: t('domus', 'Units')
                    }),
                    {
                        iconClass: 'domus-icon-unit',
                        actionId: 'domus-dashboard-unit-create'
                    }
                );

            const openTasksTable = Domus.Tasks.buildOpenTasksTable(data.openTasks || [], {
                showDescription: false,
                showType: false,
                showAction: false,
                emptyMessage: t('domus', 'There is no {entity} yet. Create the first one', {
                    entity: t('domus', 'Tasks')
                }),
                emptyActionId: 'domus-dashboard-task-create',
                emptyIconClass: 'domus-icon-task'
            });

            setTimeout(() => {
                Domus.UI.bindRowNavigation();
                Domus.Tasks.bindOpenTaskActions({ onRefresh: () => Domus.Router.navigate('dashboard') });
                document.getElementById('domus-dashboard-unit-create')?.addEventListener('click', () => {
                    Domus.Units.openCreateModal();
                });
                document.getElementById('domus-dashboard-task-create')?.addEventListener('click', () => {
                    Domus.Tasks.openCreateTaskModalWithUnitSelect(() => Domus.Router.navigate('dashboard'));
                });
            }, 0);

            return '<div class="domus-stat-grid">' + cardHtml + '</div>' +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Open tasks')) + '</h2>' +
                openTasksTable +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Units overview')) + '</h2>' + table;
        }

        function buildBuildingMgmtDashboard(data) {
            const cards = [
                { label: t('domus', 'Properties'), value: data.propertyCount || 0 },
                { label: t('domus', 'Units'), value: data.unitCount || 0 },
                { label: t('domus', 'Managed owners'), value: data.tenancyCount || 0 },
                { label: t('domus', 'Bookings this year'), value: data.bookingCount || 0 }
            ];

            const cardHtml = cards.map(card => '<div class="domus-stat-card"><div class="domus-stat-label">' +
                Domus.Utils.escapeHtml(card.label) + '</div><div class="domus-stat-value">' +
                Domus.Utils.escapeHtml(card.value.toString()) + '</div></div>').join('');

            const propertyRows = (data.properties || []).map(p => ({
                cells: [
                    Domus.Utils.escapeHtml(p.name || ''),
                    Domus.Utils.escapeHtml(p.city || ''),
                    Domus.Utils.escapeHtml((p.unitCount || 0).toString())
                ],
                dataset: { navigate: 'propertyDetail', args: p.id }
            }));

            const hasProperties = propertyRows.length > 0;
            const table = hasProperties
                ? Domus.UI.buildTable([
                    t('domus', 'Name'), t('domus', 'City'), t('domus', 'Units')
                ], propertyRows)
                : Domus.UI.buildEmptyStateAction(
                    t('domus', 'There is no {entity} yet. Create the first one', {
                        entity: t('domus', 'Properties')
                    }),
                    {
                        iconClass: 'domus-icon-property',
                        actionId: 'domus-dashboard-property-create'
                    }
                );

            const openTasksTable = Domus.Tasks.buildOpenTasksTable(data.openTasks || [], {
                showDescription: false,
                showType: false,
                showAction: false,
                emptyMessage: t('domus', 'There is no {entity} yet. Create the first one', {
                    entity: t('domus', 'Tasks')
                }),
                emptyActionId: 'domus-dashboard-task-create',
                emptyIconClass: 'domus-icon-task'
            });

            setTimeout(() => {
                Domus.UI.bindRowNavigation();
                Domus.Tasks.bindOpenTaskActions({ onRefresh: () => Domus.Router.navigate('dashboard') });
                document.getElementById('domus-dashboard-property-create')?.addEventListener('click', () => {
                    Domus.Properties.openCreateModal?.();
                });
                document.getElementById('domus-dashboard-task-create')?.addEventListener('click', () => {
                    Domus.Tasks.openCreateTaskModalWithUnitSelect(() => Domus.Router.navigate('dashboard'));
                });
            }, 0);

            return '<div class="domus-stat-grid">' + cardHtml + '</div>' +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Open tasks')) + '</h2>' +
                openTasksTable +
                '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Properties overview')) + '</h2>' + table;
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

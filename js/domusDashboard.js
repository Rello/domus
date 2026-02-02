(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Dashboard = (function() {
        function render() {
            Domus.UI.renderSidebar('');
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Dashboard') }));

            Domus.Api.getDashboardSummary()
                .then(data => {
                    const html = buildContent(data || {});
                    Domus.UI.renderContent(html);
                })
                .catch(err => Domus.UI.showError(err.message));
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

        function buildStatCards(cards) {
            return cards.map(card => {
                const renderedValue = card.formatter ? card.formatter(card.value) : card.value;
                const safeValue = renderedValue === undefined || renderedValue === null ? '' : renderedValue.toString();
                const isLink = Boolean(card.navigate);
                const tag = isLink ? 'button' : 'div';
                const classes = 'domus-stat-card' + (isLink ? ' domus-stat-card-link' : '');
                const dataAttrs = isLink
                    ? ' data-navigate="' + Domus.Utils.escapeHtml(card.navigate) + '"'
                    : '';
                const typeAttr = isLink ? ' type="button"' : '';

                return '<' + tag + typeAttr + ' class="' + classes + '"' + dataAttrs + '><div class="domus-stat-label">' +
                    Domus.Utils.escapeHtml(card.label) + '</div><div class="domus-stat-value">' +
                    Domus.Utils.escapeHtml(safeValue) + '</div></' + tag + '>';
            }).join('');
        }

        function bindKpiNavigation() {
            document.querySelectorAll('.domus-stat-card-link[data-navigate]').forEach(card => {
                if (card.dataset.domusBound) {
                    return;
                }
                card.dataset.domusBound = 'true';
                card.addEventListener('click', () => {
                    const target = card.getAttribute('data-navigate');
                    if (target) {
                        Domus.Router.navigate(target);
                    }
                });
            });
        }

        function buildLandlordDashboard(data) {
            const tenancyLabels = Domus.Role.getTenancyLabels();
            const cards = [
                { label: t('domus', 'Units'), value: data.unitCount || 0, navigate: 'units' },
                { label: tenancyLabels.plural, value: data.tenancyCount || 0 },
                { label: t('domus', 'Monthly base rents'), value: data.monthlyBaseRentSum || 0, formatter: Domus.Utils.formatCurrency }
            ];

            const cardHtml = buildStatCards(cards);

            const hasUnits = (data.unitCount || 0) > 0;
            const openTasksTable = hasUnits
                ? Domus.Tasks.buildOpenTasksTable(data.openTasks || [], {
                    showDescription: false,
                    showType: false,
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
                bindKpiNavigation();
            }, 0);

            return '<div class="domus-stat-grid">' + cardHtml + '</div>' +
                (hasUnits ? '<h2>' + Domus.Utils.escapeHtml(t('domus', 'Open tasks')) + '</h2>' + openTasksTable : '');
        }

        function buildBuildingMgmtDashboard(data) {
            const cards = [
                { label: t('domus', 'Properties'), value: data.propertyCount || 0, navigate: 'properties' },
                { label: t('domus', 'Units'), value: data.unitCount || 0, navigate: 'units' },
                { label: t('domus', 'Managed owners'), value: data.tenancyCount || 0 },
                { label: t('domus', 'Bookings this year'), value: data.bookingCount || 0 }
            ];

            const cardHtml = buildStatCards(cards);

            const hasProperties = (data.propertyCount || 0) > 0;
            const openTasksTable = hasProperties
                ? Domus.Tasks.buildOpenTasksTable(data.openTasks || [], {
                    showDescription: false,
                    showType: false,
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
                bindKpiNavigation();
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

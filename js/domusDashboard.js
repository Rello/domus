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
            if (!Domus.Role.isTenantView()) {
                bindQuickActions(data);
            }
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
            return '<div class="domus-panel domus-panel-half domus-upcoming-card-shell">' +
                Domus.UI.buildSectionHeader(t('domus', 'Upcoming')) +
                '<div class="domus-panel-body">' + content + '</div>' +
                '</div>';
        }

        function buildQuickActionsPanel(options = {}) {
            const isEmptyState = options.isEmptyState === true;
            const quickCards = [
                buildQuickUploadCard({ disabled: isEmptyState }),
                {
                    id: 'domus-dashboard-action-log-create',
                    iconClass: 'domus-icon-action-custom',
                    title: t('domus', 'Add log entry'),
                    copy: t('domus', 'Capture a quick note or event'),
                    disabled: isEmptyState
                },
                {
                    id: 'domus-dashboard-unit-create',
                    iconClass: 'domus-icon-unit',
                    title: isEmptyState ? t('domus', 'Add first unit') : t('domus', 'Add unit'),
                    copy: t('domus', 'Create a new rentable object'),
                    prominent: isEmptyState
                },
                {
                    id: 'domus-dashboard-partner-create',
                    iconClass: 'domus-icon-partner',
                    title: t('domus', 'Add partner'),
                    copy: t('domus', 'Create a contact or stakeholder'),
                    disabled: isEmptyState
                }
            ].map(item => typeof item === 'string' ? item : buildQuickActionCard(item)).join('');

            return '<div class="domus-panel domus-panel-half domus-dashboard-quick-panel">' +
                Domus.UI.buildSectionHeader(t('domus', 'Quick Actions')) +
                '<div class="domus-panel-body">' +
                '<div class="domus-dashboard-quick-grid">' + quickCards + '</div>' +
                '</div>' +
                '</div>';
        }

        function buildQuickUploadCard(options = {}) {
            const disabled = options.disabled === true;
            const cardClassName = 'domus-dashboard-quick-card domus-dashboard-quick-card-upload' + (disabled ? ' domus-dashboard-quick-card-disabled' : '');
            const roleAttr = disabled ? '' : ' role="button" tabindex="0"';
            const disabledAttr = disabled ? ' aria-disabled="true"' : '';
            const inputHtml = disabled ? '' : '<input type="file" class="domus-dashboard-quick-upload-input" id="domus-dashboard-quick-upload-input" aria-hidden="true" tabindex="-1">';

            return '<div class="' + Domus.Utils.escapeHtml(cardClassName) + '" id="domus-dashboard-quick-upload"' + roleAttr + disabledAttr + ' aria-label="' + Domus.Utils.escapeHtml(t('domus', 'Upload document. Add new file or drop here')) + '">' +
                inputHtml +
                '<span class="domus-dashboard-quick-card-main">' +
                '<span class="domus-dashboard-quick-card-icon-wrap">' +
                '<span class="domus-icon domus-icon-document domus-dashboard-quick-card-icon" aria-hidden="true"></span>' +
                '</span>' +
                '<span class="domus-dashboard-quick-card-copy">' +
                '<span class="domus-dashboard-quick-card-title">' + Domus.Utils.escapeHtml(t('domus', 'Upload document')) + '</span>' +
                '<span class="domus-dashboard-quick-card-subtitle">' + Domus.Utils.escapeHtml(t('domus', 'Add new file or drop here')) + '</span>' +
                '</span>' +
                '</span>' +
                '<span class="domus-dashboard-quick-card-plus" aria-hidden="true">+</span>' +
                '</div>';
        }

        function buildQuickActionCard(action) {
            const disabled = action.disabled === true;
            const prominent = action.prominent === true;
            const cardClassName = 'domus-dashboard-quick-card' +
                (disabled ? ' domus-dashboard-quick-card-disabled' : '') +
                (prominent ? ' domus-dashboard-quick-card-prominent' : '');
            const roleAttr = disabled ? '' : ' role="button" tabindex="0"';
            const disabledAttr = disabled ? ' aria-disabled="true"' : '';

            return '<div class="' + Domus.Utils.escapeHtml(cardClassName) + '" id="' + Domus.Utils.escapeHtml(action.id) + '"' + roleAttr + disabledAttr + ' aria-label="' + Domus.Utils.escapeHtml(action.title) + '">' +
                '<span class="domus-dashboard-quick-card-main">' +
                '<span class="domus-dashboard-quick-card-icon-wrap">' +
                '<span class="domus-icon ' + Domus.Utils.escapeHtml(action.iconClass) + ' domus-dashboard-quick-card-icon" aria-hidden="true"></span>' +
                '</span>' +
                '<span class="domus-dashboard-quick-card-copy">' +
                '<span class="domus-dashboard-quick-card-title">' + Domus.Utils.escapeHtml(action.title) + '</span>' +
                '<span class="domus-dashboard-quick-card-subtitle">' + Domus.Utils.escapeHtml(action.copy) + '</span>' +
                '</span>' +
                '</span>' +
                '<span class="domus-dashboard-quick-card-plus" aria-hidden="true">+</span>' +
                '</div>';
        }

        function bindQuickActionTrigger(id, onTrigger) {
            const element = document.getElementById(id);
            if (!element || typeof onTrigger !== 'function') {
                return;
            }

            element.addEventListener('click', onTrigger);
            element.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }
                event.preventDefault();
                onTrigger();
            });
        }

        function bindQuickActions(data) {
            const hasUnits = Number(data?.unitCount || 0) > 0;
            const isEmptyState = !hasUnits;

            if (!isEmptyState) {
                mountQuickUploadDropZone();
            }

            if (!isEmptyState) {
                bindQuickActionTrigger('domus-dashboard-action-log-create', () => {
                    Domus.ActionLog.openCreateModal({
                        onSaved: () => Domus.Router.navigate('dashboard')
                    });
                });
            }

            bindQuickActionTrigger('domus-dashboard-unit-create', () => {
                Domus.Units.openCreateModal({}, () => Domus.Router.navigate('dashboard'));
            });

            if (!isEmptyState) {
                bindQuickActionTrigger('domus-dashboard-partner-create', () => {
                    Domus.Partners.openCreateModal({}, () => Domus.Router.navigate('dashboard'));
                });
            }
        }

        function mountQuickUploadDropZone() {
            const target = document.getElementById('domus-dashboard-quick-upload');
            const input = document.getElementById('domus-dashboard-quick-upload-input');
            if (!target || !input || target.dataset.domusQuickUploadMounted) {
                return;
            }

            target.dataset.domusQuickUploadMounted = 'true';
            let isChoosing = false;

            const openBookingCreateWithFile = (file) => {
                if (!file) {
                    return;
                }

                Domus.Bookings.openCreateModal({}, () => Domus.Router.navigate('dashboard'), {
                    createContext: 'document',
                    initialDocumentSelection: {
                        type: 'upload',
                        file,
                        title: inferDocumentTitle(file.name)
                    }
                });
                input.value = '';
            };

            const triggerPicker = (event) => {
                if (event?.type === 'keydown') {
                    event.preventDefault();
                }
                if (isChoosing) {
                    return;
                }
                isChoosing = true;
                try {
                    if (typeof input.showPicker === 'function') {
                        input.showPicker();
                    } else {
                        input.click();
                    }
                } catch (error) {
                    console.warn('[Domus] Dashboard upload picker failed', error);
                }
                setTimeout(() => {
                    isChoosing = false;
                }, 300);
            };

            target.addEventListener('click', triggerPicker);
            target.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    triggerPicker(event);
                }
            });

            input.addEventListener('click', event => {
                event.stopPropagation();
            });
            input.addEventListener('change', () => {
                openBookingCreateWithFile(input.files?.[0] || null);
            });

            const setHover = (active) => {
                target.classList.toggle('domus-dashboard-quick-card-drop-hover', active);
            };

            ['dragenter', 'dragover'].forEach(eventName => {
                target.addEventListener(eventName, event => {
                    event.preventDefault();
                    event.stopPropagation();
                    setHover(true);
                });
            });

            ['dragleave', 'dragend'].forEach(eventName => {
                target.addEventListener(eventName, event => {
                    event.preventDefault();
                    event.stopPropagation();
                    setHover(false);
                });
            });

            target.addEventListener('drop', event => {
                event.preventDefault();
                event.stopPropagation();
                setHover(false);
                openBookingCreateWithFile(event.dataTransfer?.files?.[0] || null);
            });
        }

        function inferDocumentTitle(fileName) {
            const normalizedName = String(fileName || '').trim();
            if (!normalizedName) {
                return undefined;
            }

            const extensionIndex = normalizedName.lastIndexOf('.');
            return extensionIndex > 0 ? normalizedName.substring(0, extensionIndex) : normalizedName;
        }

        function buildLandlordDashboard(data) {
            const cards = [
                {
                    label: t('domus', 'Monthly base rents'),
                    value: data.monthlyBaseRentSum || 0,
                    formatter: value => `€ ${Domus.Utils.formatNumber(Math.round(Number(value) || 0), { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
                    subline: t('domus', 'Total')
                },
                { label: t('domus', 'Overall rentability'), value: data.overallRentability, formatter: value => value === null || value === undefined ? '—' : Domus.Utils.formatPercentage(value), subline: t('domus', 'Current year') },
                { label: t('domus', 'Units'), value: data.unitCount || 0, subline: t('domus', 'Active'), link: '#/units' }
            ];

            const cardHtml = cards.map(card => {
                const renderedValue = card.formatter ? card.formatter(card.value) : card.value;
                const safeValue = renderedValue === undefined || renderedValue === null ? '' : renderedValue.toString();
                return Domus.UI.buildKpiTile({
                    headline: card.label,
                    value: safeValue,
                    subline: card.subline || '',
                    linkHref: card.link || '',
                    linkLabel: t('domus', 'More'),
                    linkIconClass: 'domus-icon-arrow-right',
                    tileClassName: 'domus-dashboard-summary-tile domus-dashboard-kpi-tile'
                });
            }).join('');

            const hasUnits = (data.unitCount || 0) > 0;
            const openTasksTable = hasUnits
                ? Domus.Tasks.buildOpenTasksTable(data.openTasks || [], {
                    layout: 'overviewCards',
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
                    bindQuickActionTrigger('domus-dashboard-task-create', () => {
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
                        linkIconClass: 'domus-icon-arrow-right',
                        chartId: 'domus-dashboard-occupancy-chart',
                        showChart: true,
                        chartCenterLabel: `${occupiedUnits} ${t('domus', 'of')} ${totalUnits}`,
                        chartClassName: 'domus-dashboard-occupancy-chart',
                        chartAriaLabel: t('domus', 'Occupied vs vacant units'),
                        chartRole: 'img',
                        tileClassName: 'domus-dashboard-occupancy-tile domus-dashboard-kpi-tile'
                    }) +
                    cardHtml +
                    '</div>'
                : '';

            const panels = [
                hasUnits ? buildUpcomingPanel(openTasksTable) : '',
                buildQuickActionsPanel({ isEmptyState: !hasUnits })
            ].filter(Boolean).join('');

            return '<div class="domus-detail domus-dashboard">' +
                occupancyTile +
                (panels ? '<div class="domus-panel-row domus-dashboard-panel-row">' + panels + '</div>' : '') +
                '</div>';
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
            const occupiedColor = rootStyles.getPropertyValue('--color-element-success').trim() || '#0f6b2f';
            const vacantColor = rootStyles.getPropertyValue('--color-background-hover').trim() || '#d8dde6';

            occupancyChartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [t('domus', 'Occupied'), t('domus', 'Vacant')],
                    datasets: [{
                        data: [occupiedUnits, vacantUnits],
                        backgroundColor: [occupiedColor, vacantColor],
                        borderWidth: 0,
                        borderRadius: 999,
                        borderJoinStyle: 'round',
                        hoverOffset: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '82%',
                    rotation: -0.5 * Math.PI,
                    circumference: 360,
                    layout: {
                        padding: 2
                    },
                    elements: {
                        arc: {
                            spacing: 0
                        }
                    },
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
                    linkIconClass: 'domus-icon-arrow-right',
                    tileClassName: 'domus-dashboard-summary-tile domus-dashboard-kpi-tile'
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
                    bindQuickActionTrigger('domus-dashboard-task-create', () => {
                        Domus.Tasks.openCreateTaskModalWithUnitSelect(() => Domus.Router.navigate('dashboard'));
                    });
                }
            }, 0);

            const panels = [
                hasProperties ? buildUpcomingPanel(openTasksTable) : '',
                buildQuickActionsPanel({ isEmptyState: (data.unitCount || 0) === 0 })
            ].filter(Boolean).join('');

            return '<div class="domus-detail domus-dashboard">' +
                '<div class="domus-kpi-tiles domus-dashboard-kpi-row">' + cardHtml + '</div>' +
                (panels ? '<div class="domus-panel-row domus-dashboard-panel-row">' + panels + '</div>' : '') +
                '</div>';
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

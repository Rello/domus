(function() {
    'use strict';

    window.Domus = window.Domus || {};

    Domus.Properties = (function() {
        const listState = {
            properties: [],
            query: ''
        };

        function collectTenancySearchValues(tenancy) {
            const values = [tenancy?.partnerName];
            (tenancy?.partners || []).forEach(partner => {
                values.push(partner?.name);
                values.push(partner?.email);
                values.push(partner?.phone);
            });
            return values;
        }

        function getPropertySearchText(property) {
            const values = [
                property?.name,
                property?.usageRole,
                property?.type,
                property?.description,
                property?.street,
                property?.zip,
                property?.city,
                property?.country
            ];

            (property?.units || []).forEach(unit => {
                values.push(
                    unit?.label,
                    unit?.unitNumber,
                    unit?.unitType,
                    unit?.street,
                    unit?.zip,
                    unit?.city,
                    unit?.country,
                    unit?.notes
                );
                (unit?.activeTenancies || []).forEach(tenancy => values.push(...collectTenancySearchValues(tenancy)));
                (unit?.historicTenancies || []).forEach(tenancy => values.push(...collectTenancySearchValues(tenancy)));
            });

            return Domus.Utils.normalizeSearchValue(values.filter(Boolean).join(' '));
        }

        function filterProperties(properties, query) {
            const normalizedQuery = Domus.Utils.normalizeSearchValue(query);
            if (!normalizedQuery) {
                return properties || [];
            }
            return (properties || []).filter(property => getPropertySearchText(property).includes(normalizedQuery));
        }

        function updateNavSearch() {
            Domus.Navigation.setPrimarySearch({
                views: ['properties'],
                label: t('domus', 'Search properties'),
                placeholder: t('domus', 'Search properties, addresses or renters'),
                value: listState.query,
                onInput: value => {
                    listState.query = value || '';
                    renderListContent();
                }
            });
        }

        function buildPropertyAddress(property) {
            const parts = [property?.street, property?.city]
                .filter(Boolean)
                .map(part => Domus.Utils.escapeHtml(part));
            if (!parts.length) {
                return Domus.Utils.escapeHtml(t('domus', 'No address available'));
            }
            return '<span class="domus-icon domus-icon-location domus-overview-subtitle-icon" aria-hidden="true"></span>' +
                '<span class="domus-overview-subtitle-text">' + parts.join(', ') + '</span>';
        }

        function buildPropertyStatusBadge(property) {
            const occupiedCount = Number(property?.occupiedUnitCount) || 0;
            const vacantCount = Number(property?.vacantUnitCount) || 0;
            const totalCount = Number(property?.unitCount) || 0;

            if (totalCount > 0 && occupiedCount === totalCount) {
                return '<span class="domus-badge domus-badge-occupied">' + Domus.Utils.escapeHtml(t('domus', 'Fully tenanted')) + '</span>';
            }
            if (occupiedCount > 0 && vacantCount > 0) {
                return '<span class="domus-badge domus-badge-muted">' + Domus.Utils.escapeHtml(t('domus', 'Partially tenanted')) + '</span>';
            }
            return '<span class="domus-badge domus-badge-alert domus-badge-vacant">' + Domus.Utils.escapeHtml(t('domus', 'Vacant')) + '</span>';
        }

        function buildPropertyCard(property) {
            const isBuildingManagement = Domus.Role.isBuildingMgmtView();
            const address = buildPropertyAddress(property);
            const occupiedCount = Number(property?.occupiedUnitCount) || 0;
            const vacantCount = Number(property?.vacantUnitCount) || 0;
            const unitCount = Number(property?.unitCount) || 0;
            const badges = isBuildingManagement
                ? ''
                : [
                    property?.usageRole ? '<span class="domus-badge domus-badge-muted">' + Domus.Utils.escapeHtml(property.usageRole) + '</span>' : ''
                ].filter(Boolean).join('');
            const stats = [
                {
                    label: t('domus', 'Units'),
                    value: Domus.Utils.escapeHtml(String(unitCount))
                },
                {
                    label: t('domus', 'Occupancy'),
                    value: Domus.Utils.escapeHtml(`${occupiedCount} / ${unitCount}`)
                }
            ];

            if (!isBuildingManagement) {
                stats.push(
                    {
                        label: t('domus', 'Annual rent'),
                        value: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(property?.annualRentSum || 0) || '€ 0.00')
                    },
                    {
                        label: t('domus', 'Annual result'),
                        value: Domus.Utils.escapeHtml(Domus.Utils.formatCurrency(property?.annualResult || 0) || '€ 0.00')
                    }
                );
            }

            return {
                imageHtml: Domus.UI.buildEntityImage('property', property, {
                    variant: 'overview',
                    alt: property.name || t('domus', 'Property')
                }),
                title: Domus.Utils.escapeHtml(property.name || ''),
                subtitle: address,
                metaTitle: '',
                metaHtml: property?.type
                    ? '<span class="domus-badge domus-badge-outline">' + Domus.Utils.escapeHtml(property.type) + '</span>'
                    : '<span class="domus-overview-meta-empty">—</span>',
                statusHtml: buildPropertyStatusBadge(property),
                badgesHtml: badges,
                stats,
                footerHtml: '<span class="domus-overview-footer-text">' +
                    Domus.Utils.escapeHtml(t('domus', 'Active tenancies')) +
                    ': ' +
                    Domus.Utils.escapeHtml(String(Number(property?.activeTenancyCount) || 0)) +
                    '</span>',
                dataset: { navigate: 'propertyDetail', args: property.id }
            };
        }

        function renderList() {
            updateNavSearch();
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Properties') }));
            Domus.Api.getProperties()
                .then(properties => {
                    listState.properties = properties || [];
                    renderListContent();
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function renderListContent() {
            const header = '<div class="domus-toolbar">' +
                Domus.UI.buildScopeAddButton('domus-icon-property', t('domus', 'Add {entity}', { entity: t('domus', 'Property') }), {
                    id: 'domus-property-create-btn',
                    className: 'primary'
                }) +
                '</div>';
            const filteredProperties = filterProperties(listState.properties, listState.query);
            const cards = filteredProperties.map(buildPropertyCard);
            const hasSearch = Domus.Utils.normalizeSearchValue(listState.query) !== '';
            const content = cards.length
                ? Domus.UI.buildOverviewList(cards)
                : hasSearch
                    ? Domus.UI.buildOverviewList([], {
                        emptyMessage: t('domus', 'No matching {entity} found.', { entity: t('domus', 'Properties') })
                    })
                    : Domus.UI.buildEmptyStateAction(
                        t('domus', 'There is no {entity} yet. Create the first one', {
                            entity: t('domus', 'Properties')
                        }),
                        {
                            iconClass: 'domus-icon-property',
                            actionId: 'domus-properties-empty-create'
                        }
                    );
            Domus.UI.renderContent(header + content);
            bindListEvents();
        }

        function bindListEvents() {
            const createBtn = document.getElementById('domus-property-create-btn');
            if (createBtn) {
                createBtn.addEventListener('click', openCreateModal);
            }
            document.getElementById('domus-properties-empty-create')?.addEventListener('click', openCreateModal);

            Domus.UI.bindRowNavigation();
        }

        function getPropertyWorkflowSteps() {
            const steps = [
                { label: t('domus', 'Create property') }
            ];
            if (Domus.Distributions.canManageDistributions()) {
                steps.push({ label: t('domus', 'Create distribution key') });
            }
            steps.push({ label: t('domus', 'Create unit') });
            return steps;
        }

        function openPropertyCreateForm(defaults = {}, onCreated, modalOptions = {}) {
            const content = buildPropertyForm(defaults);
            const wrappedContent = typeof modalOptions.wrapContent === 'function' ? modalOptions.wrapContent(content) : content;
            const modal = Domus.UI.openModal({
                title: modalOptions.title || t('domus', 'Add {entity}', { entity: t('domus', 'Property') }),
                content: wrappedContent,
                size: modalOptions.size
            });
            bindPropertyForm(modal, data => Domus.Api.createProperty(data)
                .then(created => {
                    Domus.UI.showNotification(t('domus', '{entity} created.', { entity: t('domus', 'Property') }), 'success');
                    modal.close();
                    if (typeof onCreated === 'function') {
                        onCreated(created);
                    } else {
                        renderList();
                    }
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error')));
        }

        function openGuidedDistributionStep(property, steps, onFinished) {
            if (!Domus.Distributions.canManageDistributions()) {
                openGuidedUnitStep(property, steps, onFinished);
                return;
            }
            Domus.Distributions.openCreateKeyModal(
                property?.id,
                null,
                {
                    allowMultiple: true,
                    onContinue: () => openGuidedUnitStep(property, steps, onFinished),
                    wrapContent: content => Domus.UI.buildGuidedWorkflowLayout(steps, 1, content),
                    size: 'large'
                }
            );
        }

        function openGuidedUnitStep(property, steps, onFinished) {
            Domus.Units.openCreateModal(
                { propertyId: property?.id, lockProperty: true },
                createdUnit => {
                    if (typeof onFinished === 'function') {
                        onFinished(createdUnit);
                        return;
                    }
                    if (property?.id) {
                        renderDetail(property.id);
                        return;
                    }
                    renderList();
                }
            );
        }

        function openGuidedCreateWorkflow(defaults = {}, onFinished) {
            const steps = getPropertyWorkflowSteps();
            openPropertyCreateForm(
                defaults,
                createdProperty => openGuidedDistributionStep(createdProperty, steps, onFinished),
                {
                    title: t('domus', 'Create property'),
                    wrapContent: content => Domus.UI.buildGuidedWorkflowLayout(steps, 0, content),
                    size: 'large'
                }
            );
        }

        function openCreateModal() {
            openGuidedCreateWorkflow();
        }

        function getPropertyMasterdataStatus(property) {
            let total = 0;
            let completed = 0;

            const addField = (value) => {
                total += 1;
                if (Domus.Utils.isValueFilled(value)) {
                    completed += 1;
                }
            };

            addField(property?.name);
            addField(property?.usageRole);
            addField(property?.street);
            addField(property?.zip);
            addField(property?.city);
            addField(property?.country);
            addField(property?.type);
            addField(property?.description);

            return { completed, total };
        }

        function buildPropertyUpcomingPanel(property, options = {}) {
            const propertyId = Number(property?.id) || 0;
            const unitIds = new Set((property?.units || []).map(unit => Number(unit?.id)).filter(id => id > 0));
            const filteredOpenTasks = (options.openTasks || []).filter(item => {
                const entityType = item?.entityType || 'unit';
                const entityId = Number(item?.entityId || 0);
                if (entityType === 'property') {
                    return entityId === propertyId;
                }
                return unitIds.has(entityId);
            });
            const upcomingTable = Domus.Tasks.buildOpenTasksTable(filteredOpenTasks, {
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
                emptyActionId: 'domus-property-task-create',
                emptyIconClass: 'domus-icon-task'
            });

            return '<div class="domus-panel domus-panel-half domus-upcoming-card-shell domus-upcoming-card-shell-compact">' +
                Domus.UI.buildSectionHeader(t('domus', 'Upcoming'), {
                    id: 'domus-property-task-create-header',
                    title: t('domus', 'Add {entity}', { entity: t('domus', 'Task') }),
                    iconClass: 'domus-icon-add'
                }) +
                '<div class="domus-panel-body">' + upcomingTable + '</div>' +
                '</div>';
        }

        function renderDetail(id) {
            Domus.Navigation.clearPrimarySearch();
            Domus.UI.showLoading(t('domus', 'Loading {entity}…', { entity: t('domus', 'Property') }));
            Promise.all([
                Domus.Api.getProperty(id),
                Domus.Api.getDashboardSummary().catch(() => ({ openTasks: [] }))
            ])
                .then(([property, dashboardSummary]) => Promise.all([
                    Promise.resolve(property),
                    Promise.resolve(dashboardSummary || { openTasks: [] }),
                    Domus.Distributions.loadForProperty(id).catch(() => []),
                    Domus.Api.getPropertyPartners(id).catch(() => [])
                ]))
                .then(([property, dashboardSummary, distributions, partners]) => {

                    const visibleDistributions = Domus.Distributions.filterList(distributions, { excludeSystemDefaults: false });
                    const cityLine = [property.zip, property.city].filter(Boolean).join(' ');
                    const shortCityLine = [property.city].filter(Boolean).join(' ');
                    const addressParts = [property.street, cityLine, property.country].filter(Boolean);
                    const address = addressParts.length ? addressParts.join(', ') : (property.address || '');
                    const detailAddress = [property.street, shortCityLine].filter(Boolean).join(', ') || address;
                    const propertyDocumentPath = property.documentPath || '';
                    const propertyDocumentUrl = propertyDocumentPath ? Domus.Utils.buildFilesFolderUrl(propertyDocumentPath) : '';
                    const showBookingFeatures = Domus.Role.hasCapability('manageBookings');
                    const documentActionsEnabled = Domus.Role.hasCapability('manageDocuments');
                    const canManageDistributions = Domus.Distributions.canManageDistributions();
                    const isBuildingManagement = Domus.Role.isBuildingMgmtView();
                    const masterdataStatus = getPropertyMasterdataStatus(property);
                    const masterdataIndicator = Domus.UI.buildCompletionIndicator(t('domus', 'Masterdata'), masterdataStatus.completed, masterdataStatus.total, {
                        id: 'domus-property-masterdata'
                    });
                    const menuActions = [
                        !isBuildingManagement ? Domus.UI.buildIconLabelButton('domus-icon-unit', t('domus', 'Add {entity}', { entity: t('domus', 'Unit') }), {
                            id: 'domus-add-unit',
                            className: 'domus-action-menu-item'
                        }) : '',
                        showBookingFeatures && !isBuildingManagement ? Domus.UI.buildIconLabelButton('domus-icon-booking', t('domus', 'Add {entity}', { entity: t('domus', 'Booking') }), {
                            id: 'domus-add-booking',
                            className: 'domus-action-menu-item'
                        }) : '',
                        canManageDistributions ? Domus.UI.buildIconLabelButton('domus-icon-document', isBuildingManagement ? t('domus', 'Distribution Report') : t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') }), {
                            id: isBuildingManagement ? 'domus-property-distribution-report' : 'domus-add-distribution',
                            className: 'domus-action-menu-item'
                        }) : '',
                        Domus.UI.buildIconLabelButton('domus-icon-settings', t('domus', 'Document location'), {
                            id: 'domus-property-document-location',
                            className: 'domus-action-menu-item'
                        }),
                        Domus.UI.buildIconLabelButton('domus-icon-delete', t('domus', 'Delete'), {
                            id: 'domus-property-delete',
                            className: 'domus-action-menu-item'
                        })
                    ].filter(Boolean);
                    const actionMenu = Domus.UI.buildActionMenu(menuActions, {
                        label: t('domus', 'Quick Actions'),
                        ariaLabel: t('domus', 'Quick Actions')
                    });
                    const unitCount = Number(property?.unitCount) || (property.units || []).length;
                    const propertyInlineMeta = '<div class="domus-hero-meta-line domus-hero-meta-line-inline">' +
                        '<span class="domus-icon domus-icon-unit" aria-hidden="true"></span>' +
                        '<span>' + Domus.Utils.escapeHtml(`${t('domus', 'Units')}: ${unitCount}`) + '</span>' +
                        '</div>';
                    const stats = '';

                    const hero = '<div class="domus-detail-hero">' +
                        '<div class="domus-hero-content">' +
                        '<div class="domus-hero-indicator domus-hero-image-card">' +
                        Domus.UI.buildEntityImage('property', property, {
                            variant: 'hero',
                            alt: property.name || t('domus', 'Property')
                        }) +
                        '<button type="button" class="domus-hero-image-edit" id="domus-property-image-edit" aria-label="' + Domus.Utils.escapeHtml(t('domus', 'Edit picture')) + '">' +
                        '<span class="domus-icon domus-icon-edit" aria-hidden="true"></span>' +
                        '</button>' +
                        '</div>' +
                        '<div class="domus-hero-main">' +
                        (property.description ? '<div class="domus-hero-kicker">' + Domus.Utils.escapeHtml(property.description) + '</div>' : '') +
                        '<div class="domus-hero-main-top">' +
                        '<div class="domus-hero-heading-group">' +
                        '<div class="domus-hero-heading-row">' +
                        '<h2>' + Domus.Utils.escapeHtml(property.name || '') + '</h2>' +
                        buildPropertyStatusBadge(property) +
                        (property.type ? '<span class="domus-badge">' + Domus.Utils.escapeHtml(property.type) + '</span>' : '') +
                        '</div>' +
                        '<div class="domus-hero-meta-stack">' +
                        Domus.UI.buildHeroMetaLine('domus-icon-location', detailAddress) +
                        propertyInlineMeta +
                        '</div>' +
                        '</div>' +
                        '<div class="domus-hero-actions">' +
                        actionMenu +
                        '<div class="domus-hero-actions-status">' + masterdataIndicator + '</div>' +
                        '</div>' +
                        '</div>' +
                        '</div>' +
                        '</div>' +
                        '</div>';

                    const unitsHeader = Domus.UI.buildSectionHeader(t('domus', 'Units'), {
                        id: 'domus-add-unit-inline',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Unit') }),
                        iconClass: 'domus-icon-add'
                    });
                    const distributionsHeader = Domus.UI.buildSectionHeader(t('domus', 'Distribution'), canManageDistributions ? {
                        id: 'domus-add-distribution-inline',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Distribution') }),
                        iconClass: 'domus-icon-add'
                    } : null);
                    const bookingsHeader = showBookingFeatures ? Domus.UI.buildSectionHeader(t('domus', 'Bookings'), {
                        id: 'domus-add-booking-inline',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Booking') }),
                        iconClass: 'domus-icon-add'
                    }) : '';
                    const documentsHeaderActions = [];
                    if (propertyDocumentUrl) {
                        documentsHeaderActions.push({
                            href: propertyDocumentUrl,
                            target: '_blank',
                            rel: 'noopener',
                            label: t('domus', 'View all'),
                            title: t('domus', 'Open all documents')
                        });
                    }
                    if (documentActionsEnabled) {
                        documentsHeaderActions.push({
                            id: 'domus-property-link-doc',
                            title: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                            label: t('domus', 'Add {entity}', { entity: t('domus', 'Document') }),
                            iconClass: 'domus-icon-add',
                            dataset: { entityType: 'property', entityId: id }
                        });
                    }
                    const documentsHeader = Domus.UI.buildSectionHeader(t('domus', 'Document Management'), documentsHeaderActions);
                    const actionLogHeader = Domus.UI.buildSectionHeader(t('domus', 'Action log'), {
                        id: 'domus-property-action-log-create',
                        title: t('domus', 'Add {entity}', { entity: t('domus', 'Action log entry') }),
                        iconClass: 'domus-icon-add'
                    });

                    const partnersPanel = Domus.PartnerRelations.renderSection(partners || [], { entityType: 'property', entityId: id });
                    const upcomingPanel = isBuildingManagement
                        ? buildPropertyUpcomingPanel(property, { openTasks: dashboardSummary?.openTasks || [] })
                        : '';
                    const sideBySidePanels = [upcomingPanel, canManageDistributions ? '<div class="domus-panel domus-panel-half">' + distributionsHeader + '<div class="domus-panel-body" id="domus-property-distributions">' +
                        Domus.Distributions.renderTable(visibleDistributions, { excludeSystemDefaults: false, wrapPanel: false, variant: 'propertyDetail' }) + '</div></div>' : '']
                        .filter(Boolean)
                        .join('');

                    const content = '<div class="domus-detail domus-dashboard">' +
                        Domus.UI.buildBackButton('properties') +
                        hero +
                        stats +
                        '<div class="domus-dashboard-grid domus-dashboard-grid-single">' +
                        '<div class="domus-dashboard-main">' +
                        (sideBySidePanels ? '<div class="domus-panel-row">' + sideBySidePanels + '</div>' : '') +
                        '<div class="domus-panel">' + unitsHeader + '<div class="domus-panel-body">' +
                        Domus.Units.renderListInline(property.units || []) + '</div></div>' +
                        partnersPanel +
                        (showBookingFeatures ? '<div class="domus-panel">' + bookingsHeader + '<div class="domus-panel-body">' +
                        Domus.Bookings.renderInline(property.bookings || [], { refreshView: 'propertyDetail', refreshId: id }) + '</div></div>' : '') +
                        '<div class="domus-panel">' + documentsHeader + '<div class="domus-panel-body">' +
                        Domus.Documents.renderList('property', id, { showLinkAction: documentActionsEnabled }) + '</div></div>' +
                        '<div class="domus-panel">' + actionLogHeader + '<div class="domus-panel-body">' +
                        Domus.ActionLog.renderList('property', id, {
                            containerId: `domus-property-action-log-${id}`,
                            emptyActionId: 'domus-property-action-log-empty-create',
                            entityLabel: property?.name || '',
                            onSaved: () => renderDetail(id)
                        }) + '</div></div>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                    Domus.UI.renderContent(content);
                    Domus.UI.bindBackButtons();
                    Domus.UI.bindRowNavigation();
                    Domus.Bookings.bindInlineTables();
                    Domus.UI.bindActionMenus();
                    if (isBuildingManagement) {
                        Domus.Tasks.bindOpenTaskActions({ onRefresh: () => renderDetail(id) });
                        const openPropertyTaskCreate = () => {
                            Domus.Tasks.openCreateTaskModal('property', id, () => renderDetail(id));
                        };
                        document.getElementById('domus-property-task-create')?.addEventListener('click', openPropertyTaskCreate);
                        document.getElementById('domus-property-task-create-header')?.addEventListener('click', openPropertyTaskCreate);
                    }
                    Domus.Distributions.bindTable('domus-property-distributions', visibleDistributions, {
                        mode: 'property',
                        propertyId: id,
                        onPropertyEdit: (distribution) => Domus.Distributions.openEditKeyModal(id, distribution, () => renderDetail(id))
                    });
                    Domus.PartnerRelations.bindSection({ entityType: 'property', entityId: id, onRefresh: () => renderDetail(id) });
                    bindDetailActions(id, property);
                })
                .catch(err => Domus.UI.showError(err.message));
        }

        function bindDetailActions(id, property) {
            const detailsBtn = document.getElementById('domus-property-masterdata');
            const deleteBtn = document.getElementById('domus-property-delete');
            detailsBtn?.addEventListener('click', (event) => {
                event.preventDefault();
                openPropertyModal(id, 'view');
            });
            document.getElementById('domus-property-image-edit')?.addEventListener('click', () => {
                openPropertyImageModal(property);
            });
            document.getElementById('domus-property-document-location')?.addEventListener('click', () => {
                openDocumentLocationModal(property);
            });
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    Domus.Api.getPropertyDeletionSummary(id)
                        .then(summary => openPropertyDeleteModal(property, summary, () => {
                            Domus.Api.deleteProperty(id)
                                .then(() => {
                                    Domus.UI.showNotification(t('domus', '{entity} deleted.', { entity: t('domus', 'Property') }), 'success');
                                    Domus.Router.back('properties');
                                })
                                .catch(err => Domus.UI.showNotification(err.message, 'error'));
                        }))
                        .catch(err => Domus.UI.showNotification(err.message, 'error'));
                });
            }

            document.getElementById('domus-add-unit')?.addEventListener('click', () => {
                Domus.Units.openCreateModal({ propertyId: id, lockProperty: true }, () => renderDetail(id));
            });
            document.getElementById('domus-add-unit-inline')?.addEventListener('click', () => {
                Domus.Units.openCreateModal({ propertyId: id, lockProperty: true }, () => renderDetail(id));
            });
            document.getElementById('domus-add-booking')?.addEventListener('click', () => {
                const bookingFormConfig = Domus.Role.isBuildingMgmtView() ? { restrictUnitsToProperty: true } : {};
                Domus.Bookings.openCreateModal({ propertyId: id }, () => renderDetail(id), bookingFormConfig);
            });
            document.getElementById('domus-add-booking-inline')?.addEventListener('click', () => {
                const bookingFormConfig = Domus.Role.isBuildingMgmtView() ? { restrictUnitsToProperty: true } : {};
                Domus.Bookings.openCreateModal({ propertyId: id }, () => renderDetail(id), bookingFormConfig);
            });
            document.getElementById('domus-property-link-doc')?.addEventListener('click', () => {
                Domus.Documents.openLinkModal('property', id, () => renderDetail(id));
            });
            Domus.ActionLog.bindCreateButtons(['domus-property-action-log-create'], {
                entityType: 'property',
                entityId: id,
                entityLabel: property?.name || '',
                onSaved: () => renderDetail(id)
            });
            document.getElementById('domus-add-distribution')?.addEventListener('click', () => {
                Domus.Distributions.openCreateKeyModal(id, () => renderDetail(id));
            });
            document.getElementById('domus-add-distribution-inline')?.addEventListener('click', () => {
                Domus.Distributions.openCreateKeyModal(id, () => renderDetail(id));
            });
            document.getElementById('domus-property-distribution-report')?.addEventListener('click', () => {
                Domus.DistributionReports.openModal({
                    propertyId: id,
                    year: Domus.state.currentYear
                });
            });
        }

        function openEditModal(id) {
            openPropertyModal(id, 'edit');
        }

        function openPropertyDeleteModal(property, summary, onConfirm) {
            const expectedTitle = property?.name || '';
            const content = document.createElement('div');
            const warning = document.createElement('p');
            warning.className = 'domus-modal-message';
            warning.textContent = `${t('domus', 'Deleting this property will remove the linked data listed below.')} ${t('domus', 'This action cannot be undone.')}`;
            content.appendChild(warning);

            const summaryTitle = document.createElement('h4');
            summaryTitle.textContent = t('domus', 'Linked objects');
            content.appendChild(summaryTitle);

            const summaryList = document.createElement('ul');
            summaryList.className = 'domus-delete-summary';
            [
                { label: t('domus', 'Units'), value: summary?.units },
                { label: t('domus', 'Tasks'), value: summary?.tasks },
                { label: t('domus', 'Task steps'), value: summary?.taskSteps },
                { label: t('domus', 'Workflow runs'), value: summary?.workflowRuns },
                { label: t('domus', 'Distribution keys'), value: summary?.distributionKeys },
                { label: t('domus', 'Distribution values'), value: summary?.distributionValues },
                { label: t('domus', 'Partner relations'), value: summary?.partnerRelations },
                { label: t('domus', 'Action log entries'), value: summary?.actionLogs },
                { label: t('domus', 'Document links'), value: summary?.documentLinks }
            ].forEach(item => {
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

            const form = document.createElement('form');
            form.className = 'domus-form';
            form.addEventListener('submit', event => event.preventDefault());

            const inputId = 'domus-property-delete-confirm-title';
            const row = document.createElement('div');
            row.className = 'domus-form-row domus-form-row-full';
            const labelWrap = document.createElement('div');
            labelWrap.className = 'domus-form-label';
            labelWrap.classList.add('domus-delete-confirm-field');
            const label = document.createElement('label');
            label.setAttribute('for', inputId);
            label.textContent = t('domus', 'Type the property title to confirm.');
            const help = document.createElement('div');
            help.className = 'domus-form-help';
            help.textContent = t('domus', 'Expected title: {title}', { title: expectedTitle });
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
                title: t('domus', 'Delete {entity}?', { entity: t('domus', 'Property') }),
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

        function openDocumentLocationModal(property) {
            Domus.UI.openDocumentLocationModal({
                currentPath: property.documentPath || '',
                formIdPrefix: 'domus-property-document-location',
                save: value => Domus.Api.updateProperty(property.id, { documentPath: value }),
                onSaved: () => renderDetail(property.id)
            });
        }

        function openPropertyModal(id, mode = 'edit') {
            Domus.Api.getProperty(id)
                .then(property => {
                    let modal;
                    const headerActions = [];
                    if (mode === 'view') {
                        headerActions.push(Domus.UI.buildModalAction(t('domus', 'Edit'), () => {
                            modal?.close();
                            openPropertyModal(id, 'edit');
                        }));
                    }

                    modal = Domus.UI.openModal({
                        title: mode === 'view' ? t('domus', 'Property details') : t('domus', 'Edit {entity}', { entity: t('domus', 'Property') }),
                        content: buildPropertyForm(property, { mode }),
                        headerActions
                    });
                    bindPropertyForm(modal, data => Domus.Api.updateProperty(id, data)
                        .then(() => {
                            Domus.UI.showNotification(t('domus', '{entity} updated.', { entity: t('domus', 'Property') }), 'success');
                            modal.close();
                            renderDetail(id);
                        })
                        .catch(err => Domus.UI.showNotification(err.message, 'error')),
                    { mode });
                })
                .catch(err => Domus.UI.showNotification(err.message, 'error'));
        }


        function bindPropertyForm(modalContext, onSubmit, options = {}) {
            const form = modalContext.modalEl.querySelector('#domus-property-form');
            const mode = options.mode || 'edit';
            const cancelBtn = modalContext.modalEl.querySelector('#domus-property-cancel');
            const closeBtn = modalContext.modalEl.querySelector('#domus-property-close');

            if (mode === 'view') {
                closeBtn?.addEventListener('click', modalContext.close);
                form?.addEventListener('submit', function(e) {
                    e.preventDefault();
                    modalContext.close();
                });
                return;
            }

            cancelBtn?.addEventListener('click', modalContext.close);
            form?.addEventListener('submit', function(e) {
                e.preventDefault();
                const data = formToObject(form);
                if (!data.name) {
                    Domus.UI.showNotification(t('domus', 'Name is required.'), 'error');
                    return;
                }
                onSubmit(data);
            });
        }

        function buildPropertyForm(property, options = {}) {
            const prop = property || {};
            const mode = options.mode || 'edit';
            const isView = mode === 'view';

            function renderDisplay(value) {
                const safeValue = value || value === 0 ? String(value) : '';
                return '<div class="domus-form-value-text">' + Domus.Utils.escapeHtml(safeValue) + '</div>';
            }

            function inputField(name, label, value, opts = {}) {
                const required = opts.required && !isView;
                const attrs = [`name="${Domus.Utils.escapeHtml(name)}"`];
                if (opts.type) attrs.push(`type="${Domus.Utils.escapeHtml(opts.type)}"`);
                if (required) attrs.push('required');
                if (isView) attrs.push('disabled');
                const content = opts.isTextarea
                    ? `<textarea ${attrs.join(' ')}>${value ? Domus.Utils.escapeHtml(String(value)) : ''}</textarea>`
                    : `<input ${attrs.join(' ')} value="${value ? Domus.Utils.escapeHtml(String(value)) : ''}">`;
                return Domus.UI.buildFormRow({
                    label,
                    required,
                    content: isView ? renderDisplay(value) : content
                });
            }

            function selectField(name, label, options, selected) {
                const current = selected || options[0]?.value;
                const content = isView
                    ? renderDisplay(options.find(opt => opt.value === current)?.label || current)
                    : '<select name="' + Domus.Utils.escapeHtml(name) + '">' +
                    options.map(opt => '<option value="' + Domus.Utils.escapeHtml(opt.value) + '"' + (opt.value === current ? ' selected' : '') + '>' + Domus.Utils.escapeHtml(opt.label) + '</option>').join('') +
                    '</select>';
                return Domus.UI.buildFormRow({ label, content: content });
            }

            const rows = [
                inputField('name', t('domus', 'Name'), prop.name || '', { required: true }),
                selectField('usageRole', t('domus', 'Usage role'), [
                    { value: 'manager', label: t('domus', 'Manager') },
                    { value: 'landlord', label: t('domus', 'Landlord') }
                ], prop.usageRole),
                inputField('street', t('domus', 'Street'), prop.street || ''),
                inputField('zip', t('domus', 'ZIP'), prop.zip || ''),
                inputField('city', t('domus', 'City'), prop.city || ''),
                inputField('country', t('domus', 'Country'), prop.country || 'DE'),
                inputField('type', t('domus', 'Type'), prop.type || ''),
                inputField('description', t('domus', 'Description'), prop.description || '', { isTextarea: true, fullWidth: true })
            ];

            const actions = isView
                ? '<div class="domus-form-actions"><button type="button" id="domus-property-close">' + Domus.Utils.escapeHtml(t('domus', 'Close')) + '</button></div>'
                : '<div class="domus-form-actions">' +
                '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                '<button type="button" id="domus-property-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                '</div>';

            return '<div class="domus-form">' +
                '<form id="domus-property-form" data-mode="' + Domus.Utils.escapeHtml(mode) + '">' +
                Domus.UI.buildFormTable(rows) +
                actions +
                '</form>' +
                '</div>';
        }
        function formToObject(form) {
            const obj = {};
            Array.prototype.forEach.call(form.elements, function(el) {
                if (!el.name) return;
                if (el.type === 'file') return;
                if (el.type === 'checkbox') {
                    obj[el.name] = el.checked;
                } else {
                    obj[el.name] = el.value;
                }
            });
            return obj;
        }

        return {
            renderList,
            renderDetail,
            openCreateModal,
            renderListInline: (units) => Domus.Units.renderListInline(units)
        };

        function bindPropertyImageField(root) {
            const fileInput = root.querySelector('input[name="imageFile"]');
            const actionInput = root.querySelector('input[name="imageAction"]');
            const removeButton = root.querySelector('[data-image-remove]');
            const imageElement = root.querySelector('.domus-image-field-preview img');
            if (!fileInput || !actionInput || !imageElement) {
                return null;
            }

            const defaultUrl = imageElement.getAttribute('src') || '';
            const currentUrl = defaultUrl;
            const setPreview = (url) => {
                imageElement.setAttribute('src', url || defaultUrl);
            };

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
                setPreview(Domus.UI.getEntityImageUrl('property', {}));
            });

            return {
                getValue: () => ({
                    action: actionInput.value || 'keep',
                    file: fileInput.files && fileInput.files[0] ? fileInput.files[0] : null
                })
            };
        }

        function applyPropertyImageChange(id, imageChange) {
            if (!imageChange || imageChange.action === 'keep') {
                return Promise.resolve();
            }
            if (imageChange.action === 'remove') {
                return Domus.Api.removePropertyImage(id).then(() => undefined);
            }
            if (imageChange.action === 'upload' && imageChange.file) {
                return Domus.Api.uploadPropertyImage(id, imageChange.file).then(() => undefined);
            }
            return Promise.resolve();
        }

        function openPropertyImageModal(property) {
            const modal = Domus.UI.openModal({
                title: t('domus', 'Edit picture'),
                content: '<div class="domus-form">' +
                    '<form id="domus-property-image-form">' +
                    Domus.UI.buildFormTable([
                        Domus.UI.buildFormRow({
                            label: t('domus', 'Preview'),
                            content: '<div class="domus-image-field">' +
                                '<div class="domus-image-field-preview">' +
                                Domus.UI.buildEntityImage('property', property, {
                                    variant: 'form',
                                    alt: property.name || t('domus', 'Property')
                                }) +
                                '</div>' +
                                '<div class="domus-image-field-actions">' +
                                    '<input type="hidden" name="imageAction" value="keep">' +
                                    '<input type="file" name="imageFile" accept="image/*">' +
                                    '<button type="button" class="domus-ghost" data-image-remove>' + Domus.Utils.escapeHtml(t('domus', 'Use default image')) + '</button>' +
                                '</div>' +
                            '</div>'
                        })
                    ]) +
                    '<div class="domus-form-actions">' +
                        '<button type="submit" class="primary">' + Domus.Utils.escapeHtml(t('domus', 'Save')) + '</button>' +
                        '<button type="button" id="domus-property-image-cancel">' + Domus.Utils.escapeHtml(t('domus', 'Cancel')) + '</button>' +
                    '</div>' +
                    '</form>' +
                    '</div>'
            });
            const imageState = bindPropertyImageField(modal.modalEl);
            modal.modalEl.querySelector('#domus-property-image-cancel')?.addEventListener('click', modal.close);
            modal.modalEl.querySelector('#domus-property-image-form')?.addEventListener('submit', event => {
                event.preventDefault();
                applyPropertyImageChange(property.id, imageState?.getValue())
                    .then(() => {
                        modal.close();
                        renderDetail(property.id);
                    })
                    .catch(err => Domus.UI.showNotification(err.message, 'error'));
            });
        }
    })();

    /**
     * Units view
     */
})();

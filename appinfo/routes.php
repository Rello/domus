<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],

        // Renter access follows Partner.ncUserId and its existing tenancy relationships.
        ['name' => 'RenterAccess#status', 'url' => '/api/teams/{teamId}/partners/{partnerId}/account', 'verb' => 'GET'],
        ['name' => 'RenterAccess#link', 'url' => '/api/teams/{teamId}/partners/{partnerId}/account', 'verb' => 'POST'],
        ['name' => 'RenterAccess#identity', 'url' => '/api/renter/me', 'verb' => 'GET'],

        ['name' => 'RenterPortal#detail', 'url' => '/api/renter/teams/{teamId}/tenancies/{tenancyId}', 'verb' => 'GET'],
        ['name' => 'RenterPortal#documents', 'url' => '/api/renter/teams/{teamId}/tenancies/{tenancyId}/documents', 'verb' => 'GET'],
        ['name' => 'RenterPortal#content', 'url' => '/api/renter/documents/{id}/content', 'verb' => 'GET'],
        ['name' => 'RenterPortal#requestCorrection', 'url' => '/api/renter/teams/{teamId}/partners/{partnerId}/corrections', 'verb' => 'POST'],
        ['name' => 'RenterPortal#preview', 'url' => '/api/teams/{teamId}/tenancies/{tenancyId}/renter-preview/{partnerId}', 'verb' => 'GET'],
        ['name' => 'RenterPortal#previewContent', 'url' => '/api/teams/{teamId}/tenancies/{tenancyId}/renter-preview/documents/{id}/content', 'verb' => 'GET'],
        ['name' => 'RenterPortal#corrections', 'url' => '/api/teams/{teamId}/partners/{partnerId}/corrections', 'verb' => 'GET'],
        ['name' => 'RenterPortal#decide', 'url' => '/api/teams/{teamId}/corrections/{id}', 'verb' => 'POST'],

        // Property
        ['name' => 'Property#index', 'url' => 'api/properties', 'verb' => 'GET'],
        ['name' => 'Property#show', 'url' => 'api/properties/{id}', 'verb' => 'GET'],
        ['name' => 'Property#create', 'url' => 'api/properties', 'verb' => 'POST'],
        ['name' => 'Property#update', 'url' => 'api/properties/{id}', 'verb' => 'PUT'],
        ['name' => 'Property#destroy', 'url' => 'api/properties/{id}', 'verb' => 'DELETE'],
        ['name' => 'Property#deletionSummary', 'url' => 'api/properties/{id}/deletion-summary', 'verb' => 'GET'],
        ['name' => 'Property#uploadImage', 'url' => 'api/properties/{id}/image', 'verb' => 'POST'],
        ['name' => 'Property#imageContent', 'url' => 'api/properties/{id}/image/content', 'verb' => 'GET'],
        ['name' => 'Property#removeImage', 'url' => 'api/properties/{id}/image', 'verb' => 'DELETE'],
        ['name' => 'Distribution#listByProperty', 'url' => 'api/properties/{propertyId}/distributions', 'verb' => 'GET'],
        ['name' => 'Distribution#createForProperty', 'url' => 'api/properties/{propertyId}/distributions', 'verb' => 'POST'],
        ['name' => 'PartnerRelation#listByProperty', 'url' => 'api/properties/{propertyId}/partners', 'verb' => 'GET'],
        ['name' => 'PartnerRelation#createForProperty', 'url' => 'api/properties/{propertyId}/partners', 'verb' => 'POST'],

        // Unit
        ['name' => 'Unit#index', 'url' => 'api/units', 'verb' => 'GET'],
        ['name' => 'Unit#listByProperty', 'url' => 'api/properties/{propertyId}/units', 'verb' => 'GET'],
        ['name' => 'Unit#show', 'url' => 'api/units/{id}', 'verb' => 'GET'],
        ['name' => 'Unit#create', 'url' => 'api/units', 'verb' => 'POST'],
        ['name' => 'Unit#update', 'url' => 'api/units/{id}', 'verb' => 'PUT'],
        ['name' => 'Unit#destroy', 'url' => 'api/units/{id}', 'verb' => 'DELETE'],
        ['name' => 'Unit#deletionSummary', 'url' => 'api/units/{id}/deletion-summary', 'verb' => 'GET'],
        ['name' => 'Unit#uploadImage', 'url' => 'api/units/{id}/image', 'verb' => 'POST'],
        ['name' => 'Unit#imageContent', 'url' => 'api/units/{id}/image/content', 'verb' => 'GET'],
        ['name' => 'Unit#removeImage', 'url' => 'api/units/{id}/image', 'verb' => 'DELETE'],
        ['name' => 'Unit#listSettlements', 'url' => 'api/units/{id}/settlements', 'verb' => 'GET'],
        ['name' => 'Unit#createSettlement', 'url' => 'api/units/{id}/settlements', 'verb' => 'POST'],
        ['name' => 'Unit#exportDataset', 'url' => 'api/units/{id}/export', 'verb' => 'GET'],
        ['name' => 'Unit#importDataset', 'url' => 'api/units/import', 'verb' => 'POST'],
        ['name' => 'Distribution#createForUnit', 'url' => 'api/units/{unitId}/distributions', 'verb' => 'POST'],
        ['name' => 'Distribution#listByUnit', 'url' => 'api/units/{unitId}/distributions', 'verb' => 'GET'],
        ['name' => 'PartnerRelation#listByUnit', 'url' => 'api/units/{unitId}/partners', 'verb' => 'GET'],
        ['name' => 'PartnerRelation#createForUnit', 'url' => 'api/units/{unitId}/partners', 'verb' => 'POST'],
        // Statistics
        ['name' => 'Statistics#unit', 'url' => 'api/statistics/units/{unitId}', 'verb' => 'GET'],
        ['name' => 'Statistics#unitPerYear', 'url' => 'api/statistics/units/{unitId}/{year}', 'verb' => 'GET'],
        ['name' => 'Statistics#unitsOverview', 'url' => 'api/statistics/units-overview', 'verb' => 'GET'],
        ['name' => 'Statistics#portfolioPerformance', 'url' => 'api/statistics/portfolio-performance', 'verb' => 'GET'],
        ['name' => 'Statistics#accountTotals', 'url' => 'api/statistics/accounts', 'verb' => 'GET'],
        ['name' => 'BookingYear#close', 'url' => 'api/booking-years/{year}/close', 'verb' => 'POST'],
        ['name' => 'BookingYear#reopen', 'url' => 'api/booking-years/{year}/reopen', 'verb' => 'POST'],

        // Partner
        ['name' => 'Partner#index', 'url' => 'api/partners', 'verb' => 'GET'],
        ['name' => 'Partner#show', 'url' => 'api/partners/{id}', 'verb' => 'GET'],
        ['name' => 'Partner#create', 'url' => 'api/partners', 'verb' => 'POST'],
        ['name' => 'Partner#update', 'url' => 'api/partners/{id}', 'verb' => 'PUT'],
        ['name' => 'Partner#destroy', 'url' => 'api/partners/{id}', 'verb' => 'DELETE'],

        // Tenancy
        ['name' => 'Tenancy#index', 'url' => 'api/tenancies', 'verb' => 'GET'],
        ['name' => 'Tenancy#show', 'url' => 'api/tenancies/{id}', 'verb' => 'GET'],
        ['name' => 'Tenancy#listByUnit', 'url' => 'api/units/{unitId}/tenancies', 'verb' => 'GET'],
        ['name' => 'Tenancy#listByPartner', 'url' => 'api/partners/{partnerId}/tenancies', 'verb' => 'GET'],
        ['name' => 'Tenancy#create', 'url' => 'api/tenancies', 'verb' => 'POST'],
        ['name' => 'Tenancy#changeConditions', 'url' => 'api/tenancies/{id}/change-conditions', 'verb' => 'POST'],
        ['name' => 'Tenancy#update', 'url' => 'api/tenancies/{id}', 'verb' => 'PUT'],
        ['name' => 'Tenancy#destroy', 'url' => 'api/tenancies/{id}', 'verb' => 'DELETE'],

        // Booking
        ['name' => 'Booking#index', 'url' => 'api/bookings', 'verb' => 'GET'],
        ['name' => 'Booking#show', 'url' => 'api/bookings/{id}', 'verb' => 'GET'],
        ['name' => 'Booking#create', 'url' => 'api/bookings', 'verb' => 'POST'],
        ['name' => 'Booking#update', 'url' => 'api/bookings/{id}', 'verb' => 'PUT'],
        ['name' => 'Booking#destroy', 'url' => 'api/bookings/{id}', 'verb' => 'DELETE'],
        ['name' => 'Distribution#updateForProperty', 'url' => 'api/properties/{propertyId}/distributions/{distributionId}', 'verb' => 'PUT'],
        ['name' => 'Distribution#report', 'url' => 'api/distribution-report', 'verb' => 'GET'],

        // Documents: the literal content route must precede the two-parameter listing route.
        ['name' => 'Document#content', 'url' => 'api/documents/{id}/content', 'verb' => 'GET'],
        ['name' => 'Document#index', 'url' => 'api/documents/{entityType}/{entityId}', 'verb' => 'GET'],
        ['name' => 'Document#show', 'url' => 'api/documents/{id}', 'verb' => 'GET'],
        ['name' => 'Document#link', 'url' => 'api/documents/{entityType}/{entityId}', 'verb' => 'POST'],
        ['name' => 'Document#upload', 'url' => 'api/documents/{entityType}/{entityId}/upload', 'verb' => 'POST'],
        ['name' => 'Document#attach', 'url' => 'api/documents/attach', 'verb' => 'POST'],
        ['name' => 'Document#destroy', 'url' => 'api/documents/{id}', 'verb' => 'DELETE'],

        // Action logs
        ['name' => 'ActionLog#show', 'url' => '/api/action-logs/entry/{id}', 'verb' => 'GET'],
        ['name' => 'ActionLog#listByEntity', 'url' => '/api/action-logs/{entityType}/{entityId}', 'verb' => 'GET'],
        ['name' => 'ActionLog#createForEntity', 'url' => '/api/action-logs/{entityType}/{entityId}', 'verb' => 'POST'],
        ['name' => 'ActionLog#update', 'url' => '/api/action-logs/entry/{id}', 'verb' => 'PUT'],
        ['name' => 'ActionLog#destroy', 'url' => '/api/action-logs/entry/{id}', 'verb' => 'DELETE'],

        // Dashboard
        ['name' => 'Dashboard#summary', 'url' => 'api/dashboard/summary', 'verb' => 'GET'],

        // Settings
        ['name' => 'Settings#show', 'url' => 'api/settings', 'verb' => 'GET'],
        ['name' => 'Settings#update', 'url' => 'api/settings', 'verb' => 'PUT'],
        ['name' => 'Settings#createDemoContent', 'url' => 'api/settings/demo-content', 'verb' => 'POST'],

        // Nextcloud Teams and Guests integration
        ['name' => 'TeamIntegration#index', 'url' => '/api/teams', 'verb' => 'GET'],
        ['name' => 'TeamIntegration#folder', 'url' => '/api/teams/{teamId}/folder', 'verb' => 'GET'],
        ['name' => 'TeamIntegration#guestCreation', 'url' => '/api/teams/{teamId}/guest-creation', 'verb' => 'GET'],
        ['name' => 'TeamIntegration#activate', 'url' => '/api/teams/{teamId}/activate', 'verb' => 'POST'],
        ['name' => 'TeamIntegration#deactivate', 'url' => '/api/teams/deactivate', 'verb' => 'POST'],

        // Accounts
        ['name' => 'Account#index', 'url' => 'api/accounts', 'verb' => 'GET'],
        ['name' => 'Account#create', 'url' => 'api/accounts', 'verb' => 'POST'],
        ['name' => 'Account#update', 'url' => 'api/accounts/{id}', 'verb' => 'PUT'],
        ['name' => 'Account#disable', 'url' => 'api/accounts/{id}/disable', 'verb' => 'POST'],
        ['name' => 'Account#enable', 'url' => 'api/accounts/{id}/enable', 'verb' => 'POST'],
        ['name' => 'Account#destroy', 'url' => 'api/accounts/{id}', 'verb' => 'DELETE'],

        // Rulesets and persistent rent-review alerts
        ['name' => 'Rule#index', 'url' => '/api/rules', 'verb' => 'GET'],
        ['name' => 'Rule#save', 'url' => '/api/rules', 'verb' => 'POST'],
        ['name' => 'Rule#options', 'url' => '/api/rules/options', 'verb' => 'GET'],
        ['name' => 'Rule#preview', 'url' => '/api/rules/preview', 'verb' => 'POST'],
        ['name' => 'Rule#evaluate', 'url' => '/api/rules/evaluate', 'verb' => 'POST'],
        ['name' => 'Rule#reference', 'url' => '/api/rules/tenancies/{tenancyId}/reference', 'verb' => 'POST'],
        ['name' => 'Rule#update', 'url' => '/api/rules/{id}', 'verb' => 'PUT'],
        ['name' => 'Rule#delete', 'url' => '/api/rules/{id}', 'verb' => 'DELETE'],

        // Task templates
        ['name' => 'TaskTemplate#index', 'url' => '/api/task-templates', 'verb' => 'GET'],
        ['name' => 'TaskTemplate#show', 'url' => '/api/task-templates/{id}', 'verb' => 'GET'],
        ['name' => 'TaskTemplate#create', 'url' => '/api/task-templates', 'verb' => 'POST'],
        ['name' => 'TaskTemplate#update', 'url' => '/api/task-templates/{id}', 'verb' => 'PUT'],
        ['name' => 'TaskTemplate#destroy', 'url' => '/api/task-templates/{id}', 'verb' => 'DELETE'],
        ['name' => 'TaskTemplate#reorderSteps', 'url' => '/api/task-templates/{id}/reorder-steps', 'verb' => 'POST'],
        ['name' => 'TaskTemplate#addStep', 'url' => '/api/task-templates/{id}/steps', 'verb' => 'POST'],
        ['name' => 'TaskTemplate#updateStep', 'url' => '/api/task-template-steps/{stepId}', 'verb' => 'PUT'],
        ['name' => 'TaskTemplate#deleteStep', 'url' => '/api/task-template-steps/{stepId}', 'verb' => 'DELETE'],

        // Workflow runs
        ['name' => 'WorkflowRun#createForEntity', 'url' => '/api/workflow-runs/{entityType}/{entityId}', 'verb' => 'POST'],
        ['name' => 'WorkflowRun#listByEntity', 'url' => '/api/workflow-runs/{entityType}/{entityId}', 'verb' => 'GET'],
        ['name' => 'WorkflowRun#show', 'url' => '/api/workflow-runs/{runId}', 'verb' => 'GET'],
        ['name' => 'WorkflowRun#delete', 'url' => '/api/workflow-runs/{runId}', 'verb' => 'DELETE'],
        ['name' => 'WorkflowRun#remindStep', 'url' => '/api/task-steps/{stepId}/remind', 'verb' => 'POST'],
        ['name' => 'WorkflowRun#closeStep', 'url' => '/api/task-steps/{stepId}/close', 'verb' => 'POST'],
        ['name' => 'WorkflowRun#closeEarly', 'url' => '/api/task-steps/{stepId}/close-early', 'verb' => 'POST'],
        ['name' => 'WorkflowRun#reopenStep', 'url' => '/api/task-steps/{stepId}/reopen', 'verb' => 'POST'],

        // Tasks
        ['name' => 'Task#remind', 'url' => '/api/tasks/{taskId}/remind', 'verb' => 'POST'],
        ['name' => 'Task#close', 'url' => '/api/tasks/{taskId}/close', 'verb' => 'POST'],
        ['name' => 'Task#reopen', 'url' => '/api/tasks/{taskId}/reopen', 'verb' => 'POST'],
        ['name' => 'Task#createForEntity', 'url' => '/api/tasks/{entityType}/{entityId}', 'verb' => 'POST'],
        ['name' => 'Task#listByEntity', 'url' => '/api/tasks/{entityType}/{entityId}', 'verb' => 'GET'],
        ['name' => 'Task#listOpen', 'url' => '/api/tasks', 'verb' => 'GET'],
        ['name' => 'Task#update', 'url' => '/api/tasks/{taskId}', 'verb' => 'PUT'],
        ['name' => 'Task#delete', 'url' => '/api/tasks/{taskId}', 'verb' => 'DELETE'],
        // All page URLs load the application; the browser selects the view.
        ['name' => 'page#index', 'url' => '/{path}', 'verb' => 'GET',
            'postfix' => 'navigation', 'requirements' => ['path' => '(?!api(?:/|$)).+']],
    ],
];

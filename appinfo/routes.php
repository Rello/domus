<?php

return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],

        // Property
        ['name' => 'Property#index', 'url' => '/properties', 'verb' => 'GET'],
        ['name' => 'Property#show', 'url' => '/properties/{id}', 'verb' => 'GET'],
        ['name' => 'Property#create', 'url' => '/properties', 'verb' => 'POST'],
        ['name' => 'Property#update', 'url' => '/properties/{id}', 'verb' => 'PUT'],
        ['name' => 'Property#destroy', 'url' => '/properties/{id}', 'verb' => 'DELETE'],
        ['name' => 'Property#deletionSummary', 'url' => '/properties/{id}/deletion-summary', 'verb' => 'GET'],
        ['name' => 'Distribution#listByProperty', 'url' => '/properties/{propertyId}/distributions', 'verb' => 'GET'],
        ['name' => 'Distribution#createForProperty', 'url' => '/properties/{propertyId}/distributions', 'verb' => 'POST'],
        ['name' => 'PartnerRelation#listByProperty', 'url' => '/properties/{propertyId}/partners', 'verb' => 'GET'],
        ['name' => 'PartnerRelation#createForProperty', 'url' => '/properties/{propertyId}/partners', 'verb' => 'POST'],

        // Unit
        ['name' => 'Unit#index', 'url' => '/units', 'verb' => 'GET'],
        ['name' => 'Unit#listByProperty', 'url' => '/properties/{propertyId}/units', 'verb' => 'GET'],
        ['name' => 'Unit#show', 'url' => '/units/{id}', 'verb' => 'GET'],
        ['name' => 'Unit#create', 'url' => '/units', 'verb' => 'POST'],
        ['name' => 'Unit#update', 'url' => '/units/{id}', 'verb' => 'PUT'],
        ['name' => 'Unit#destroy', 'url' => '/units/{id}', 'verb' => 'DELETE'],
        ['name' => 'Unit#deletionSummary', 'url' => '/units/{id}/deletion-summary', 'verb' => 'GET'],
        ['name' => 'Unit#listSettlements', 'url' => '/units/{id}/settlements', 'verb' => 'GET'],
        ['name' => 'Unit#createSettlement', 'url' => '/units/{id}/settlements', 'verb' => 'POST'],
        ['name' => 'Unit#exportDataset', 'url' => '/units/{id}/export', 'verb' => 'GET'],
        ['name' => 'Unit#importDataset', 'url' => '/units/import', 'verb' => 'POST'],
        ['name' => 'Distribution#createForUnit', 'url' => '/units/{unitId}/distributions', 'verb' => 'POST'],
        ['name' => 'Distribution#listByUnit', 'url' => '/units/{unitId}/distributions', 'verb' => 'GET'],
        ['name' => 'PartnerRelation#listByUnit', 'url' => '/units/{unitId}/partners', 'verb' => 'GET'],
        ['name' => 'PartnerRelation#createForUnit', 'url' => '/units/{unitId}/partners', 'verb' => 'POST'],
        // Statistics
        ['name' => 'Statistics#unit', 'url' => '/statistics/units/{unitId}', 'verb' => 'GET'],
        ['name' => 'Statistics#unitPerYear', 'url' => '/statistics/units/{unitId}/{year}', 'verb' => 'GET'],
        ['name' => 'Statistics#unitsOverview', 'url' => '/statistics/units-overview', 'verb' => 'GET'],
        ['name' => 'Statistics#accountTotals', 'url' => '/statistics/accounts', 'verb' => 'GET'],
        ['name' => 'BookingYear#close', 'url' => '/booking-years/{year}/close', 'verb' => 'POST'],
        ['name' => 'BookingYear#reopen', 'url' => '/booking-years/{year}/reopen', 'verb' => 'POST'],

        // Partner
        ['name' => 'Partner#index', 'url' => '/partners', 'verb' => 'GET'],
        ['name' => 'Partner#show', 'url' => '/partners/{id}', 'verb' => 'GET'],
        ['name' => 'Partner#create', 'url' => '/partners', 'verb' => 'POST'],
        ['name' => 'Partner#update', 'url' => '/partners/{id}', 'verb' => 'PUT'],
        ['name' => 'Partner#destroy', 'url' => '/partners/{id}', 'verb' => 'DELETE'],

        // Tenancy
        ['name' => 'Tenancy#index', 'url' => '/tenancies', 'verb' => 'GET'],
        ['name' => 'Tenancy#show', 'url' => '/tenancies/{id}', 'verb' => 'GET'],
        ['name' => 'Tenancy#listByUnit', 'url' => '/units/{unitId}/tenancies', 'verb' => 'GET'],
        ['name' => 'Tenancy#listByPartner', 'url' => '/partners/{partnerId}/tenancies', 'verb' => 'GET'],
        ['name' => 'Tenancy#create', 'url' => '/tenancies', 'verb' => 'POST'],
        ['name' => 'Tenancy#changeConditions', 'url' => '/tenancies/{id}/change-conditions', 'verb' => 'POST'],
        ['name' => 'Tenancy#update', 'url' => '/tenancies/{id}', 'verb' => 'PUT'],
        ['name' => 'Tenancy#destroy', 'url' => '/tenancies/{id}', 'verb' => 'DELETE'],

        // Booking
        ['name' => 'Booking#index', 'url' => '/bookings', 'verb' => 'GET'],
        ['name' => 'Booking#show', 'url' => '/bookings/{id}', 'verb' => 'GET'],
        ['name' => 'Booking#create', 'url' => '/bookings', 'verb' => 'POST'],
        ['name' => 'Booking#update', 'url' => '/bookings/{id}', 'verb' => 'PUT'],
        ['name' => 'Booking#destroy', 'url' => '/bookings/{id}', 'verb' => 'DELETE'],
        ['name' => 'Distribution#updateForProperty', 'url' => '/properties/{propertyId}/distributions/{distributionId}', 'verb' => 'PUT'],
        ['name' => 'Distribution#report', 'url' => '/distribution-report', 'verb' => 'GET'],

        // Documents
        ['name' => 'Document#index', 'url' => '/documents/{entityType}/{entityId}', 'verb' => 'GET'],
        ['name' => 'Document#show', 'url' => '/documents/{id}', 'verb' => 'GET'],
        ['name' => 'Document#link', 'url' => '/documents/{entityType}/{entityId}', 'verb' => 'POST'],
        ['name' => 'Document#upload', 'url' => '/documents/{entityType}/{entityId}/upload', 'verb' => 'POST'],
        ['name' => 'Document#attach', 'url' => '/documents/attach', 'verb' => 'POST'],
        ['name' => 'Document#destroy', 'url' => '/documents/{id}', 'verb' => 'DELETE'],

        // Dashboard
        ['name' => 'Dashboard#summary', 'url' => '/dashboard/summary', 'verb' => 'GET'],

        // Settings
        ['name' => 'Settings#show', 'url' => '/settings', 'verb' => 'GET'],
        ['name' => 'Settings#update', 'url' => '/settings', 'verb' => 'PUT'],
        ['name' => 'Settings#createDemoContent', 'url' => '/settings/demo-content', 'verb' => 'POST'],

        // Accounts
        ['name' => 'Account#index', 'url' => '/accounts', 'verb' => 'GET'],
        ['name' => 'Account#create', 'url' => '/accounts', 'verb' => 'POST'],
        ['name' => 'Account#update', 'url' => '/accounts/{id}', 'verb' => 'PUT'],
        ['name' => 'Account#disable', 'url' => '/accounts/{id}/disable', 'verb' => 'POST'],
        ['name' => 'Account#enable', 'url' => '/accounts/{id}/enable', 'verb' => 'POST'],
        ['name' => 'Account#destroy', 'url' => '/accounts/{id}', 'verb' => 'DELETE'],

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
        ['name' => 'WorkflowRun#createForUnit', 'url' => '/api/units/{unitId}/workflow-runs', 'verb' => 'POST'],
        ['name' => 'WorkflowRun#listByUnit', 'url' => '/api/units/{unitId}/workflow-runs', 'verb' => 'GET'],
        ['name' => 'WorkflowRun#show', 'url' => '/api/workflow-runs/{runId}', 'verb' => 'GET'],
        ['name' => 'WorkflowRun#delete', 'url' => '/api/workflow-runs/{runId}', 'verb' => 'DELETE'],
        ['name' => 'WorkflowRun#closeStep', 'url' => '/api/task-steps/{stepId}/close', 'verb' => 'POST'],
        ['name' => 'WorkflowRun#reopenStep', 'url' => '/api/task-steps/{stepId}/reopen', 'verb' => 'POST'],

        // Tasks
        ['name' => 'Task#createForUnit', 'url' => '/api/units/{unitId}/tasks', 'verb' => 'POST'],
        ['name' => 'Task#listByUnit', 'url' => '/api/units/{unitId}/tasks', 'verb' => 'GET'],
        ['name' => 'Task#listOpen', 'url' => '/api/tasks', 'verb' => 'GET'],
        ['name' => 'Task#close', 'url' => '/api/tasks/{taskId}/close', 'verb' => 'POST'],
        ['name' => 'Task#reopen', 'url' => '/api/tasks/{taskId}/reopen', 'verb' => 'POST'],
        ['name' => 'Task#delete', 'url' => '/api/tasks/{taskId}', 'verb' => 'DELETE'],
    ],
];

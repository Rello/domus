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
        ['name' => 'Distribution#listByProperty', 'url' => '/properties/{propertyId}/distributions', 'verb' => 'GET'],
        ['name' => 'Distribution#createForProperty', 'url' => '/properties/{propertyId}/distributions', 'verb' => 'POST'],

        // Unit
        ['name' => 'Unit#index', 'url' => '/units', 'verb' => 'GET'],
        ['name' => 'Unit#listByProperty', 'url' => '/properties/{propertyId}/units', 'verb' => 'GET'],
        ['name' => 'Unit#show', 'url' => '/units/{id}', 'verb' => 'GET'],
        ['name' => 'Unit#create', 'url' => '/units', 'verb' => 'POST'],
        ['name' => 'Unit#update', 'url' => '/units/{id}', 'verb' => 'PUT'],
        ['name' => 'Unit#destroy', 'url' => '/units/{id}', 'verb' => 'DELETE'],
        ['name' => 'Unit#listSettlements', 'url' => '/units/{id}/settlements', 'verb' => 'GET'],
        ['name' => 'Unit#createSettlement', 'url' => '/units/{id}/settlements', 'verb' => 'POST'],
        ['name' => 'Distribution#createForUnit', 'url' => '/units/{unitId}/distributions', 'verb' => 'POST'],
        ['name' => 'Distribution#listByUnit', 'url' => '/units/{unitId}/distributions', 'verb' => 'GET'],
        // Statistics
        ['name' => 'Statistics#unit', 'url' => '/statistics/units/{unitId}', 'verb' => 'GET'],
        ['name' => 'Statistics#unitPerYear', 'url' => '/statistics/units/{unitId}/{year}', 'verb' => 'GET'],
        ['name' => 'Statistics#unitsOverview', 'url' => '/statistics/units-overview', 'verb' => 'GET'],
        ['name' => 'Statistics#accountTotals', 'url' => '/statistics/accounts', 'verb' => 'GET'],

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
        ['name' => 'Distribution#previewBooking', 'url' => '/bookings/{bookingId}/distribution-preview', 'verb' => 'GET'],
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

        // Accounts
        ['name' => 'Account#index', 'url' => '/accounts', 'verb' => 'GET'],
        ['name' => 'Account#create', 'url' => '/accounts', 'verb' => 'POST'],
        ['name' => 'Account#update', 'url' => '/accounts/{id}', 'verb' => 'PUT'],
        ['name' => 'Account#disable', 'url' => '/accounts/{id}/disable', 'verb' => 'POST'],
        ['name' => 'Account#enable', 'url' => '/accounts/{id}/enable', 'verb' => 'POST'],
        ['name' => 'Account#destroy', 'url' => '/accounts/{id}', 'verb' => 'DELETE'],
    ],
];

<?php

return [
    'routes' => [
        ['name' => 'page#index', 'url' => '/', 'verb' => 'GET'],

        ['name' => 'property#index', 'url' => '/properties', 'verb' => 'GET'],
        ['name' => 'property#show', 'url' => '/properties/{id}', 'verb' => 'GET'],
        ['name' => 'property#create', 'url' => '/properties', 'verb' => 'POST'],
        ['name' => 'property#update', 'url' => '/properties/{id}', 'verb' => 'PUT'],
        ['name' => 'property#destroy', 'url' => '/properties/{id}', 'verb' => 'DELETE'],

        ['name' => 'unit#index', 'url' => '/units', 'verb' => 'GET'],
        ['name' => 'unit#byProperty', 'url' => '/properties/{propertyId}/units', 'verb' => 'GET'],
        ['name' => 'unit#show', 'url' => '/units/{id}', 'verb' => 'GET'],
        ['name' => 'unit#create', 'url' => '/units', 'verb' => 'POST'],
        ['name' => 'unit#update', 'url' => '/units/{id}', 'verb' => 'PUT'],
        ['name' => 'unit#destroy', 'url' => '/units/{id}', 'verb' => 'DELETE'],

        ['name' => 'partner#index', 'url' => '/partners', 'verb' => 'GET'],
        ['name' => 'partner#show', 'url' => '/partners/{id}', 'verb' => 'GET'],
        ['name' => 'partner#create', 'url' => '/partners', 'verb' => 'POST'],
        ['name' => 'partner#update', 'url' => '/partners/{id}', 'verb' => 'PUT'],
        ['name' => 'partner#destroy', 'url' => '/partners/{id}', 'verb' => 'DELETE'],

        ['name' => 'tenancy#index', 'url' => '/tenancies', 'verb' => 'GET'],
        ['name' => 'tenancy#show', 'url' => '/tenancies/{id}', 'verb' => 'GET'],
        ['name' => 'tenancy#byUnit', 'url' => '/units/{unitId}/tenancies', 'verb' => 'GET'],
        ['name' => 'tenancy#byPartner', 'url' => '/partners/{partnerId}/tenancies', 'verb' => 'GET'],
        ['name' => 'tenancy#create', 'url' => '/tenancies', 'verb' => 'POST'],
        ['name' => 'tenancy#update', 'url' => '/tenancies/{id}', 'verb' => 'PUT'],
        ['name' => 'tenancy#destroy', 'url' => '/tenancies/{id}', 'verb' => 'DELETE'],

        ['name' => 'booking#index', 'url' => '/bookings', 'verb' => 'GET'],
        ['name' => 'booking#show', 'url' => '/bookings/{id}', 'verb' => 'GET'],
        ['name' => 'booking#create', 'url' => '/bookings', 'verb' => 'POST'],
        ['name' => 'booking#update', 'url' => '/bookings/{id}', 'verb' => 'PUT'],
        ['name' => 'booking#destroy', 'url' => '/bookings/{id}', 'verb' => 'DELETE'],

        ['name' => 'report#index', 'url' => '/reports', 'verb' => 'GET'],
        ['name' => 'report#show', 'url' => '/reports/{id}', 'verb' => 'GET'],
        ['name' => 'report#byPropertyYear', 'url' => '/properties/{propertyId}/reports/{year}', 'verb' => 'GET'],
        ['name' => 'report#createForPropertyYear', 'url' => '/properties/{propertyId}/reports/{year}', 'verb' => 'POST'],
        ['name' => 'report#download', 'url' => '/reports/{id}/download', 'verb' => 'GET'],

        ['name' => 'document#index', 'url' => '/documents/{entityType}/{entityId}', 'verb' => 'GET'],
        ['name' => 'document#create', 'url' => '/documents/{entityType}/{entityId}', 'verb' => 'POST'],
        ['name' => 'document#destroy', 'url' => '/documents/{id}', 'verb' => 'DELETE'],

        ['name' => 'dashboard#summary', 'url' => '/dashboard/summary', 'verb' => 'GET'],
    ],
];

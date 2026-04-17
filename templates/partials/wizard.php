<?php
$urlGenerator = \OC::$server->getURLGenerator();
$wizardConfig = [
    'brandName' => $l->t('Domus'),
    'brandLogo' => $urlGenerator->imagePath('domus', 'app.svg'),
    'closeLabel' => $l->t('Close'),
    'previousLabel' => $l->t('Previous'),
    'nextLabel' => $l->t('Next'),
    'finishLabel' => $l->t('Lets go'),
    'slides' => [
        [
            'layout' => 'featureGrid',
            'title' => $l->t('Manage your rentals inside Nextcloud'),
            'intro' => $l->t('Domus gives landlords one structured place for units, tenants, documents, bookings, and portfolio visibility.'),
            'features' => [
                [
                    'title' => $l->t('Units and activities'),
                    'body' => $l->t('Manage each unit with complete context and follow-up actions.'),
                    'iconClass' => 'domus-icon-unit',
                ],
                [
                    'title' => $l->t('Bookings and documents'),
                    'body' => $l->t('Keep financial records and supporting documents aligned.'),
                    'iconClass' => 'domus-icon-booking',
                ],
                [
                    'title' => $l->t('Tenancies and service charge'),
                    'body' => $l->t('Keep tenant and tenancy management connected to service charge reporting.'),
                    'iconClass' => 'domus-icon-tenancy',
                ],
                [
                    'title' => $l->t('Dashboard'),
                    'body' => $l->t('Get a faster overview of your rental portfolio.'),
                    'iconClass' => 'domus-icon-dashboard',
                ],
            ],
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Units and activities'),
            'intro' => $l->t('Manage each unit with complete context and follow-up actions.'),
            'bullets' => [
                $l->t('Maintain complete unit details in one place'),
                $l->t('Use the action log to document updates and decisions'),
                $l->t('Track upcoming tasks so nothing important is missed'),
            ],
            'mediaLabel' => $l->t('Units and activities'),
            'mediaSrc' => $urlGenerator->imagePath('domus', 'pictures/unit.png'),
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Bookings and documents'),
            'intro' => $l->t('Keep financial records and supporting documents aligned.'),
            'bullets' => [
                $l->t('Track all invoices and payments in one flow'),
                $l->t('Link each booking with the right supporting document'),
                $l->t('Monitor rentability with complete booking context'),
            ],
            'mediaLabel' => $l->t('Bookings and documents'),
            'mediaSrc' => $urlGenerator->imagePath('domus', 'pictures/booking.png'),
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Tenancies and service charge'),
            'intro' => $l->t('Keep tenant and tenancy management connected to service charge reporting.'),
            'bullets' => [
                $l->t('Track tenants and tenancy terms across all units'),
                $l->t('Keep tenancy history clear and easy to review'),
                $l->t('Create service charge reports directly from your tenancy data'),
            ],
            'mediaLabel' => $l->t('Tenancies and service charge'),
            'mediaSrc' => $urlGenerator->imagePath('domus', 'pictures/tenancy.png'),
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Dashboard'),
            'intro' => $l->t('Get a faster overview of your rental portfolio.'),
            'bullets' => [
                $l->t('Use dashboard views for a quick status check'),
                $l->t('Review analytics across occupancy and financial context'),
                $l->t('Spot what needs attention without jumping between records'),
            ],
            'mediaLabel' => $l->t('Dashboard'),
            'mediaSrc' => $urlGenerator->imagePath('domus', 'pictures/dashboard.png'),
            'primaryLabel' => $l->t('Lets go'),
        ],
    ],
];
?>
<script id="domus-wizard-config" type="application/json"><?php
    echo json_encode($wizardConfig, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
?></script>

<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

$urlGenerator = \OC::$server->getURLGenerator();
$wizardConfig = [
    'brandName' => $l->t('Domus'),
    'brandLogo' => $urlGenerator->imagePath('domus', 'app.svg'),
    'closeLabel' => $l->t('Close'),
    'previousLabel' => $l->t('Previous'),
    'nextLabel' => $l->t('Next'),
    'finishLabel' => $l->t('Let’s go'),
    'slides' => [
        [
            'layout' => 'featureGrid',
            'title' => $l->t('Keep your rentals tidy and easy to manage'),
            'intro' => $l->t('Domus helps you keep homes, tenants, payments, and documents together, so daily rental life feels less messy.'),
            'features' => [
                [
                    'title' => $l->t('Homes and notes'),
                    'body' => $l->t('Keep the important details for each home in one place.'),
                    'iconClass' => 'domus-icon-unit',
                ],
                [
                    'title' => $l->t('Money and paperwork'),
                    'body' => $l->t('Save payments, invoices, and documents where you can find them quickly.'),
                    'iconClass' => 'domus-icon-booking',
                ],
                [
                    'title' => $l->t('Tenants and rental periods'),
                    'body' => $l->t('See who lives where, since when, and what matters for each rental.'),
                    'iconClass' => 'domus-icon-tenancy',
                ],
                [
                    'title' => $l->t('Dashboard'),
                    'body' => $l->t('Get a quick overview of what is going on and what needs attention.'),
                    'iconClass' => 'domus-icon-dashboard',
                ],
            ],
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Homes and notes'),
            'intro' => $l->t('Keep each home easy to understand at a glance.'),
            'bullets' => [
                $l->t('Save the key details for every home in one place'),
                $l->t('Write down updates, repairs, and decisions as they happen'),
                $l->t('Keep an eye on open tasks so nothing slips through'),
            ],
            'mediaLabel' => $l->t('Homes and notes'),
            'mediaSrc' => $urlGenerator->imagePath('domus', 'pictures/unit.png'),
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Money and paperwork'),
            'intro' => $l->t('Know what was paid, what is missing, and where the paperwork belongs.'),
            'bullets' => [
                $l->t('Track income and expenses without switching between tools'),
                $l->t('Link bookings to invoices, contracts, and other documents'),
                $l->t('See the financial story behind each home more clearly'),
            ],
            'mediaLabel' => $l->t('Money and paperwork'),
            'mediaSrc' => $urlGenerator->imagePath('domus', 'pictures/booking.png'),
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Tenants and rental periods'),
            'intro' => $l->t('Keep people, contracts, and rental periods easy to follow.'),
            'bullets' => [
                $l->t('See who rents which home and for how long'),
                $l->t('Keep important rental history easy to review later'),
                $l->t('Prepare related reports with less searching and guessing'),
            ],
            'mediaLabel' => $l->t('Tenants and rental periods'),
            'mediaSrc' => $urlGenerator->imagePath('domus', 'pictures/tenancy.png'),
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Dashboard'),
            'intro' => $l->t('Start your day with a simple overview instead of digging through records.'),
            'bullets' => [
                $l->t('Open one screen for a quick status check'),
                $l->t('See useful numbers without needing expert knowledge'),
                $l->t('Spot what needs attention before it turns into a problem'),
            ],
            'mediaLabel' => $l->t('Dashboard'),
            'mediaSrc' => $urlGenerator->imagePath('domus', 'pictures/dashboard.png'),
            'primaryLabel' => $l->t('Let’s go'),
        ],
    ],
];
?>
<script id="domus-wizard-config" type="application/json"><?php
    echo json_encode($wizardConfig, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
?></script>

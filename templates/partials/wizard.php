<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

$wizardPicture = static function(string $name) use ($urlGenerator): string {
    $relativePath = 'pictures/' . $name . '.png';
    $filePath = dirname(__DIR__, 2) . '/img/' . $relativePath;
    return $urlGenerator->imagePath('domus', $relativePath) . '?v=' . filemtime($filePath);
};

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
            'intro' => $l->t('Manage properties, tenancies, finances, and everyday work together in your Nextcloud.'),
            'features' => [
                [
                    'title' => $l->t('Homes and notes'),
                    'body' => $l->t('Connect property details, documents, activities, and tasks.'),
                    'iconClass' => 'domus-icon-unit',
                ],
                [
                    'title' => $l->t('Money and paperwork'),
                    'body' => $l->t('Track bookings, prepare utility reports, and compare annual results.'),
                    'iconClass' => 'domus-icon-booking',
                ],
                [
                    'title' => $l->t('Tenants and rental periods'),
                    'body' => $l->t('Follow rental history and give renters access through Teams.'),
                    'iconClass' => 'domus-icon-tenancy',
                ],
                [
                    'title' => $l->t('Dashboard'),
                    'body' => $l->t('See upcoming tasks and explore your portfolio over several years.'),
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
                $l->t('Record repairs and decisions directly as unit activities'),
                $l->t('Use tasks, process templates, and reminders for recurring work'),
            ],
            'mediaLabel' => $l->t('Homes and notes'),
            'mediaSrc' => $wizardPicture('unit'),
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Money and paperwork'),
            'intro' => $l->t('Know what was paid, what is missing, and where the paperwork belongs.'),
            'bullets' => [
                $l->t('Track income and expenses without switching between tools'),
                $l->t('Link bookings to invoices, contracts, and other documents'),
                $l->t('Create editable utility reports from your own DOCX templates'),
            ],
            'mediaLabel' => $l->t('Money and paperwork'),
            'mediaSrc' => $wizardPicture('booking'),
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Tenants and rental periods'),
            'intro' => $l->t('Keep people, contracts, and rental periods easy to follow.'),
            'bullets' => [
                $l->t('See who rents which home and for how long'),
                $l->t('Work in your Personal portfolio or a Nextcloud Team'),
                $l->t('Link renter accounts in Teams and preview their document access'),
            ],
            'mediaLabel' => $l->t('Tenants and rental periods'),
            'mediaSrc' => $wizardPicture('tenancy'),
        ],
        [
            'layout' => 'detail',
            'title' => $l->t('Dashboard'),
            'intro' => $l->t('Start your day with a simple overview instead of digging through records.'),
            'bullets' => [
                $l->t('Open one screen for a quick status check'),
                $l->t('Compare rent, profit, and profitability across years'),
                $l->t('Set rent-review rules that create tasks when a review is due'),
            ],
            'mediaLabel' => $l->t('Dashboard'),
            'mediaSrc' => $wizardPicture('dashboard'),
            'primaryLabel' => $l->t('Let’s go'),
        ],
    ],
];
?>
<script id="domus-wizard-config" type="application/json"><?php
    echo json_encode($wizardConfig, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT);
?></script>

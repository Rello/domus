<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

/** Bundled process definitions; portfolio customizations are independent copies. */
class SystemTaskTemplates {
    public static function definitions(): array {
        return [
            [
                'key' => 'year_end',
                'name' => 'Year End',
                'description' => null,
                'steps' => [
                    [
                        'title' => 'Invoice received',
                        'description' => 'Collect all invoices that belong to the reporting period.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => 'document',
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Book invoices',
                        'description' => 'Record the invoices as bookings for the correct year.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => 'booking',
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Create year end report',
                        'description' => 'Generate the service charge report for the year.',
                        'defaultDueDaysOffset' => 1,
                        'actionType' => 'serviceChargeReport',
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Send report to tenant',
                        'description' => 'Send the completed report to the tenant or owner.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => null,
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Check incoming payment',
                        'description' => 'Verify that the settlement payment has been received.',
                        'defaultDueDaysOffset' => 21,
                        'actionType' => null,
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Confirm completed',
                        'description' => 'Close the booking year once everything is reconciled.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => 'closeBookingYear',
                        'actionUrl' => null,
                    ],
                ],
            ],
            [
                'key' => 'dunning',
                'name' => 'Dunning',
                'description' => null,
                'steps' => [
                    [
                        'title' => 'Send reminder',
                        'description' => 'Send the initial payment reminder to the tenant.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => null,
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Second reminder',
                        'allowEarlyCompletion' => true,
                        'description' => 'Follow up with a second reminder after the grace period.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => null,
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Court reminder',
                        'allowEarlyCompletion' => true,
                        'description' => 'Escalate to a formal court reminder if needed.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => null,
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Start cancellation process',
                        'allowEarlyCompletion' => true,
                        'description' => 'Begin the cancellation process if no payment arrives.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => null,
                        'actionUrl' => null,
                    ],
                ],
            ],
        ];
    }
}

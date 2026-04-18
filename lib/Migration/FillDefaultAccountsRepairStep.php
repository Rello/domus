<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Migration;

use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;

class FillDefaultAccountsRepairStep implements IRepairStep {
    public function __construct(
        private IDBConnection $connection,
    ) {
    }

    public function getName(): string {
        return 'Fill default install data';
    }

    public function run(IOutput $output): void {
        if (
            !$this->connection->tableExists('domus_accounts')
            || !$this->connection->tableExists('domus_task_templates')
            || !$this->connection->tableExists('domus_task_tpl_steps')
        ) {
            return;
        }

        if (
            $this->countRows('domus_accounts') > 0
            || $this->countRows('domus_task_templates') > 0
            || $this->countRows('domus_task_tpl_steps') > 0
        ) {
            return;
        }

        $this->seedAccounts();
        $this->seedTaskTemplates();
    }

    private function seedAccounts(): void {
        $defaults = [
            ['2000', 'Maintenance fee (allocable)', 'Nebenkosten (umlagefähig)'],
            ['2100', 'Maintenance fee (non-allocable)', 'Nebenkosten (nicht umlagefähig)'],
            ['2200', 'Reserve fund allocation', 'Zuführung Rücklage'],
            ['2300', 'Other costs', 'Sonstige Kosten'],
            ['2400', 'Property tax', 'Grundsteuer'],
            ['2500', 'Loan interest', 'Darlehenszinsen'],
            ['2600', 'Depreciation', 'Abschreibung'],
            ['2700', 'Other tax deductions', 'Sonstige Steuerabzüge'],
            ['3000', 'Total cost', 'Herstellungskosten'],
            ['4000', 'Maintenance1', 'Maintenance1'],
            ['4001', 'Maintenance2', 'Maintenance2'],
            ['4002', 'Maintenance3', 'Maintenance3'],
            ['4003', 'Maintenance4', 'Maintenance4'],
        ];

        $now = time();
        $sortOrder = 1;

        foreach ($defaults as $entry) {
            [$number, $labelEn, $labelDe] = $entry;
            $insert = $this->connection->getQueryBuilder();
            $insert->insert('domus_accounts')
                ->values([
                    'number' => $insert->createNamedParameter($number),
                    'label_de' => $insert->createNamedParameter($labelDe),
                    'label_en' => $insert->createNamedParameter($labelEn),
                    'parent_id' => $insert->createNamedParameter(null),
                    'status' => $insert->createNamedParameter('active'),
                    'is_system' => $insert->createNamedParameter(1),
                    'sort_order' => $insert->createNamedParameter($sortOrder, $insert::PARAM_INT),
                    'created_at' => $insert->createNamedParameter($now, $insert::PARAM_INT),
                    'updated_at' => $insert->createNamedParameter($now, $insert::PARAM_INT),
                ])
                ->executeStatement();
            $sortOrder++;
        }
    }

    private function seedTaskTemplates(): void {
        $now = time();
        $templates = [
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
                        'description' => 'Follow up with a second reminder after the grace period.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => null,
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Court reminder',
                        'description' => 'Escalate to a formal court reminder if needed.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => null,
                        'actionUrl' => null,
                    ],
                    [
                        'title' => 'Start cancellation process',
                        'description' => 'Begin the cancellation process if no payment arrives.',
                        'defaultDueDaysOffset' => 0,
                        'actionType' => null,
                        'actionUrl' => null,
                    ],
                ],
            ],
        ];

        foreach ($templates as $template) {
            $insert = $this->connection->getQueryBuilder();
            $insert->insert('domus_task_templates')
                ->values([
                    'key' => $insert->createNamedParameter($template['key']),
                    'name' => $insert->createNamedParameter($template['name']),
                    'description' => $insert->createNamedParameter($template['description']),
                    'applies_to' => $insert->createNamedParameter('unit'),
                    'is_active' => $insert->createNamedParameter(1, $insert::PARAM_INT),
                    'created_at' => $insert->createNamedParameter($now, $insert::PARAM_INT),
                    'updated_at' => $insert->createNamedParameter($now, $insert::PARAM_INT),
                ])
                ->executeStatement();
            $templateId = $this->findTaskTemplateIdByKey((string)$template['key']);

            if ($templateId <= 0) {
                continue;
            }

            $order = 1;
            foreach ($template['steps'] as $step) {
                $stepInsert = $this->connection->getQueryBuilder();
                $stepInsert->insert('domus_task_tpl_steps')
                    ->values([
                        'template_id' => $stepInsert->createNamedParameter($templateId, $stepInsert::PARAM_INT),
                        'sort_order' => $stepInsert->createNamedParameter($order, $stepInsert::PARAM_INT),
                        'title' => $stepInsert->createNamedParameter($step['title']),
                        'description' => $stepInsert->createNamedParameter($step['description']),
                        'action_type' => $stepInsert->createNamedParameter($step['actionType']),
                        'action_url' => $stepInsert->createNamedParameter($step['actionUrl']),
                        'default_due_days_offset' => $stepInsert->createNamedParameter((int)($step['defaultDueDaysOffset'] ?? 0), $stepInsert::PARAM_INT),
                        'created_at' => $stepInsert->createNamedParameter($now, $stepInsert::PARAM_INT),
                        'updated_at' => $stepInsert->createNamedParameter($now, $stepInsert::PARAM_INT),
                    ])
                    ->executeStatement();
                $order++;
            }
        }
    }

    private function countRows(string $table): int {
        $qb = $this->connection->getQueryBuilder();
        $qb->select($qb->createFunction('COUNT(*)'))
            ->from($table);
        return (int)$qb->executeQuery()->fetchOne();
    }

    private function findTaskTemplateIdByKey(string $key): int {
        $qb = $this->connection->getQueryBuilder();
        $qb->select('id')
            ->from('domus_task_templates')
            ->where($qb->expr()->eq('key', $qb->createNamedParameter($key)))
            ->setMaxResults(1);
        return (int)$qb->executeQuery()->fetchOne();
    }
}

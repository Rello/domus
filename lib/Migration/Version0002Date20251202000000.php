<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\IDBConnection;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version0002Date20251202000000 extends SimpleMigrationStep {
    public function __construct(private IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?\OCP\DB\ISchemaWrapper {
        return null;
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        if ($this->connection->tableExists('domus_accounts')) {
            $qb = $this->connection->getQueryBuilder();
            $qb->select($qb->createFunction('COUNT(*)'))
                ->from('domus_accounts');
            $count = (int)$qb->executeQuery()->fetchOne();
            if ($count === 0) {
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
                    ['4000', 'Maintenance1'],
                    ['4001', 'Maintenance2'],
                    ['4002', 'Maintenance3'],
                    ['4003', 'Maintenance4'],
                ];

                $now = time();
                $sortOrder = 1;

                foreach ($defaults as $entry) {
                    [$number, $label] = $entry;
                    $insert = $this->connection->getQueryBuilder();
                    $insert->insert('domus_accounts')
                        ->values([
                            'number' => $insert->createNamedParameter($number),
                            'label_de' => $insert->createNamedParameter($label),
                            'label_en' => $insert->createNamedParameter($label),
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
        }

        if (!$this->connection->tableExists('domus_task_templates')) {
            return;
        }

        $qb = $this->connection->getQueryBuilder();
        $qb->select($qb->createFunction('COUNT(*)'))
            ->from('domus_task_templates');
        $count = (int)$qb->executeQuery()->fetchOne();
        if ($count > 0) {
            return;
        }

        $now = time();
        $templates = [
            [
                'key' => 'year_end',
                'name' => 'Year End',
                'description' => null,
                'steps' => [
                    'Invoice received',
                    'Book invoices',
                    'Create year end report',
                    'Send report to tenant',
                    'Check incoming payment',
                    'Confirm completed',
                ],
            ],
            [
                'key' => 'dunning',
                'name' => 'Dunning',
                'description' => null,
                'steps' => [
                    'Send reminder',
                    'Second reminder',
                    'Court reminder',
                    'Start cancellation process',
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

            $lookup = $this->connection->getQueryBuilder();
            $lookup->select('id')
                ->from('domus_task_templates')
                ->where($lookup->expr()->eq('key', $lookup->createNamedParameter($template['key'])))
                ->setMaxResults(1);
            $templateId = (int)$lookup->executeQuery()->fetchOne();
            if ($templateId <= 0) {
                continue;
            }

            $order = 1;
            foreach ($template['steps'] as $title) {
                $stepInsert = $this->connection->getQueryBuilder();
                $stepInsert->insert('domus_task_tpl_steps')
                    ->values([
                        'template_id' => $stepInsert->createNamedParameter($templateId, $stepInsert::PARAM_INT),
                        'sort_order' => $stepInsert->createNamedParameter($order, $stepInsert::PARAM_INT),
                        'title' => $stepInsert->createNamedParameter($title),
                        'description' => $stepInsert->createNamedParameter(null),
                        'default_due_days_offset' => $stepInsert->createNamedParameter(0, $stepInsert::PARAM_INT),
                        'created_at' => $stepInsert->createNamedParameter($now, $stepInsert::PARAM_INT),
                        'updated_at' => $stepInsert->createNamedParameter($now, $stepInsert::PARAM_INT),
                    ])
                    ->executeStatement();
                $order++;
            }
        }
    }
}

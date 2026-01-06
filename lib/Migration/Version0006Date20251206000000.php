<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0006Date20251206000000 extends SimpleMigrationStep {
    public function __construct(private IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('domus_task_templates')) {
            $table = $schema->createTable('domus_task_templates');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('key', 'string', ['length' => 64, 'notnull' => true]);
            $table->addColumn('name', 'string', ['length' => 190, 'notnull' => true]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('applies_to', 'string', ['length' => 32, 'notnull' => true]);
            $table->addColumn('is_active', 'integer', ['notnull' => true, 'default' => 1]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['key'], 'domus_task_tpl_key');
        }

        if (!$schema->hasTable('domus_task_tpl_steps')) {
            $table = $schema->createTable('domus_task_tpl_steps');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('template_id', 'bigint', ['notnull' => true]);
            $table->addColumn('sort_order', 'integer', ['notnull' => true, 'default' => 0]);
            $table->addColumn('title', 'string', ['length' => 190, 'notnull' => true]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('default_due_days_offset', 'integer', ['notnull' => true, 'default' => 0]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['template_id'], 'domus_task_tpl_step_tpl');
        }

        if (!$schema->hasTable('domus_workflow_runs')) {
            $table = $schema->createTable('domus_workflow_runs');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => true]);
            $table->addColumn('template_id', 'bigint', ['notnull' => true]);
            $table->addColumn('name', 'string', ['length' => 190, 'notnull' => true]);
            $table->addColumn('year', 'integer', ['notnull' => false]);
            $table->addColumn('status', 'string', ['length' => 32, 'notnull' => true, 'default' => 'open']);
            $table->addColumn('started_at', 'bigint', ['notnull' => true]);
            $table->addColumn('closed_at', 'bigint', ['notnull' => false]);
            $table->addColumn('created_by', 'string', ['length' => 64, 'notnull' => true]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['unit_id'], 'domus_wrk_run_unit');
            $table->addIndex(['template_id'], 'domus_wrk_run_tpl');
        }

        if (!$schema->hasTable('domus_task_steps')) {
            $table = $schema->createTable('domus_task_steps');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('workflow_run_id', 'bigint', ['notnull' => true]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => true]);
            $table->addColumn('sort_order', 'integer', ['notnull' => true, 'default' => 0]);
            $table->addColumn('title', 'string', ['length' => 190, 'notnull' => true]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('status', 'string', ['length' => 32, 'notnull' => true, 'default' => 'new']);
            $table->addColumn('due_date', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('opened_at', 'bigint', ['notnull' => false]);
            $table->addColumn('closed_at', 'bigint', ['notnull' => false]);
            $table->addColumn('closed_by', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['workflow_run_id'], 'domus_task_step_run');
            $table->addIndex(['unit_id'], 'domus_task_step_unit');
            $table->addIndex(['status'], 'domus_task_step_stat');
        }

        if (!$schema->hasTable('domus_tasks')) {
            $table = $schema->createTable('domus_tasks');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('unit_id', 'bigint', ['notnull' => true]);
            $table->addColumn('title', 'string', ['length' => 190, 'notnull' => true]);
            $table->addColumn('description', 'text', ['notnull' => false]);
            $table->addColumn('status', 'string', ['length' => 32, 'notnull' => true, 'default' => 'open']);
            $table->addColumn('due_date', 'string', ['length' => 32, 'notnull' => false]);
            $table->addColumn('closed_at', 'bigint', ['notnull' => false]);
            $table->addColumn('closed_by', 'string', ['length' => 64, 'notnull' => false]);
            $table->addColumn('created_by', 'string', ['length' => 64, 'notnull' => true]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['unit_id'], 'domus_task_unit');
            $table->addIndex(['status'], 'domus_task_stat');
        }

        return $schema;
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
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

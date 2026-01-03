<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0005Date20251205000000 extends SimpleMigrationStep {
    public function __construct(private IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('domus_accounts')) {
            $table = $schema->createTable('domus_accounts');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('number', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('label_de', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('label_en', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('parent_id', 'bigint', ['notnull' => false]);
            $table->addColumn('status', 'string', ['notnull' => true, 'length' => 32, 'default' => 'active']);
            $table->addColumn('is_system', 'integer', ['notnull' => true, 'default' => 0]);
            $table->addColumn('sort_order', 'integer', ['notnull' => true, 'default' => 0]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['number'], 'domus_acct_number');
            $table->addIndex(['parent_id'], 'domus_acct_parent');
        }

        return $schema;
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        if (!$this->connection->tableExists('domus_accounts')) {
            return;
        }

        $qb = $this->connection->getQueryBuilder();
        $qb->select($qb->createFunction('COUNT(*)'))
            ->from('domus_accounts');
        $count = (int)$qb->executeQuery()->fetchOne();
        if ($count > 0) {
            return;
        }

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

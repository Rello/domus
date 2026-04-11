<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0007Date20260329120000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('domus_action_logs')) {
            $table = $schema->createTable('domus_action_logs');
            $table->addColumn('id', 'bigint', ['autoincrement' => true, 'notnull' => true]);
            $table->addColumn('user_id', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('entity_type', 'string', ['notnull' => true, 'length' => 32]);
            $table->addColumn('entity_id', 'bigint', ['notnull' => true]);
            $table->addColumn('type', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('title', 'string', ['notnull' => true, 'length' => 190]);
            $table->addColumn('data', 'text', ['notnull' => false]);
            $table->addColumn('source', 'string', ['notnull' => true, 'length' => 32, 'default' => 'manual']);
            $table->addColumn('linked_entity_type', 'string', ['notnull' => false, 'length' => 32]);
            $table->addColumn('linked_entity_id', 'bigint', ['notnull' => false]);
            $table->addColumn('linked_label', 'string', ['notnull' => false, 'length' => 190]);
            $table->addColumn('created_by', 'string', ['notnull' => true, 'length' => 64]);
            $table->addColumn('created_at', 'bigint', ['notnull' => true]);
            $table->addColumn('updated_at', 'bigint', ['notnull' => true]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'domus_alog_user');
            $table->addIndex(['entity_type', 'entity_id'], 'domus_alog_ent');
            $table->addIndex(['created_at'], 'domus_alog_created');
        }

        return $schema;
    }
}

<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Additive Team ownership. Existing rows remain in the Personal context.
 */
class Version0004Date20260930000000 extends SimpleMigrationStep {
    public const OWNED_TABLES = [
        'domus_properties' => 'domus_prop_team',
        'domus_units' => 'domus_unit_team',
        'domus_partners' => 'domus_part_team',
        'domus_partner_rel' => 'domus_prel_team',
        'domus_tenancies' => 'domus_ten_team',
        'domus_bookings' => 'domus_book_team',
        'domus_docLinks' => 'domus_doc_team',
        'domus_dist_keys' => 'domus_dkey_team',
        'domus_dist_key_units' => 'domus_dku_team',
        'domus_accounts' => 'domus_acct_team',
        'domus_task_templates' => 'domus_tpl_team',
        'domus_task_tpl_steps' => 'domus_tstep_team',
        'domus_workflow_runs' => 'domus_wrun_team',
        'domus_task_steps' => 'domus_step_team',
        'domus_tasks' => 'domus_task_team',
        'domus_booking_years' => 'domus_byear_team',
        'domus_action_logs' => 'domus_alog_team',
    ];

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        $schema = $schemaClosure();
        foreach (self::OWNED_TABLES as $name => $index) {
            $table = $schema->getTable($name);
            if (!$table->hasColumn('team_id')) {
                $table->addColumn('team_id', 'string', ['length' => 255, 'notnull' => false]);
            }
            if (!$table->hasIndex($index)) {
                $table->addIndex(['team_id'], $index);
            }
        }

        $relations = $schema->getTable('domus_partner_rel');
        if (!$relations->hasIndex('domus_prel_team_uniq')) {
            $relations->addUniqueIndex(['team_id', 'type', 'relation_id', 'partner_id'], 'domus_prel_team_uniq');
        }
        $accounts = $schema->getTable('domus_accounts');
        if (!$accounts->hasColumn('scope_key')) {
            $accounts->addColumn('scope_key', 'string', ['length' => 260, 'notnull' => true, 'default' => 'global']);
        }
        if (!$accounts->hasColumn('source_catalogue_id')) {
            $accounts->addColumn('source_catalogue_id', 'bigint', ['notnull' => false]);
        }
        if ($accounts->hasIndex('domus_acct_number')) {
            $accounts->dropIndex('domus_acct_number');
        }
        if (!$accounts->hasIndex('domus_acct_scope_num')) {
            $accounts->addUniqueIndex(['scope_key', 'number'], 'domus_acct_scope_num');
        }
        if (!$accounts->hasIndex('domus_acct_team_src')) {
            $accounts->addUniqueIndex(['team_id', 'source_catalogue_id'], 'domus_acct_team_src');
        }
        $templates = $schema->getTable('domus_task_templates');
        if (!$templates->hasColumn('scope_key')) {
            $templates->addColumn('scope_key', 'string', ['length' => 260, 'notnull' => true, 'default' => 'global']);
        }
        if (!$templates->hasColumn('source_catalogue_id')) {
            $templates->addColumn('source_catalogue_id', 'bigint', ['notnull' => false]);
        }
        if ($templates->hasIndex('domus_task_tpl_key')) {
            $templates->dropIndex('domus_task_tpl_key');
        }
        if (!$templates->hasIndex('domus_tpl_scope_key')) {
            $templates->addUniqueIndex(['scope_key', 'key'], 'domus_tpl_scope_key');
        }
        if (!$templates->hasIndex('domus_tpl_team_src')) {
            $templates->addUniqueIndex(['team_id', 'source_catalogue_id'], 'domus_tpl_team_src');
        }

        if (!$schema->hasTable('domus_team_settings')) {
            $table = $schema->createTable('domus_team_settings');
            $table->addColumn('team_id', 'string', ['length' => 255, 'notnull' => true]);
            $table->addColumn('setting_key', 'string', ['length' => 64, 'notnull' => true]);
            $table->addColumn('setting_value', 'text', ['notnull' => true]);
            $table->setPrimaryKey(['team_id', 'setting_key']);
        }

        return $schema;
    }
}

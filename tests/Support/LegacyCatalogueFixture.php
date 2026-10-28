<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Support;

class LegacyCatalogueFixture {
    public static function tables(): array {
        $account = ['scope_key' => 'global', 'team_id' => null, 'source_catalogue_id' => null,
            'label_de' => 'Eigene Kosten', 'label_en' => 'Custom costs', 'status' => 'active',
            'is_system' => 0, 'sort_order' => 2, 'created_at' => 10, 'updated_at' => 20, 'parent_id' => null];
        $template = ['scope_key' => 'global', 'team_id' => null, 'source_catalogue_id' => null,
            'name' => 'Customized process', 'description' => 'Keep this description', 'applies_to' => 'unit',
            'is_active' => 1, 'created_at' => 10, 'updated_at' => 20];
        $step = ['sort_order' => 1, 'title' => 'Custom step', 'description' => 'Keep these instructions',
            'action_type' => 'url', 'action_url' => 'https://example.com/custom', 'allow_early_completion' => 1,
            'default_due_days_offset' => -3, 'team_id' => null, 'created_at' => 10, 'updated_at' => 20];
        $unit = ['label' => 'Fixture', 'team_id' => null, 'created_at' => 10, 'updated_at' => 20];
        return [
            'domus_accounts' => [
                ['id' => 1, 'number' => '2000', 'is_system' => 1] + $account,
                ['id' => 2, 'number' => '2991', 'parent_id' => 3] + $account,
                ['id' => 3, 'number' => '2990', 'parent_id' => 1, 'status' => 'inactive'] + $account,
                ['id' => 4, 'number' => '2990', 'scope_key' => 'team:alpha', 'team_id' => 'alpha'] + $account,
            ],
            'domus_units' => [
                ['id' => 1, 'user_id' => 'alice'] + $unit,
                ['id' => 2, 'user_id' => 'bob'] + $unit,
                ['id' => 3, 'user_id' => 'guest'] + $unit,
                ['id' => 4, 'user_id' => 'deleted'] + $unit,
                ['id' => 5, 'user_id' => 'team-only', 'team_id' => 'alpha'] + $unit,
            ],
            'domus_bookings' => [['id' => 1, 'user_id' => 'alice', 'unit_id' => 1, 'account' => 2991,
                'date' => '2026-10-01', 'amount' => '123.45', 'year' => 2026, 'created_at' => 10, 'updated_at' => 20]],
            'domus_task_templates' => [
                ['id' => 1, 'key' => 'dunning'] + $template,
                ['id' => 2, 'key' => 'year_end', 'is_active' => 0] + $template,
                ['id' => 3, 'key' => 'custom', 'applies_to' => 'property'] + $template,
                ['id' => 4, 'key' => 'custom', 'scope_key' => 'team:alpha', 'team_id' => 'alpha'] + $template,
            ],
            'domus_task_tpl_steps' => [
                ['id' => 1, 'template_id' => 1] + $step,
                ['id' => 2, 'template_id' => 2] + $step,
                ['id' => 3, 'template_id' => 3] + $step,
                ['id' => 4, 'template_id' => 4, 'team_id' => 'alpha'] + $step,
            ],
            'domus_workflow_runs' => [['id' => 1, 'entity_type' => 'unit', 'entity_id' => 1,
                'template_id' => 1, 'name' => 'Historical process', 'started_at' => 10, 'created_by' => 'alice',
                'created_at' => 10, 'updated_at' => 20]],
            'domus_task_steps' => [['id' => 1, 'workflow_run_id' => 1, 'entity_id' => 1, 'sort_order' => 1,
                'title' => 'Historical step', 'due_date' => '2026-11-01', 'created_at' => 10, 'updated_at' => 20]],
        ];
    }
}

<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Migration\Version0003Date20260926000000;
use PHPUnit\Framework\TestCase;

class DunningTemplateMigrationTest extends TestCase {
    public function testOnlyOriginalBundledStepsReceiveNewDefaults(): void {
        $defaults = [
            ['Send reminder', 'Send the initial payment reminder to the tenant.'],
            ['Second reminder', 'Follow up with a second reminder after the grace period.'],
            ['Court reminder', 'Escalate to a formal court reminder if needed.'],
            ['Start cancellation process', 'Begin the cancellation process if no payment arrives.'],
        ];
        $steps = [];
        foreach ($defaults as $index => [$title, $description]) {
            $steps[] = ['sort_order' => $index + 1, 'title' => $title, 'description' => $description,
                'default_due_days_offset' => 0, 'action_type' => null, 'action_url' => null];
        }
        $this->assertTrue(Version0003Date20260926000000::matchesBundledDunning($steps));
        foreach (['title' => 'Custom title', 'description' => 'Custom description', 'default_due_days_offset' => 5,
            'action_type' => 'url', 'action_url' => 'https://example.com', 'sort_order' => 7] as $field => $value) {
            $custom = $steps;
            $custom[1][$field] = $value;
            $this->assertFalse(Version0003Date20260926000000::matchesBundledDunning($custom), $field);
        }
        $this->assertFalse(Version0003Date20260926000000::matchesBundledDunning(array_slice($steps, 0, 3)));
    }
}

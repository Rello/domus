<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\RuleMapper;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Tests\Support\TransferDatabase;
use OCA\Domus\Exception\ResourceNotFoundException;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class RuleMapperTest extends TestCase {
    /** @dataProvider ownership */
    public function testParentOwnershipGuardsRulesAndAlerts(string $actor, ?string $team, int $allowed): void {
        $db = new TransferDatabase();
        $db->tables['domus_rule_sets'] = [
            ['id' => 1, 'user_id' => 'alice', 'team_id' => null, 'definition' => '{"name":"Personal"}'],
            ['id' => 2, 'user_id' => 'alice', 'team_id' => 'team-a', 'definition' => '{"name":"Shared A"}'],
            ['id' => 3, 'user_id' => 'alice', 'team_id' => 'team-b', 'definition' => '{"name":"Shared B"}'],
        ];
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('managementUserId')->willReturn($actor);
        $access->method('activeTeamId')->willReturn($team);
        $l10n = $this->createMock(IL10N::class); $l10n->method('t')->willReturnArgument(0);
        $mapper = new RuleMapper($db, $access, $l10n);
        self::assertSame($allowed, $mapper->findRule($allowed)['id']);
        foreach ([1, 2, 3] as $id) {
            if ($id === $allowed) continue;
            try { $mapper->taskLinks($id); self::fail('Foreign alerts were accessible'); }
            catch (ResourceNotFoundException) { self::assertTrue(true); }
            try { $mapper->locked($id, fn() => self::fail('Foreign lock executed')); self::fail('Foreign lock accepted'); }
            catch (ResourceNotFoundException) { self::assertTrue(true); }
        }
        self::assertSame(2, $db->rollbacks);
    }
    public static function ownership(): array {
        return [['alice', null, 1], ['alice', 'team-a', 2], ['bob', 'team-a', 2], ['alice', 'team-b', 3]];
    }
}

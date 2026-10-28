<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\RenterAccessMapper;
use OCA\Domus\Service\{UserCleanupService, UnitMoveGuard};
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\IL10N;
use OCP\TaskProcessing\{IManager, Task};
use PHPUnit\Framework\TestCase;

class UserCleanupTest extends TestCase {
    private function service(TransferDatabase $db, ?RenterAccessMapper $renters = null): UserCleanupService {
        $guard = $this->createMock(UnitMoveGuard::class);
        $guard->expects(self::atLeastOnce())->method('acquire')->with('alice', true);
        $guard->expects(self::atLeastOnce())->method('release')->with('alice', true);
        return new UserCleanupService($db, $renters ?? new RenterAccessMapper($db, $this->createMock(IL10N::class)), $guard, $this->createMock(IManager::class));
    }

    public function testPersonalGraphRemovedButTeamHistoryAndOtherUsersSurviveRepeatedCleanup(): void {
        $db = new TransferDatabase();
        foreach (['properties', 'units', 'tenancies', 'bookings', 'partners', 'docLinks', 'action_logs', 'partner_rel', 'dist_keys', 'dist_key_units', 'rule_sets'] as $name) {
            $db->tables['domus_' . $name] = [
                ['id' => 1, 'user_id' => 'alice', 'team_id' => null],
                ['id' => 2, 'user_id' => 'alice', 'team_id' => 'team-a'],
                ['id' => 3, 'user_id' => 'bob', 'team_id' => null],
            ];
        }
        foreach (['tasks', 'task_steps', 'workflow_runs'] as $name) {
            $db->tables['domus_' . $name] = [
                ['id' => 1, 'entity_type' => 'unit', 'entity_id' => 1, 'team_id' => null, 'created_by' => 'bob'],
                ['id' => 2, 'entity_type' => 'unit', 'entity_id' => 2, 'team_id' => 'team-a', 'created_by' => 'alice'],
                ['id' => 3, 'entity_type' => 'unit', 'entity_id' => 3, 'team_id' => null, 'created_by' => 'alice'],
            ];
        }
        foreach (['accounts', 'task_templates'] as $name) {
            $db->tables['domus_' . $name] = [
                ['id' => 1, 'scope_key' => 'user:alice', 'team_id' => null],
                ['id' => 2, 'scope_key' => 'team:team-a', 'team_id' => 'team-a'],
                ['id' => 3, 'scope_key' => 'global', 'team_id' => null],
                ['id' => 4, 'scope_key' => 'user:bob', 'team_id' => null],
            ];
        }
        $db->tables['domus_task_tpl_steps'] = [
            ['id' => 1, 'template_id' => 1, 'team_id' => null],
            ['id' => 2, 'template_id' => 2, 'team_id' => 'team-a'],
            ['id' => 3, 'template_id' => 3, 'team_id' => null],
        ];
        $db->tables['domus_rule_tasks'] = [['id' => 1, 'ruleset_id' => 1], ['id' => 2, 'ruleset_id' => 2]];
        $db->tables['domus_rule_context'] = [['entity_type' => 'rentReview.tenancy', 'entity_id' => 1], ['entity_type' => 'rentReview.tenancy', 'entity_id' => 2]];
        $db->tables['domus_booking_years'] = [['id' => 1, 'property_id' => 1, 'team_id' => null], ['id' => 2, 'unit_id' => 2, 'team_id' => 'team-a']];
        $db->tables['domus_unit_moves'] = [['id' => 1, 'user_id' => 'alice', 'status' => 'copying'], ['id' => 2, 'user_id' => 'alice', 'status' => 'completed'], ['id' => 3, 'user_id' => 'bob', 'status' => 'copying']];
        $service = $this->service($db);
        $service->cleanup('alice');
        foreach (['properties', 'units', 'tenancies', 'bookings', 'partners', 'docLinks', 'action_logs', 'partner_rel', 'dist_keys', 'dist_key_units', 'rule_sets', 'tasks', 'task_steps', 'workflow_runs'] as $name) {
            self::assertSame([2, 3], array_column($db->tables['domus_' . $name], 'id'), $name);
        }
        self::assertSame([2, 3, 4], array_column($db->tables['domus_accounts'], 'id'));
        self::assertSame([2, 3, 4], array_column($db->tables['domus_task_templates'], 'id'));
        self::assertSame([2, 3], array_column($db->tables['domus_task_tpl_steps'], 'id'));
        self::assertSame([2], array_column($db->tables['domus_rule_tasks'], 'id'));
        self::assertSame([2], array_column($db->tables['domus_rule_context'], 'entity_id'));
        self::assertSame([2], array_column($db->tables['domus_booking_years'], 'id'));
        self::assertSame([3], array_column($db->tables['domus_unit_moves'], 'id'));
        $after = $db->tables;
        $service->cleanup('alice');
        self::assertSame($after, $db->tables);
    }

    public function testDatabaseFailureRollsBackAndReleasesLockForRetry(): void {
        $db = new TransferDatabase();
        $db->tables['domus_units'] = [['id' => 1, 'user_id' => 'alice', 'team_id' => null]];
        $before = $db->tables;
        $renters = $this->createMock(RenterAccessMapper::class);
        $renters->method('unlinkDeletedUser')->willThrowException(new \RuntimeException('database unavailable'));
        try { $this->service($db, $renters)->cleanup('alice'); self::fail('Must propagate failure'); }
        catch (\RuntimeException $e) { self::assertSame('database unavailable', $e->getMessage()); }
        self::assertSame($before, $db->tables);
        self::assertSame(1, $db->rollbacks);
        $this->service($db)->cleanup('alice');
        self::assertSame([], $db->tables['domus_units']);
    }

    public function testOnlyDeletedUsersDomusTasksAreCancelledAndDeleted(): void {
        $tasks = $this->createMock(IManager::class);
        $active = new Task('chat', [], 'domus', 'alice', 'booking-preview:1');
        $active->setId(1); $active->setStatus(Task::STATUS_RUNNING);
        $other = new Task('chat', [], 'other-app', 'alice', 'other');
        $tasks->expects(self::once())->method('getUserTasksByApp')->with('alice', 'domus')->willReturn([$active, $other]);
        $tasks->expects(self::once())->method('cancelTask')->with(1);
        $tasks->expects(self::once())->method('deleteTask')->with($active);
        $db = new TransferDatabase();
        (new UserCleanupService($db, new RenterAccessMapper($db, $this->createMock(IL10N::class)), $this->createMock(UnitMoveGuard::class), $tasks))->cleanup('alice');
    }
}

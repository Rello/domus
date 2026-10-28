<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\RuleMapper;
use OCA\Domus\Service\{BackgroundRuleService, RuleService, ManagementAccessContext};
use OCP\{IUser, IUserManager};
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class BackgroundRuleServiceTest extends TestCase {
    private function user(string $uid): IUser {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn($uid);
        return $user;
    }

    public function testOrphanedTeamUsesAuthorizedMemberAndNeverRevivesPersonalScope(): void {
        $mapper = $this->createMock(RuleMapper::class);
        $mapper->method('backgroundOwners')->willReturn([
            ['user_id' => 'deleted', 'team_id' => null],
            ['user_id' => 'deleted', 'team_id' => 'team-a'],
            ['user_id' => 'removed', 'team_id' => 'team-a'],
            ['user_id' => 'deleted', 'team_id' => 'team-b'],
        ]);
        $users = $this->createMock(IUserManager::class);
        $users->method('get')->willReturnCallback(fn($uid) => $uid === 'deleted' ? null : $this->user($uid));
        $users->expects(self::once())->method('callForSeenUsers')->willReturnCallback(function ($callback) {
            foreach (['guest', 'disabled', 'outsider', 'member-a', 'member-b'] as $uid) $callback($this->user($uid));
        });
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('runBackground')->willReturnCallback(function ($user, $team, $operation) {
            if (($user->getUID() === 'member-a' && $team === 'team-a') || ($user->getUID() === 'member-b' && $team === 'team-b')) return $operation();
            throw new \DomainException('No staff membership');
        });
        $evaluated = [];
        $rules = $this->createMock(RuleService::class);
        $rules->expects(self::exactly(2))->method('evaluate')->willReturnCallback(function ($uid) use (&$evaluated) { $evaluated[] = $uid; return []; });
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method('warning');
        (new BackgroundRuleService($mapper, $rules, $access, $users, $logger))->evaluate();
        self::assertSame(['member-a', 'member-b'], $evaluated);
    }

    public function testEvaluationFailureDoesNotRetryWithOtherMembers(): void {
        $mapper = $this->createMock(RuleMapper::class);
        $mapper->method('backgroundOwners')->willReturn([
            ['user_id' => 'alice', 'team_id' => 'team-a'], ['user_id' => 'bob', 'team_id' => 'team-a'],
        ]);
        $users = $this->createMock(IUserManager::class);
        $users->method('get')->willReturn($this->user('alice'));
        $users->expects(self::never())->method('callForSeenUsers');
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('runBackground')->willReturnCallback(fn($user, $team, $operation) => $operation());
        $rules = $this->createMock(RuleService::class);
        $rules->expects(self::once())->method('evaluate')->willThrowException(new \RuntimeException('failed'));
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('warning');
        (new BackgroundRuleService($mapper, $rules, $access, $users, $logger))->evaluate();
    }

    public function testNoAuthorizedMemberLeavesTeamUnchanged(): void {
        $mapper = $this->createMock(RuleMapper::class);
        $mapper->method('backgroundOwners')->willReturn([['user_id' => 'deleted', 'team_id' => 'team-a']]);
        $users = $this->createMock(IUserManager::class);
        $users->method('get')->willReturn(null);
        $users->method('callForSeenUsers')->willReturnCallback(fn($callback) => $callback($this->user('outsider')));
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('runBackground')->willThrowException(new \DomainException('Not a member'));
        $rules = $this->createMock(RuleService::class);
        $rules->expects(self::never())->method('evaluate');
        (new BackgroundRuleService($mapper, $rules, $access, $users, $this->createMock(LoggerInterface::class)))->evaluate();
    }
}

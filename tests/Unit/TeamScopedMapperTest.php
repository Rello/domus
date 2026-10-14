<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\Property;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\AccountMapper;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\IDBConnection;
use PHPUnit\Framework\TestCase;

class TeamScopedMapperTest extends TestCase {
    private function mapper(?string $teamId, string $owner = 'owner'): PropertyMapper {
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('activeTeamId')->willReturn($teamId);
        $access->method('legacyOwnerUserId')->willReturn($owner);
        return new PropertyMapper($this->createMock(IDBConnection::class), $access);
    }

    public function testTeamInsertStampsTeamWithoutChangingActorIdentity(): void {
        $property = new Property();
        $property->setUserId('actor');
        $this->mapper('team-a')->insert($property);
        self::assertSame('team-a', $property->getTeamId());
        self::assertSame('actor', $property->getUserId());
    }

    public function testTeamUpdateRejectsAnotherPortfolio(): void {
        $property = new Property();
        $property->setTeamId('team-b');
        $this->expectException(\DomainException::class);
        $this->mapper('team-a')->update($property);
    }

    public function testLegacyOwnerCannotDeleteMappedRecord(): void {
        $property = new Property();
        $property->setUserId('owner');
        $property->setTeamId('team-a');
        $this->expectException(\DomainException::class);
        $this->mapper(null)->delete($property);
    }

    public function testLegacyOwnerCannotUpdateAnotherOwnersRecord(): void {
        $property = new Property();
        $property->setUserId('another-owner');
        $this->expectException(\DomainException::class);
        $this->mapper(null)->update($property);
    }

    public function testTeamOwnerQueryExcludesOtherTeamsAndLegacyRows(): void {
        $db = new TransferDatabase();
        $db->tables['domus_properties'] = [
            ['id' => 1, 'user_id' => 'alice', 'team_id' => null],
            ['id' => 2, 'user_id' => 'alice', 'team_id' => 'team-a'],
            ['id' => 3, 'user_id' => 'bob', 'team_id' => 'team-b'],
        ];
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('activeTeamId')->willReturn('team-a');
        $mapper = new PropertyMapper($db, $access);
        $qb = $db->getQueryBuilder();
        $qb->select('id')->from('domus_properties');
        $method = new \ReflectionMethod($mapper, 'ownerExpression');
        $qb->where($method->invoke($mapper, $qb, 'bob'));
        self::assertSame([2], array_column($qb->executeQuery()->fetchAll(), 'id'));
    }

    public function testPersonalAndMultipleTeamsCoexistForTwoStaffMembers(): void {
        $db = new TransferDatabase();
        $db->tables['domus_properties'] = [
            ['id' => 1, 'user_id' => 'alice', 'team_id' => null],
            ['id' => 2, 'user_id' => 'alice', 'team_id' => 'team-a'],
            ['id' => 3, 'user_id' => 'bob', 'team_id' => 'team-a'],
            ['id' => 4, 'user_id' => 'alice', 'team_id' => 'team-b'],
        ];
        foreach ([
            ['alice', null, [1]],
            ['alice', 'team-a', [2, 3]],
            ['bob', 'team-a', [2, 3]],
            ['alice', 'team-b', [4]],
        ] as [$actor, $teamId, $expected]) {
            $access = $this->createMock(ManagementAccessContext::class);
            $access->method('activeTeamId')->willReturn($teamId);
            $access->method('legacyOwnerUserId')->willReturn($actor);
            $mapper = new PropertyMapper($db, $access);
            $qb = $db->getQueryBuilder();
            $qb->select('id')->from('domus_properties');
            $method = new \ReflectionMethod($mapper, 'ownerExpression');
            $qb->where($method->invoke($mapper, $qb, $actor));
            self::assertSame($expected, array_column($qb->executeQuery()->fetchAll(), 'id'));
        }
    }

    public function testTeamCatalogueIncludesSystemAccountsAndOwnCustomEntriesOnly(): void {
        $db = new TransferDatabase();
        $db->tables['domus_accounts'] = [
            ['id' => 1, 'scope_key' => 'global', 'is_system' => 1],
            ['id' => 2, 'scope_key' => 'global', 'is_system' => 0],
            ['id' => 3, 'scope_key' => 'team:team-a', 'is_system' => 0],
            ['id' => 4, 'scope_key' => 'team:team-b', 'is_system' => 0],
        ];
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('activeTeamId')->willReturn('team-a');
        $mapper = new AccountMapper($db, $access);
        $qb = $db->getQueryBuilder();
        $qb->select('id')->from('domus_accounts');
        $method = new \ReflectionMethod($mapper, 'applyCatalogueScope');
        $method->invoke($mapper, $qb, true);
        self::assertSame([1, 3], array_column($qb->executeQuery()->fetchAll(), 'id'));
    }
}

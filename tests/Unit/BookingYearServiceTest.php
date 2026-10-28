<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{BookingYear, BookingYearMapper, Property, PropertyMapper, Unit, UnitMapper};
use OCA\Domus\Service\{BookingYearService, ManagementAccessContext};
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class BookingYearServiceTest extends TestCase {
    /** @dataProvider scopes */
    public function testCloseIsIdempotentAndReopenClearsLegacyDuplicates(?int $propertyId, ?int $unitId): void {
        $db = new TransferDatabase();
        $db->tables['domus_units'] = [['id' => 7, 'team_id' => 'team-a', 'user_id' => 'owner']];
        $db->tables['domus_properties'] = $db->tables['domus_units'];
        $db->tables['domus_booking_years'] = [];
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('activeTeamId')->willReturn('team-a');
        $mapper = $this->getMockBuilder(BookingYearMapper::class)->setConstructorArgs([$db, $access])
            ->onlyMethods(['findEntities', 'insert'])->getMock();
        $mapper->method('findEntities')->willReturnCallback(function ($query) {
            return array_map(function ($row) {
                $entity = new BookingYear();
                foreach ($row as $key => $value) {
                    $setter = 'set' . str_replace(' ', '', ucwords(str_replace('_', ' ', $key)));
                    $entity->$setter($value);
                }
                return $entity;
            }, $query->executeQuery()->fetchAll());
        });
        $mapper->expects(self::once())->method('insert')->willReturnCallback(function ($row) use ($db) {
            $row->setId(1);
            $db->tables['domus_booking_years'][] = ['id' => 1, 'year' => $row->getYear(), 'property_id' => $row->getPropertyId(), 'unit_id' => $row->getUnitId(), 'team_id' => 'team-a'];
            return $row;
        });
        $units = $this->createMock(UnitMapper::class); $units->method('findForUser')->willReturn(new Unit());
        $properties = $this->createMock(PropertyMapper::class); $properties->method('findForUser')->willReturn(new Property());
        $service = new BookingYearService($mapper, $properties, $units, $this->createMock(IL10N::class));
        $service->closeYear(2026, $propertyId, $unitId, 'alice');
        $service->closeYear(2026, $propertyId, $unitId, 'bob');
        self::assertCount(1, $db->tables['domus_booking_years']);
        $duplicate = $db->tables['domus_booking_years'][0]; $duplicate['id'] = 2;
        $db->tables['domus_booking_years'][] = $duplicate;
        $otherTeam = $duplicate; $otherTeam['team_id'] = 'team-b';
        $otherYear = $duplicate; $otherYear['year'] = 2025;
        $db->tables['domus_booking_years'][] = $otherTeam;
        $db->tables['domus_booking_years'][] = $otherYear;
        self::assertTrue($service->reopenYear(2026, $propertyId, $unitId, 'bob'));
        self::assertFalse($service->isYearClosedForScope(2026, $propertyId, $unitId));
        self::assertSame([$otherTeam, $otherYear], $db->tables['domus_booking_years']);
        self::assertFalse($service->reopenYear(2026, $propertyId, $unitId, 'bob'));
        self::assertSame(4, $db->commits);
    }

    public static function scopes(): array { return [[null, 7], [7, null]]; }

    public function testScopeLockIsAcquiredBeforeCallbackAndRolledBackOnFailure(): void {
        $db = $this->createMock(\OCP\IDBConnection::class);
        $query = $this->createMock(\OCA\Domus\Tests\Support\TransferQuery::class);
        $db->method('getQueryBuilder')->willReturn($query);
        foreach (['update', 'set', 'where', 'andWhere'] as $method) $query->method($method)->willReturnSelf();
        $query->method('expr')->willReturnSelf();
        $locked = false;
        $query->expects(self::once())->method('executeStatement')->willReturnCallback(function () use (&$locked) { $locked = true; return 1; });
        $db->expects(self::once())->method('beginTransaction');
        $db->expects(self::once())->method('rollBack');
        $db->expects(self::never())->method('commit');
        $mapper = new BookingYearMapper($db);
        $this->expectExceptionMessage('Injected failure');
        $mapper->withScopeLock(null, 7, 'alice', function () use (&$locked) {
            self::assertTrue($locked);
            throw new \RuntimeException('Injected failure');
        });
    }
}

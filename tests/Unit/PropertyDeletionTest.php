<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{ActionLogMapper, Booking, BookingYearMapper, DocumentLinkMapper, Property, Unit};
use OCA\Domus\Service\{ManagementAccessContext, PropertyService};
use OCA\Domus\Tests\Support\TransferDatabase;
use PHPUnit\Framework\TestCase;

class PropertyDeletionTest extends TestCase {
    private function service(array &$deps, ?TransferDatabase $db = null): PropertyService {
        $deps = [];
        foreach ((new \ReflectionClass(PropertyService::class))->getConstructor()->getParameters() as $parameter) {
            $deps[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $property = new Property();
        $property->setId(9);
        $property->setUserId('owner');
        $deps['propertyMapper']->method('findForUser')->with(9, 'owner')->willReturn($property);
        if ($db !== null) {
            $deps['connection'] = $db;
            $deps['actionLogMapper'] = new ActionLogMapper($db);
            $deps['documentLinkMapper'] = new DocumentLinkMapper($db);
            $deps['bookingYearMapper'] = new BookingYearMapper($db);
            $deps['bookingMapper']->method('findByUser')->with('owner', ['propertyId' => 9])->willReturnCallback(function () use ($db) {
                return array_map(function ($row) {
                    $booking = new Booking();
                    $booking->setId($row['id']);
                    $booking->setPropertyId(9);
                    $booking->setUnitId($row['unit_id']);
                    return $booking;
                }, array_values(array_filter($db->tables['domus_bookings'], fn($row) => $row['property_id'] === 9)));
            });
            $deps['bookingMapper']->method('delete')->willReturnCallback(function ($booking) use ($db) {
                $db->tables['domus_bookings'] = array_values(array_filter($db->tables['domus_bookings'], fn($row) => $row['id'] !== $booking->getId()));
                return $booking;
            });
        }
        return new PropertyService(...array_values($deps));
    }

    private function database(): TransferDatabase {
        $db = new TransferDatabase();
        $db->tables = [
            'domus_bookings' => [
                ['id' => 1, 'property_id' => 9, 'unit_id' => null],
                ['id' => 2, 'property_id' => 9, 'unit_id' => 34],
                ['id' => 3, 'property_id' => 10, 'unit_id' => null],
            ],
            'domus_docLinks' => [
                ['id' => 1, 'user_id' => 'owner', 'entity_type' => 'booking', 'entity_id' => 1],
                ['id' => 2, 'user_id' => 'owner', 'entity_type' => 'booking', 'entity_id' => 3],
            ],
            'domus_action_logs' => [
                ['id' => 1, 'user_id' => 'owner', 'entity_type' => 'booking', 'entity_id' => 1],
                ['id' => 2, 'user_id' => 'owner', 'entity_type' => 'unit', 'entity_id' => 34, 'linked_entity_type' => 'booking', 'linked_entity_id' => 1],
                ['id' => 3, 'user_id' => 'owner', 'entity_type' => 'booking', 'entity_id' => 2],
                ['id' => 4, 'user_id' => 'owner', 'entity_type' => 'booking', 'entity_id' => 3],
            ],
            'domus_booking_years' => [
                ['id' => 1, 'property_id' => 9, 'unit_id' => null, 'year' => 2025],
                ['id' => 2, 'property_id' => 9, 'unit_id' => 34, 'year' => 2024],
                ['id' => 3, 'property_id' => 10, 'unit_id' => null, 'year' => 2025],
            ],
        ];
        return $db;
    }

    public function testPropertyFinancialCleanupAndUnitCascadePreserveOtherProperty(): void {
        $db = $this->database();
        $deps = [];
        $service = $this->service($deps, $db);
        $unit = new Unit();
        $unit->setId(34);
        $deps['unitMapper']->method('findByUser')->willReturn([$unit]);
        $deps['unitService']->expects(self::once())->method('deleteUnit')->with(34, 'owner')->willReturnCallback(function () use ($db) {
            // Existing unit cascade owns the unit booking deletion.
            $db->tables['domus_bookings'] = array_values(array_filter($db->tables['domus_bookings'], fn($row) => $row['unit_id'] !== 34));
        });
        $deps['propertyMapper']->expects(self::once())->method('delete');
        $deps['audit']->expects(self::once())->method('record')->willReturnCallback(function () use ($db) {
            self::assertSame(1, $db->commits);
        });
        $service->deleteProperty(9, 'owner');
        self::assertSame([3], array_column($db->tables['domus_bookings'], 'id'));
        self::assertSame([2], array_column($db->tables['domus_docLinks'], 'id'));
        self::assertSame([4], array_column($db->tables['domus_action_logs'], 'id'));
        self::assertSame([3], array_column($db->tables['domus_booking_years'], 'id'));
        self::assertSame(1, $db->commits);
    }

    public function testLateFailureRestoresFinancialRecords(): void {
        $db = $this->database();
        $before = $db->tables;
        $deps = [];
        $service = $this->service($deps, $db);
        $deps['audit']->expects(self::never())->method('record');
        $deps['propertyMapper']->method('delete')->willThrowException(new \RuntimeException('Failed property write'));
        try {
            $service->deleteProperty(9, 'owner');
            self::fail('Expected failed property write');
        } catch (\RuntimeException $e) {
            self::assertSame('Failed property write', $e->getMessage());
        }
        self::assertSame($before, $db->tables);
        self::assertSame(0, $db->commits);
        self::assertSame(1, $db->rollbacks);
    }

    public function testSummaryIncludesBookingsYearClosuresAndBookingLinks(): void {
        $deps = [];
        $service = $this->service($deps);
        $booking = new Booking();
        $booking->setId(1);
        $deps['bookingMapper']->method('findByUser')->with('owner', ['propertyId' => 9])->willReturn([$booking]);
        $deps['bookingYearMapper']->expects(self::once())->method('countByProperty')->with(9)->willReturn(2);
        $deps['documentLinkMapper']->method('countForEntity')->with('owner', 'property', 9)->willReturn(1);
        $deps['documentLinkMapper']->expects(self::once())->method('countForEntities')->with('owner', 'booking', [1])->willReturn(3);
        $deps['actionLogMapper']->expects(self::once())->method('countAffectedByEntities')
            ->with('owner', [['entityType' => 'property', 'entityId' => 9], ['entityType' => 'booking', 'entityId' => 1]])->willReturn(4);
        $summary = $service->getDeletionSummary(9, 'owner');
        self::assertSame(1, $summary['bookings']);
        self::assertSame(2, $summary['yearStatus']);
        self::assertSame(4, $summary['documentLinks']);
        self::assertSame(4, $summary['actionLogs']);
    }

    public function testActionSummaryCountsBothEndsOnceAndRespectsOwnerScope(): void {
        $db = $this->database();
        $db->tables['domus_action_logs'][] = ['id' => 5, 'user_id' => 'owner', 'entity_type' => 'property', 'entity_id' => 9,
            'linked_entity_type' => 'booking', 'linked_entity_id' => 1];
        $db->tables['domus_action_logs'][] = ['id' => 6, 'user_id' => 'other', 'entity_type' => 'booking', 'entity_id' => 1];
        $mapper = new ActionLogMapper($db);
        self::assertSame(3, $mapper->countAffectedByEntities('owner', [
            ['entityType' => 'property', 'entityId' => 9], ['entityType' => 'booking', 'entityId' => 1],
        ]));
        self::assertSame(1, $mapper->countAffectedByEntity('owner', 'property', 9));
        self::assertSame(0, $mapper->countAffectedByEntities('owner', []));
    }

    public function testPropertyYearCleanupRespectsPersonalAndTeamScope(): void {
        foreach ([null, 'team-a'] as $teamId) {
            $db = new TransferDatabase();
            $db->tables['domus_booking_years'] = [
                ['id' => 1, 'property_id' => 9, 'team_id' => null],
                ['id' => 2, 'property_id' => 9, 'team_id' => 'team-a'],
                ['id' => 3, 'property_id' => 9, 'team_id' => 'team-b'],
                ['id' => 4, 'property_id' => 10, 'team_id' => $teamId],
            ];
            $access = $this->createMock(ManagementAccessContext::class);
            $access->method('activeTeamId')->willReturn($teamId);
            $access->method('legacyOwnerUserId')->willReturn('owner');
            $mapper = new BookingYearMapper($db, $access);
            self::assertSame(1, $mapper->countByProperty(9));
            $mapper->deleteByProperty(9);
            self::assertSame($teamId === null ? [2, 3, 4] : [1, 3, 4], array_column($db->tables['domus_booking_years'], 'id'));
        }
    }
}

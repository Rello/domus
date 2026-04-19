<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\ActionLogMapper;
use OCA\Domus\Db\Booking;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\DistributionKeyMapper;
use OCA\Domus\Db\DocumentLinkMapper;
use OCA\Domus\Db\Property;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Service\AccountService;
use OCA\Domus\Service\BookingService;
use OCA\Domus\Service\BookingYearService;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class BookingServiceTest extends TestCase {
    public function testCreateBookingRejectsClosedPropertyYear(): void {
        $bookingMapper = $this->createMock(BookingMapper::class);
        $bookingMapper->expects($this->never())->method('insert');

        $bookingYearService = $this->createConfiguredMock(BookingYearService::class, [
            'isYearClosedForBookingScope' => true,
        ]);

        $service = $this->createService(
            bookingMapper: $bookingMapper,
            bookingYearService: $bookingYearService,
        );

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Bookings cannot be changed in a closed year.');

        $service->createBooking([
            'account' => 2100,
            'date' => '2025-03-15',
            'deliveryDate' => '2025-03-15',
            'amount' => '125.00',
            'propertyId' => 9,
        ], 'user1');
    }

    public function testUpdateBookingRejectsExistingClosedYear(): void {
        $booking = $this->createDraftBooking();
        $booking->setYear(2025);
        $booking->setPropertyId(9);

        $bookingMapper = $this->createMock(BookingMapper::class);
        $bookingMapper->method('findForUser')->with(7, 'user1')->willReturn($booking);
        $bookingMapper->expects($this->never())->method('update');

        $bookingYearService = $this->createMock(BookingYearService::class);
        $bookingYearService->expects($this->atLeastOnce())
            ->method('isYearClosedForBookingScope')
            ->with(2025, 9, null)
            ->willReturn(true);

        $service = $this->createService(
            bookingMapper: $bookingMapper,
            bookingYearService: $bookingYearService,
        );

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Bookings cannot be changed in a closed year.');

        $service->updateBooking(7, ['description' => 'Updated'], 'user1');
    }

    public function testUpdateBookingRejectsTargetClosedUnitYear(): void {
        $booking = $this->createDraftBooking();
        $booking->setYear(2024);
        $booking->setUnitId(4);

        $bookingMapper = $this->createMock(BookingMapper::class);
        $bookingMapper->method('findForUser')->with(7, 'user1')->willReturn($booking);
        $bookingMapper->expects($this->never())->method('update');

        $bookingYearService = $this->createMock(BookingYearService::class);
        $bookingYearService->method('isYearClosedForBookingScope')
            ->willReturnCallback(static fn(int $year, ?int $propertyId, ?int $unitId): bool => $year === 2025 && $unitId === 4);

        $service = $this->createService(
            bookingMapper: $bookingMapper,
            bookingYearService: $bookingYearService,
        );

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Bookings cannot be changed in a closed year.');

        $service->updateBooking(7, ['date' => '2025-01-10'], 'user1');
    }

    public function testDeleteBookingRejectsClosedYear(): void {
        $booking = $this->createDraftBooking();
        $booking->setYear(2025);
        $booking->setUnitId(4);

        $bookingMapper = $this->createMock(BookingMapper::class);
        $bookingMapper->method('findForUser')->with(7, 'user1')->willReturn($booking);
        $bookingMapper->expects($this->never())->method('delete');

        $bookingYearService = $this->createConfiguredMock(BookingYearService::class, [
            'isYearClosedForBookingScope' => true,
        ]);

        $service = $this->createService(
            bookingMapper: $bookingMapper,
            bookingYearService: $bookingYearService,
        );

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Bookings cannot be changed in a closed year.');

        $service->deleteBooking(7, 'user1');
    }

    public function testDeleteBookingRemovesLinkedDocumentsAndActionLogs(): void {
        $booking = $this->createDraftBooking();

        $bookingMapper = $this->createMock(BookingMapper::class);
        $bookingMapper->method('findForUser')->with(7, 'user1')->willReturn($booking);
        $bookingMapper->expects($this->once())->method('delete')->with($booking);

        $documentLinkMapper = $this->createMock(DocumentLinkMapper::class);
        $documentLinkMapper->expects($this->once())
            ->method('deleteForEntity')
            ->with('user1', 'booking', 7);

        $actionLogMapper = $this->createMock(ActionLogMapper::class);
        $actionLogMapper->expects($this->once())
            ->method('deleteForEntity')
            ->with('user1', 'booking', 7);
        $actionLogMapper->expects($this->once())
            ->method('deleteForLinkedEntity')
            ->with('user1', 'booking', 7);

        $service = $this->createService(
            bookingMapper: $bookingMapper,
            documentLinkMapper: $documentLinkMapper,
            actionLogMapper: $actionLogMapper,
        );

        $service->deleteBooking(7, 'user1');
    }

    private function createService(
        ?BookingMapper $bookingMapper = null,
        ?DocumentLinkMapper $documentLinkMapper = null,
        ?ActionLogMapper $actionLogMapper = null,
        ?BookingYearService $bookingYearService = null,
    ): BookingService {
        $property = new Property();
        $property->setId(9);
        $propertyMapper = $this->createMock(PropertyMapper::class);
        $propertyMapper->method('findForUser')->willReturn($property);

        $unit = new Unit();
        $unit->setId(4);
        $unitMapper = $this->createMock(UnitMapper::class);
        $unitMapper->method('findForUser')->willReturn($unit);

        $accountService = $this->createMock(AccountService::class);
        $accountService->method('assertAccountNumber');
        $accountService->method('assertAccountActive');

        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(fn(string $message) => $message);

        return new BookingService(
            $bookingMapper ?? $this->createMock(BookingMapper::class),
            $documentLinkMapper ?? $this->createMock(DocumentLinkMapper::class),
            $propertyMapper,
            $unitMapper,
            $this->createMock(DistributionKeyMapper::class),
            $actionLogMapper ?? $this->createMock(ActionLogMapper::class),
            $bookingYearService ?? $this->createConfiguredMock(BookingYearService::class, [
                'isYearClosedForBookingScope' => false,
            ]),
            $accountService,
            $l10n,
        );
    }

    private function createDraftBooking(): Booking {
        $booking = new Booking();
        $booking->setId(7);
        $booking->setUserId('user1');
        $booking->setAccount(2100);
        $booking->setDate('2024-04-10');
        $booking->setDeliveryDate('2024-04-10');
        $booking->setAmount(120.50);
        $booking->setStatus('draft');
        $booking->setPeriodFrom('2024-04-01');
        $booking->setPeriodTo('2024-04-30');

        return $booking;
    }
}

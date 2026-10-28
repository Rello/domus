<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Controller\BookingController;
use OCA\Domus\Controller\PageController;
use OCA\Domus\Exception\ConflictException;
use OCA\Domus\Exception\ResourceNotFoundException;
use OCA\Domus\Http\ApiErrorResponse;
use OCA\Domus\Middleware\ApiErrorMiddleware;
use OCA\Domus\Service\BookingService;
use OCA\Domus\Service\ManagementAccessContext;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\IL10N;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ApiErrorResponseTest extends TestCase {
    public function testTranslatedServiceErrorsAreNotFormattedAgain(): void {
        $l10n = $this->createMock(IL10N::class);
        $l10n->expects(self::never())->method('t');
        $message = 'Feld %s kann nicht gesetzt werden.';
        $response = ApiErrorResponse::fromException(
            new \InvalidArgumentException($message), $l10n, $this->createMock(LoggerInterface::class),
        );
        self::assertSame($message, $response->getData()['message']);
    }

    public function testAccessErrorsFromMappersAreTranslated(): void {
        $l10n = $this->createMock(IL10N::class);
        $l10n->expects(self::once())->method('t')
            ->with('The record belongs to another Team.')
            ->willReturn('Der Datensatz gehört zu einem anderen Team.');
        $response = ApiErrorResponse::fromException(
            new \DomainException('The record belongs to another Team.'),
            $l10n,
            $this->createMock(LoggerInterface::class),
        );
        self::assertSame(403, $response->getStatus());
        self::assertSame('Der Datensatz gehört zu einem anderen Team.', $response->getData()['message']);
    }

    /** @dataProvider expectedFailures */
    public function testExpectedErrorsHaveConsistentStatusAndCode(\Exception $exception, int $status, string $code): void {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::never())->method('error');
        $response = ApiErrorResponse::fromException($exception, $this->l10n(), $logger);
        self::assertSame($status, $response->getStatus());
        self::assertSame($code, $response->getData()['code']);
        self::assertSame('error', $response->getData()['status']);
    }

    public static function expectedFailures(): array {
        return [
            [new ResourceNotFoundException('Private resource details'), 404, 'NOT_FOUND'],
            [new \InvalidArgumentException('Invalid amount'), 400, 'VALIDATION_ERROR'],
            [new \DomainException('Access denied'), 403, 'ACCESS_DENIED'],
            [new ConflictException('Record is in use'), 409, 'CONFLICT'],
        ];
    }

    /** @dataProvider unexpectedFailures */
    public function testUnexpectedErrorsAreLoggedWithoutExposingDetails(\Throwable $exception): void {
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error')->with('Domus API request failed', ['exception' => $exception]);
        $response = ApiErrorResponse::fromException($exception, $this->l10n(), $logger);
        self::assertSame(500, $response->getStatus());
        self::assertSame(['status' => 'error', 'message' => 'An error occurred', 'code' => 'INTERNAL_ERROR'], $response->getData());
    }

    public static function unexpectedFailures(): array {
        return [[new \RuntimeException('Database connection secret')], [new \TypeError('Internal implementation details')]];
    }

    public function testBookingDetailsExposeClosedYearState(): void {
        $booking = new \OCA\Domus\Db\Booking();
        $booking->setId(402);
        $bookings = $this->createMock(BookingService::class);
        $bookings->method('getBookingForUser')->with(402, 'alice')->willReturn($booking);
        $bookings->method('isBookingYearClosed')->with($booking)->willReturn(true);
        $context = $this->createMock(ManagementAccessContext::class);
        $context->method('managementUserId')->willReturn('alice');
        $controller = new BookingController($this->createMock(IRequest::class), $context, $bookings);
        self::assertSame(array_merge($booking->jsonSerialize(), ['yearClosed' => true]), $controller->show(402)->getData());
    }

    public function testBookingUpdatePreservesExplicitClearsAndOmitsAbsentFields(): void {
        foreach ([['unitId' => 4, 'distributionKeyId' => null], ['unitId' => null, 'distributionKeyId' => 2], ['description' => 'Updated']] as $payload) {
            $request = $this->getMockBuilder(IRequest::class)->onlyMethods(['getHeader'])->addMethods(['getParams'])->getMock();
            $request->method('getParams')->willReturn($payload);
            $bookings = $this->createMock(BookingService::class);
            $bookings->expects($this->once())->method('updateBooking')->with(7, $payload, 'alice')->willReturn(new \OCA\Domus\Db\Booking());
            $context = $this->createMock(ManagementAccessContext::class);
            $context->method('managementUserId')->willReturn('alice');
            (new BookingController($request, $context, $bookings))->update(7, ...$payload);
        }
    }

    public function testControllerDoesNotMisreportDatabaseFailureAsMissingBooking(): void {
        $failure = new \RuntimeException('Database unavailable');
        $bookings = $this->createMock(BookingService::class);
        $bookings->method('getBookingForUser')->willThrowException($failure);
        $context = $this->createMock(ManagementAccessContext::class);
        $context->method('managementUserId')->willReturn('alice');
        $controller = new BookingController($this->createMock(IRequest::class), $context, $bookings);
        $logger = $this->createMock(LoggerInterface::class);
        $logger->expects(self::once())->method('error');
        $middleware = new ApiErrorMiddleware($this->l10n(), $logger);
        try {
            $controller->show(7);
            self::fail('Expected service exception');
        } catch (\RuntimeException $exception) {
            self::assertSame($failure, $exception);
            self::assertSame(500, $middleware->afterException($controller, 'show', $exception)->getStatus());
        }
    }

    public function testPageErrorsKeepNextcloudHandling(): void {
        $exception = new \RuntimeException('Page failure');
        $middleware = new ApiErrorMiddleware($this->l10n(), $this->createMock(LoggerInterface::class));
        $page = (new \ReflectionClass(PageController::class))->newInstanceWithoutConstructor();
        $this->expectExceptionObject($exception);
        $middleware->afterException($page, 'index', $exception);
    }

    public function testApplicationRegistersApiErrorMiddleware(): void {
        $registration = $this->createMock(IRegistrationContext::class);
        $registration->expects(self::exactly(2))->method('registerMiddleware')->withConsecutive(
            [ApiErrorMiddleware::class], [\OCA\Domus\Middleware\UnitMoveMiddleware::class],
        );
        (new Application())->register($registration);
    }

    private function l10n(): IL10N {
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnCallback(static fn(string $message) => $message);
        return $l10n;
    }
}

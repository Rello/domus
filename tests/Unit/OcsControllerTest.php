<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Accounting\StatisticCalculations;
use OCA\Domus\Controller\OcsController;
use OCA\Domus\Db\Unit;
use OCA\Domus\Exception\ResourceNotFoundException;
use OCA\Domus\Middleware\ApiErrorMiddleware;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\PermissionService;
use OCA\Domus\Service\PortfolioSettingsService;
use OCA\Domus\Service\StatisticsService;
use OCA\Domus\Service\UnitService;
use OCP\IRequest;
use OCP\IL10N;
use OCP\AppFramework\OCS\OCSException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class OcsControllerTest extends TestCase {
    private ManagementAccessContext $context;
    private UnitService $units;
    private StatisticsService $statistics;
    private PortfolioSettingsService $settings;
    private OcsController $controller;

    protected function setUp(): void {
        $this->context = $this->createMock(ManagementAccessContext::class);
        $this->units = $this->createMock(UnitService::class);
        $this->statistics = $this->createMock(StatisticsService::class);
        $this->settings = $this->createMock(PortfolioSettingsService::class);
        $permissions = $this->createMock(PermissionService::class);
        $permissions->method('getRoleFromRequest')->willReturn('landlord');
        $this->controller = new OcsController(
            $this->createMock(IRequest::class), $this->context, $this->units,
            $this->statistics, $permissions, $this->settings,
        );
    }

    public function testUnitsUseManagementScopeAndExcludePrivateFields(): void {
        $this->context->expects(self::once())->method('managementUserId')->willReturn('owner');
        $unit = new Unit();
        $unit->setId(7);
        $unit->setLabel('Apartment');
        $unit->setTotalCosts('123000.50');
        $unit->setIban('private');
        $unit->setTaxId('private');
        $unit->setNotes('private');
        $this->units->expects(self::once())->method('listUnitsForUser')
            ->with('owner', null, 'landlord')->willReturn([$unit]);
        $data = $this->controller->units()->getData();
        self::assertSame('123000.50', $data[0]['totalCosts']);
        self::assertSame(7, $data[0]['id']);
        $schema = $this->schema()['components']['schemas']['Unit'];
        self::assertSame(array_keys($schema['properties']), array_keys($data[0]));
        foreach (['iban', 'taxId', 'notes', 'partners', 'userId'] as $key) {
            self::assertArrayNotHasKey($key, $data[0]);
        }
    }

    public function testRevenueReturnsSharedTableWithoutRecalculating(): void {
        $this->context->method('managementUserId')->willReturn('owner');
        $table = ['columns' => StatisticCalculations::unitRevenue(),
            'rows' => [['year' => 2025, 'netProfit' => 123.45, 'isProvisional' => true]]];
        $this->statistics->expects(self::once())->method('unitStatsAllYears')
            ->with(7, 'owner')->willReturn(['revenue' => $table, 'cost' => ['private' => 'excluded']]);
        $this->settings->expects(self::once())->method('getValue')
            ->with('owner', 'taxRate', '0')->willReturn('0.3');
        self::assertSame(['unitId' => 7, 'taxRate' => 0.3] + $table, $this->controller->revenue(7)->getData());
    }

    public function testEmptyRevenueAndInvalidTaxSettingPreserveServiceDefaults(): void {
        $this->context->method('managementUserId')->willReturn('owner');
        $this->statistics->method('unitStatsAllYears')->willReturn([
            'revenue' => ['columns' => [], 'rows' => []],
        ]);
        $this->settings->method('getValue')->willReturn('invalid');
        $data = $this->controller->revenue(7)->getData();
        self::assertSame([], $data['rows']);
        self::assertSame(0.0, $data['taxRate']);
    }

    public function testManagementDenialStopsListing(): void {
        $this->context->method('managementUserId')->willThrowException(new \DomainException('Denied'));
        $this->units->expects(self::never())->method('listUnitsForUser');
        $this->expectException(\DomainException::class);
        $this->controller->units();
    }

    public function testUnavailableUnitFailureIsNotSwallowed(): void {
        $this->context->method('managementUserId')->willReturn('owner');
        $this->statistics->expects(self::once())->method('unitStatsAllYears')
            ->with(99, 'owner')->willThrowException(new ResourceNotFoundException('Unavailable'));
        $this->settings->expects(self::never())->method('getValue');
        $this->expectException(ResourceNotFoundException::class);
        $this->controller->revenue(99);
    }

    public function testOpenApiMatchesRoutesAndSharedRevenueColumns(): void {
        $schema = $this->schema();
        $routes = require dirname(__DIR__, 2) . '/appinfo/routes.php';
        self::assertCount(2, $routes['ocs']);
        foreach ($routes['ocs'] as $route) {
            self::assertArrayHasKey(strtolower($route['verb']), $schema['paths'][$route['url']]);
        }
        $expected = array_column(StatisticCalculations::unitRevenue(), 'key');
        $expected[] = 'isProvisional';
        self::assertSame($expected, array_keys($schema['components']['schemas']['RevenueRow']['properties']));
    }

    public function testMissingUnitIsConvertedToAnOcsError(): void {
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        $middleware = new ApiErrorMiddleware($l10n, $this->createMock(LoggerInterface::class));
        $this->expectException(OCSException::class);
        $this->expectExceptionCode(404);
        $this->expectExceptionMessage('Resource not found.');
        $middleware->afterException($this->controller, 'revenue', new ResourceNotFoundException('private'));
    }

    private function schema(): array {
        return json_decode(file_get_contents(dirname(__DIR__, 2) . '/openapi.json'), true, 512, JSON_THROW_ON_ERROR);
    }
}

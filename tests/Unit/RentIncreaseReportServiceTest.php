<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{Tenancy, Unit, Partner};
use OCA\Domus\Service\RentIncreaseReportService;
use PHPUnit\Framework\TestCase;

class RentIncreaseReportServiceTest extends TestCase {
    private function fixture(): array {
        $deps = [];
        foreach ((new \ReflectionClass(RentIncreaseReportService::class))->getConstructor()->getParameters() as $parameter) {
            $deps[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $deps['l10n']->method('t')->willReturnArgument(0);
        $tenancy = new Tenancy(); $tenancy->setId(7); $tenancy->setUnitId(8); $tenancy->setStatus('active');
        $tenancy->setServiceCharge('100'); $tenancy->setBaseRent('800'); $tenancy->setStartDate('2024-01-02');
        $partner = new Partner(); $partner->setName('Anna & Max'); $partner->setStreet('Recipient 2');
        $tenancy->setPartners([$partner]);
        $unit = new Unit(); $unit->setId(8); $unit->setLivingArea('80'); $unit->setStreet('Unit 1'); $unit->setZip('12345'); $unit->setCity('City');
        $deps['tenancies']->method('getTenancyForUser')->with(7, 'alice')->willReturn($tenancy);
        $deps['units']->method('findForUser')->with(8, 'alice')->willReturn($unit);
        $deps['statistics']->method('unitStatsAllYears')->with(8, 'alice')->willReturn(['cost' => ['rows' => [['year' => (int)date('Y') - 1, 'allocableCosts' => 1400]]]]);
        $calculation = ['index' => 10, 'adjustment' => 10, 'spread' => 23, 'limit' => 20, 'price' => 12, 'serviceCharge' => 150, 'currentBaseRent' => 800, 'livingArea' => 80];
        return [new RentIncreaseReportService(...array_values($deps)), $deps, $tenancy, $calculation];
    }

    public function testGeneratesScopedDocumentWithEveryRentTemplateVariable(): void {
        [$service, $deps, , $calculation] = $this->fixture();
        $deps['templates']->expects(self::once())->method('render')->with('alice', self::callback(function ($values) {
            self::assertCount(27, $values);
            self::assertSame('Anna & Max', $values['recipientName']);
            self::assertSame('Recipient 2', $values['recipientStreet']);
            self::assertSame('Unit 1', $values['unitStreet']);
            self::assertSame('02.01.2024', $values['lastRentAdjustmentDate']);
            self::assertSame('02.01.2024', $values['tenancyStartDate']);
            self::assertSame('8,47', $values['rentIndexLower']);
            self::assertSame('23', $values['rentIndexSpread']);
            self::assertSame('13,53', $values['rentIndexUpper']);
            self::assertSame('960,00', $values['newBaseRent']);
            self::assertSame('12,00', $values['newBaseRentPerSquareMeter']);
            self::assertSame('20,00', $values['increasePercent']);
            self::assertSame('100,00', $values['currentServiceCharge']);
            self::assertSame('116,67', $values['actualServiceCharge']);
            self::assertSame('150,00', $values['newServiceCharge']);
            self::assertSame('1.110,00', $values['newTotalRent']);
            self::assertSame('01.02.2027', $values['consentDeadline']);
            self::assertSame('01.02.2027', $values['effectiveDate']);
            return true;
        }), 'rentIncrease')->willReturn('docx');
        $deps['documents']->expects(self::once())->method('createContentForTargets')->with('alice', [
            ['entityType' => 'unit', 'entityId' => 8], ['entityType' => 'tenancy', 'entityId' => 7],
        ], 'Mieterhoehung_7_2026-11-01.docx', 'docx', 2026, 'Rent increase letter', null, 'Rent increase letter')->willReturn(['links' => ['created']]);
        self::assertSame(['created'], $service->createReport('alice', 7, $calculation, '2026-11-01', '2027-02-01', '2027-02-01', 2025));
    }

    /** @dataProvider invalidCalculations */
    public function testInvalidOrStaleCalculationDoesNotCreateFiles(array $change): void {
        [$service, $deps, , $calculation] = $this->fixture();
        $deps['documents']->expects(self::never())->method('createContentForTargets');
        $deps['templates']->expects(self::never())->method('render');
        $this->expectException(\InvalidArgumentException::class);
        $service->createReport('alice', 7, array_replace($calculation, $change), '2026-11-01', '2027-02-01', '2027-02-01', 2025);
    }
    public static function invalidCalculations(): array {
        return [[['price' => 12.01]], [['price' => 9]], [['price' => 'NaN']], [['serviceCharge' => -1]],
            [['livingArea' => 81]], [['currentBaseRent' => 799]], [['spread' => 101]], [['adjustment' => -100]], [['limit' => 0]]];
    }
    public function testHistoricalTenancyIsRejected(): void {
        [$service, $deps, $tenancy, $calculation] = $this->fixture();
        $tenancy->setStatus('historical');
        $deps['documents']->expects(self::never())->method('createContentForTargets');
        $this->expectException(\InvalidArgumentException::class);
        $service->createReport('alice', 7, $calculation, '2026-11-01', '2027-02-01', '2027-02-01', 2025);
    }
    public function testInvalidDatesAreRejected(): void {
        [$service, $deps, , $calculation] = $this->fixture();
        $deps['documents']->expects(self::never())->method('createContentForTargets');
        $this->expectException(\InvalidArgumentException::class);
        $service->createReport('alice', 7, $calculation, '2026-11-01', '2027-02-30', '2027-03-01', 2025);
    }
    public function testMissingTemplateNeverFallsBackToAnotherFormat(): void {
        [$service, $deps, , $calculation] = $this->fixture();
        $deps['templates']->method('render')->willThrowException(new \InvalidArgumentException('Missing template'));
        $deps['documents']->expects(self::never())->method('createContentForTargets');
        $this->expectException(\InvalidArgumentException::class);
        $service->createReport('alice', 7, $calculation, '2026-11-01', '2027-02-01', '2027-02-01', 2025);
    }
}

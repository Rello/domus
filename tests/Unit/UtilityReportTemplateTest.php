<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{Partner, Tenancy, Unit};
use OCA\Domus\Service\ServiceChargeSettlementService;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class UtilityReportTemplateTest extends TestCase {
    /** @dataProvider formats */
    public function testFormatsUseSameSettlementAndDocxRemainsManagementDraft(string $format): void {
        $deps = [];
        foreach ((new \ReflectionClass(ServiceChargeSettlementService::class))->getConstructor()->getParameters() as $p) {
            $deps[$p->getName()] = $this->createMock($p->getType()->getName());
        }
        $deps['l10n'] = $this->getMockBuilder(IL10N::class)->onlyMethods(['t'])->addMethods(['getLanguageCode'])->getMock();
        $deps['l10n']->method('getLanguageCode')->willReturn('de');
        $deps['l10n']->method('t')->willReturnCallback(static fn($message, $args = []) => vsprintf($message, $args));
        $unit = new Unit(); $unit->setId(7); $unit->setLabel('Flat'); $unit->setStreet('Main Street 1'); $unit->setIban('DE02120300000000202051');
        $partner = new Partner(); $partner->setId(8); $partner->setName('Tenant'); $partner->setStreet('Other Street');
        $tenancy = new Tenancy(); $tenancy->setId(9); $tenancy->setStartDate('2025-01-01'); $tenancy->setPartnerIds([8]); $tenancy->setServiceCharge('100');
        $deps['unitMapper']->method('findForUser')->with(7, 'alice')->willReturn($unit);
        $deps['partnerMapper']->method('findForUser')->with(8, 'alice')->willReturn($partner);
        $deps['tenancyService']->method('listTenancies')->willReturn([$tenancy]);
        $deps['bookingMapper']->method('findByUser')->willReturn([]);
        if ($format === 'docx') {
            $deps['documentTemplates']->expects(self::once())->method('render')->with('alice', self::callback(static function ($values) {
                self::assertCount(15, $values);
                self::assertSame('DE02120300000000202051', $values['Iban']);
                self::assertSame('Main Street 1', $values['unitStreet']);
                self::assertSame('Other Street', $values['recipientStreet']);
                self::assertSame('2025', $values['reportYear']);
                self::assertSame('Credit', $values['balanceLabel']);
                self::assertTrue($values['ifCredit']);
                self::assertFalse($values['ifPaymentDue']);
                self::assertStringContainsString('1.200,00', $values['balanceAmount']);
                return true;
            }))->willReturn('DOCX bytes');
        } else {
            $deps['documentTemplates']->expects(self::never())->method('render');
        }
        $deps['documentService']->expects(self::once())->method('createContentForTargets')->with(
            'alice', self::callback(static function ($targets) use ($format) {
                self::assertSame($format === 'md' ? ['unit', 'partner', 'tenancy'] : ['unit', 'partner'], array_column($targets, 'entityType'));
                return true;
            }), 'Flat_Tenant_2025.' . $format,
            self::callback(static fn($content) => $format === 'docx' ? $content === 'DOCX bytes' : str_contains($content, '# Utility Bill Statement 2025')),
            2025, 'Utility Bill Statement 2025', null, 'Utility Bill Statement'
        )->willReturn(['links' => [], 'filePath' => '/alice/files/statement.' . $format]);
        $result = (new ServiceChargeSettlementService(...array_values($deps)))->createReport('alice', 7, 2025, 8, $format);
        self::assertSame('/statement.' . $format, $result['reportPath']);
    }
    public static function formats(): array { return [['docx'], ['md']]; }
}

<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;
use OCA\Domus\Service\{AiDocumentValidationService, BookingAssignmentPdfParser, ManagementAccessContext, PortfolioSettingsService};
use OCP\App\IAppManager;
use OCP\TaskProcessing\IManager;
use PHPUnit\Framework\TestCase;
class AiDocumentValidationServiceTest extends TestCase {
    public function testDependenciesAndPreferenceAreIndependent(): void {
        $apps=$this->createMock(IAppManager::class);
        $apps->method('isEnabledForUser')->willReturn(true);
        $access=$this->createMock(ManagementAccessContext::class);
        $access->method('actorUserId')->willReturn('actor');
        $access->method('managementUserId')->willReturn('owner');
        $settings=$this->createMock(PortfolioSettingsService::class);
        $settings->expects(self::once())->method('getValue')->with('owner','aiDocumentValidation','0')->willReturn('0');
        $manager=$this->createMock(IManager::class);
        $manager->method('getAvailableTaskTypeIds')->with(false,'actor')->willReturn(['core:text2text:chat']);
        $parser=$this->createMock(BookingAssignmentPdfParser::class);
        $parser->method('isAvailable')->willReturn(true);
        $service=new class($apps,$access,$settings,$parser) extends AiDocumentValidationService {
            public IManager $testManager;
            protected function manager(): IManager { return $this->testManager; }
        };
        $service->testManager=$manager;
        self::assertSame(['assistant'=>true,'pdfParser'=>true,'taskProcessing'=>true,'chatProvider'=>true,'available'=>true,'enabled'=>false],$service->status());
    }

    public function testMissingPdfParserMakesValidationUnavailable(): void {
        $apps=$this->createMock(IAppManager::class);
        $apps->method('isEnabledForUser')->willReturn(true);
        $access=$this->createMock(ManagementAccessContext::class);
        $access->method('actorUserId')->willReturn('actor');
        $access->method('managementUserId')->willReturn('owner');
        $settings=$this->createMock(PortfolioSettingsService::class);
        $settings->method('getValue')->willReturn('1');
        $manager=$this->createMock(IManager::class);
        $manager->method('getAvailableTaskTypeIds')->willReturn(['core:text2text:chat']);
        $parser=$this->createMock(BookingAssignmentPdfParser::class);
        $parser->method('isAvailable')->willReturn(false);
        $service=new class($apps,$access,$settings,$parser) extends AiDocumentValidationService {
            public IManager $testManager;
            protected function manager(): IManager { return $this->testManager; }
        };
        $service->testManager=$manager;
        $status=$service->status();
        self::assertTrue($status['assistant']);
        self::assertFalse($status['pdfParser']);
        self::assertFalse($status['available']);
        self::assertTrue($status['enabled']);
    }
}

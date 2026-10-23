<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;
use OCA\Domus\Service\{AiDocumentValidationService, ManagementAccessContext, PortfolioSettingsService};
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
        $service=new class($apps,$access,$settings) extends AiDocumentValidationService {
            public IManager $testManager;
            protected function manager(): IManager { return $this->testManager; }
        };
        $service->testManager=$manager;
        self::assertSame(['assistant'=>true,'taskProcessing'=>true,'chatProvider'=>true,'available'=>true,'enabled'=>false],$service->status());
    }
}

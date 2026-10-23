<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\{BookingAssignmentPreviewService, BookingAssignmentPdfParser, BookingAssignmentResult, ManagementAccessContext};
use OCA\Domus\Db\{Unit, UnitMapper};
use OCA\Domus\Exception\BookingAssignmentException;
use OCP\TaskProcessing\{Task, IManager};
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class BookingAssignmentPreviewServiceTest extends TestCase {
    private function fixture(bool $enabled = true): array {
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('actorUserId')->willReturn('alice');
        $access->method('managementUserId')->willReturn('alice');
        $units = $this->createMock(UnitMapper::class);
        $parser = $this->createMock(BookingAssignmentPdfParser::class);
        $l10n = $this->createMock(IL10N::class); $l10n->method('t')->willReturnArgument(0);
        $manager = $this->createMock(IManager::class);
        $ai = $this->createMock(\OCA\Domus\Service\AiDocumentValidationService::class);
        $ai->method('status')->willReturn(['available'=>true,'enabled'=>$enabled]);
        $service = new class($access, $units, $parser, new BookingAssignmentResult(), $l10n, $this->createMock(\OCP\IConfig::class), $this->createMock(\Psr\Log\LoggerInterface::class), $ai) extends BookingAssignmentPreviewService {
            public IManager $testManager;
            protected function manager(): IManager { return $this->testManager; }
        };
        $service->testManager = $manager;
        return [$service, $access, $units, $parser, $manager];
    }
    public function testDisabledSettingRejectsBeforeReadingDocumentOrScheduling(): void {
        [$service,$access,$units,$parser,$manager] = $this->fixture(false);
        $parser->expects(self::never())->method('extract');
        $manager->expects(self::never())->method('scheduleTask');
        $this->expectException(BookingAssignmentException::class);
        $this->expectExceptionMessage('AI document validation is disabled or unavailable.');
        $service->create(0,'/statement.pdf',null);
    }

    public function testDashboardTaskNeedsNoUnitButCannotBeReadThroughUnitRoute(): void {
        [$service,$access,$units,$parser,$manager] = $this->fixture();
        $manager->method('getAvailableTaskTypeIds')->willReturn(['core:text2text:chat']);
        $parser->method('extract')->willReturn("Objekt: Teststr. 4\nEinheit DH10");
        $task = null;
        $manager->method('scheduleTask')->willReturnCallback(function(Task $value) use (&$task) {$task=$value; $task->setId(12);});
        self::assertSame(['taskId'=>12], $service->create(0,'/statement.pdf',null));
        $manager->method('getUserTask')->willReturnCallback(function() use (&$task) {return $task;});
        self::assertSame('processing', $service->show(0,12)['status']);
        $units->method('findForUser')->willReturn(new Unit());
        $this->expectException(\DomainException::class);
        $service->show(7,12);
    }

    public function testSchedulingBindsActorUnitAndScopeAndCancellationUsesCore(): void {
        [$service,$access,$units,$parser,$manager] = $this->fixture();
        $units->method('findForUser')->with(7,'alice')->willReturn(new Unit());
        $access->method('activeTeamId')->willReturn('team-a');
        $manager->method('getAvailableTaskTypeIds')->with(false,'alice')->willReturn(['core:text2text:chat']);
        $parser->expects(self::once())->method('extract')->with('alice','/statement.pdf',null)->willReturn('actual text');
        $task = null;
        $manager->expects(self::once())->method('scheduleTask')->willReturnCallback(function(Task $value) use (&$task) {$task=$value; $task->setId(12);});
        self::assertSame(['taskId'=>12], $service->create(7,'/statement.pdf',null));
        self::assertSame('alice',$task->getUserId());
        self::assertSame('actual text',$task->getInput()['input']);
        $manager->method('getUserTask')->with(12,'alice')->willReturn($task);
        self::assertSame(['status'=>'processing','phase'=>'queued','progress'=>null],$service->show(7,12));
        $task->setStatus(Task::STATUS_RUNNING);
        $task->setProgress(0.35);
        self::assertSame(['status'=>'processing','phase'=>'running','progress'=>0.35],$service->show(7,12));
        $task->setStatus(Task::STATUS_SUCCESSFUL);
        try {
            $service->show(7,12);
            self::fail('Empty output accepted');
        } catch (BookingAssignmentException $e) {
            self::assertSame('The AI provider returned an empty answer. Test again or check the AI provider logs.', $e->getMessage());
        }
        $task->setStatus(Task::STATUS_RUNNING);
        $manager->expects(self::once())->method('cancelTask')->with(12);
        $manager->expects(self::once())->method('deleteTask')->with($task);
        $service->discard(7,12);
    }
    public function testForeignUnitDeniedBeforeParsing(): void {
        [$service,$access,$units,$parser,$manager]=$this->fixture();
        $units->method('findForUser')->willReturn(null);
        $parser->expects(self::never())->method('extract');
        $manager->expects(self::never())->method('scheduleTask');
        $this->expectException(\DomainException::class);
        $service->create(7,'/private.pdf',null);
    }
    public function testUnavailableProviderDoesNotParseOrSchedule(): void {
        [$service,$access,$units,$parser,$manager]=$this->fixture();
        $units->method('findForUser')->willReturn(new Unit());
        $manager->method('getAvailableTaskTypeIds')->willReturn([]);
        $parser->expects(self::never())->method('extract');
        $manager->expects(self::never())->method('scheduleTask');
        $this->expectException(BookingAssignmentException::class);
        $service->create(7,'/statement.pdf',null);
    }
    public function testInaccessibleFileDoesNotSchedule(): void {
        [$service,$access,$units,$parser,$manager]=$this->fixture();
        $units->method('findForUser')->willReturn(new Unit());
        $manager->method('getAvailableTaskTypeIds')->willReturn(['core:text2text:chat']);
        $parser->method('extract')->willThrowException(new \OCP\Files\NotFoundException());
        $manager->expects(self::never())->method('scheduleTask');
        $this->expectException(\OCP\Files\NotFoundException::class);
        $service->create(7,'/private.pdf',null);
    }
    public function testForeignTaskCannotBeReadOrDeleted(): void {
        [$service,$access,$units,$parser,$manager]=$this->fixture();
        $units->method('findForUser')->willReturn(new Unit());
        $manager->expects(self::never())->method('cancelTask');
        $manager->expects(self::never())->method('deleteTask');
        $manager->method('getUserTask')->willReturn(new Task('core:text2text:chat',[],'domus','alice','booking-preview:other-scope'));
        foreach (['show','discard'] as $operation) {
            try { $service->$operation(7,12); self::fail('Foreign task accepted'); }
            catch (\DomainException $e) { self::assertSame('Preview task is not accessible.',$e->getMessage()); }
        }
    }
}

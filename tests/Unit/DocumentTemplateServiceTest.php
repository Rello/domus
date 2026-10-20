<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\{DocumentTemplateService, DocxTemplateProcessor, ManagementAccessContext, PortfolioSettingsService};
use OCP\Files\{File, Folder, IRootFolder};
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class DocumentTemplateServiceTest extends TestCase {
    private function setupService(array $files, string $assignment = '42', bool $invalid = false): array {
        $settings = $this->createMock(PortfolioSettingsService::class);
        $settings->method('getValue')->willReturn($assignment);
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('actorUserId')->willReturn('alice');
        $folder = $this->createMock(Folder::class);
        $folder->method('getById')->with(42)->willReturn($files);
        if ($files) $folder->method('get')->willReturn($files[0]);
        $root = $this->createMock(IRootFolder::class);
        $root->expects(self::never())->method('getById');
        $root->method('getUserFolder')->with('alice')->willReturn($folder);
        $processor = $this->createMock(DocxTemplateProcessor::class);
        if ($invalid) $processor->method('render')->willThrowException(new \InvalidArgumentException('Unknown variable'));
        else $processor->method('render')->willReturn('generated docx');
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        return [new DocumentTemplateService($settings, $root, $access, $processor, $l10n), $settings];
    }
    public function testUnassignedTemplateHasExplicitStatus(): void {
        [$service] = $this->setupService([], '0');
        self::assertFalse($service->status('alice')['ready']);
        $this->expectException(\InvalidArgumentException::class);
        $service->render('alice', []);
    }
    public function testAssignmentStoresFileIdAndResolveUsesActorMount(): void {
        [$service, $settings] = $this->setupService([new File(42, 'renamed.docx')]);
        $settings->expects(self::once())->method('setValue')->with('alice', 'utilityReportTemplate', '42');
        $service->assign('alice', '/DomusApp/Templates/template.docx');
        self::assertTrue($service->status('alice')['ready']);
        self::assertSame('renamed.docx', $service->status('alice')['name']);
        self::assertSame('generated docx', $service->render('alice', []));
    }
    public function testInaccessibleFileDoesNotFallBackToRootLookup(): void {
        [$service] = $this->setupService([]);
        self::assertFalse($service->status('alice')['ready']);
        $this->expectException(\InvalidArgumentException::class);
        $service->render('alice', []);
    }
    public function testUnreadableMountIsRejected(): void {
        $file = $this->createMock(File::class);
        $file->method('isReadable')->willReturn(false);
        [$service] = $this->setupService([$file]);
        self::assertFalse($service->status('alice')['ready']);
    }
    public function testInvalidTemplateKeepsItsFilenameInTheSettingsRow(): void {
        [$service] = $this->setupService([new File(42, 'Invalid.docx')], '42', true);
        $status = $service->status('alice');
        self::assertFalse($status['ready']);
        self::assertSame('Invalid.docx', $status['name']);
        self::assertSame('Unknown variable', $status['error']);
    }

    /** @dataProvider storageFailures */
    public function testStorageFailureReturnsUnavailableStatusAndAllowsRemoval(string $exceptionClass): void {
        $file = $this->createMock(File::class);
        $file->method('isReadable')->willReturn(true);
        $file->method('getName')->willReturn('Statement.docx');
        $file->method('getSize')->willReturn(100);
        $file->method('getContent')->willThrowException(new $exceptionClass('/private/storage/path'));
        [$service, $settings] = $this->setupService([$file]);
        self::assertSame([
            'fileId' => 42, 'name' => 'Statement.docx', 'ready' => false,
            'error' => 'The assigned template is missing or inaccessible.',
        ], $service->status('alice'));
        $settings->expects(self::once())->method('setValue')->with('alice', 'utilityReportTemplate', '0');
        $service->assign('alice', '');
    }

    public static function storageFailures(): array {
        return [
            [\OCP\Files\NotFoundException::class],
            [\OCP\Files\NotPermittedException::class],
            [\OCP\Files\GenericFileException::class],
            [\OCP\Lock\LockedException::class],
        ];
    }

    public function testClearAssignment(): void {
        [$service, $settings] = $this->setupService([]);
        $settings->expects(self::once())->method('setValue')->with('alice', 'utilityReportTemplate', '0');
        $service->assign('alice', '');
    }
}

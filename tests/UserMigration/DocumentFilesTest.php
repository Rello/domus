<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\UserMigration;

use OCA\Domus\UserMigration\DocumentFiles;
use OCP\Files\{File, Folder, IRootFolder};
use OCP\UserMigration\{IExportDestination, IImportSource, UserMigrationException};
use PHPUnit\Framework\TestCase;

class DocumentFilesTest extends TestCase {
    public function testSizeEstimateCountsSharedFilesOnlyOnceInKiB(): void {
        $file = $this->createMock(File::class);
        $file->method('getSize')->willReturn(2049);
        $folder = $this->createMock(Folder::class);
        $folder->expects(self::once())->method('getById')->with(12)->willReturn([$file]);
        $root = $this->createMock(IRootFolder::class);
        $root->method('getUserFolder')->willReturn($folder);
        self::assertEquals(3, (new DocumentFiles($root))->estimateSize('alice', [['file_id' => 12], ['file_id' => 12]]));
    }

    public function testStreamsSharedDocumentOnceAndRemapsItsId(): void {
        $contents = "PDF bytes\0\xff";
        $file = $this->createMock(File::class);
        $file->method('getName')->willReturn('contract.pdf');
        $file->expects(self::once())->method('fopen')->with('rb')->willReturnCallback(function () use ($contents) {
            $stream = fopen('php://temp', 'w+b'); fwrite($stream, $contents); rewind($stream); return $stream;
        });
        $sourceFolder = $this->createMock(Folder::class);
        $sourceFolder->expects(self::once())->method('getById')->with(12)->willReturn([$file]);
        $archive = [];
        $destination = $this->createMock(IExportDestination::class);
        $destination->expects(self::once())->method('addFileAsStream')->willReturnCallback(function ($path, $stream) use (&$archive) { $archive[$path] = stream_get_contents($stream); });
        $root = $this->createMock(IRootFolder::class);
        $targetRoot = $this->createMock(Folder::class);
        $root->method('getUserFolder')->willReturnMap([['alice', $sourceFolder], ['bob', $targetRoot]]);
        $files = new DocumentFiles($root);
        $manifest = $files->export('alice', [['file_id' => 12], ['file_id' => 12]], $destination);
        self::assertSame([12 => 'contract.pdf'], $manifest);
        $target = $this->createMock(Folder::class);
        $targetRoot->expects(self::once())->method('newFolder')->with(self::stringStartsWith('Domus import '))->willReturn($target);
        $target->expects(self::never())->method('delete');
        $documentFolder = $this->createMock(Folder::class);
        $target->expects(self::once())->method('newFolder')->with('12')->willReturn($documentFolder);
        $documentFolder->expects(self::once())->method('newFile')->with('contract.pdf', self::anything())->willReturnCallback(function ($name, $stream) use ($contents) {
            self::assertSame($contents, stream_get_contents($stream)); return new File(999, $name);
        });
        $source = $this->createMock(IImportSource::class);
        $source->method('getFileAsStream')->willReturnCallback(function ($path) use ($archive) {
            $stream = fopen('php://temp', 'w+b'); fwrite($stream, $archive[$path]); rewind($stream); return $stream;
        });
        $imported = $files->import('bob', $manifest, $source);
        self::assertSame([12 => 999], $imported['files']);
        self::assertSame($target, $imported['folder']);
    }

    public function testMissingSourceDocumentFailsExport(): void {
        $folder = $this->createMock(Folder::class);
        $folder->method('getById')->willReturn([]);
        $root = $this->createMock(IRootFolder::class);
        $root->method('getUserFolder')->willReturn($folder);
        $this->expectException(UserMigrationException::class);
        (new DocumentFiles($root))->export('alice', [['file_id' => 12]], $this->createMock(IExportDestination::class));
    }

    /** @dataProvider invalidImports */
    public function testFailedImportRemovesOnlyItsNewFolder(array $manifest): void {
        $root = $this->createMock(IRootFolder::class);
        $userFolder = $this->createMock(Folder::class);
        $createdFolder = $this->createMock(Folder::class);
        $root->method('getUserFolder')->willReturn($userFolder);
        $userFolder->method('newFolder')->willReturn($createdFolder);
        $userFolder->expects(self::never())->method('delete');
        $createdFolder->expects(self::once())->method('delete');
        $source = $this->createMock(IImportSource::class);
        $source->method('getFileAsStream')->willThrowException(new UserMigrationException('Missing archive member'));
        $this->expectException(UserMigrationException::class);
        (new DocumentFiles($root))->import('bob', $manifest, $source);
    }

    public static function invalidImports(): array {
        return [[[12 => '../outside.pdf']], [[12 => 'missing.pdf']], [['../12' => 'file.pdf']]];
    }
}

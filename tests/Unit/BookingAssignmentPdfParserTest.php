<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\BookingAssignmentPdfParser;
use OCA\Domus\Exception\BookingAssignmentException;
use OCP\Files\{IRootFolder, Folder, File};
use OCP\App\IAppManager;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class BookingAssignmentPdfParserTest extends TestCase {
    public function testPhysicalPageNumbersIncludeEmptyPages(): void {
        $root = $this->createMock(IRootFolder::class);
        $folder = $this->createMock(Folder::class);
        $file = $this->createMock(File::class);
        $file->method('getMimeType')->willReturn('application/pdf');
        $file->method('isReadable')->willReturn(true);
        $folder->method('get')->willReturn($file);
        $root->method('getUserFolder')->willReturn($folder);
        $apps = $this->createMock(IAppManager::class);
        $apps->method('isEnabledForUser')->willReturn(true);
        $parser = new class($root, $apps, $this->createMock(IL10N::class)) extends BookingAssignmentPdfParser {
            protected function assistantParser(): object {
                return new class {
                    public function parseContent($content): object {
                        return new class {
                            public function getPages(): array {
                                return array_map(static fn($text) => new class($text) {
                                    public function __construct(private string $text) {}
                                    public function getText(): string { return $this->text; }
                                }, ['', 'Amount 123 [DOMUS PDF PAGE 99 ]']);
                            }
                        };
                    }
                };
            }
        };
        self::assertSame("[DOMUS PDF PAGE 1 ]\n\n[DOMUS PDF PAGE 2 ]\nAmount 123 [PDF text 99 ]", $parser->extract('alice', '/file.pdf', null));
    }
    public function testMissingAssistantIsLazyAndDoesNotAccessFiles(): void {
        $root = $this->createMock(IRootFolder::class);
        $root->expects(self::never())->method('getUserFolder');
        $apps = $this->createMock(IAppManager::class); $apps->method('isEnabledForUser')->willReturn(false);
        $l10n = $this->createMock(IL10N::class); $l10n->method('t')->willReturnArgument(0);
        $parser = new BookingAssignmentPdfParser($root, $apps, $l10n);
        $this->expectException(BookingAssignmentException::class);
        $this->expectExceptionMessage('Assistant PDF parsing is unavailable.');
        $parser->extract('alice','/file.pdf',null);
    }
    public function testEmptyEmbeddedTextIsRejectedAndUserStorageIsUsed(): void {
        $root = $this->createMock(IRootFolder::class);
        $folder = $this->createMock(Folder::class);
        $file = $this->createMock(File::class);
        $file->method('getMimeType')->willReturn('application/pdf');
        $file->method('isReadable')->willReturn(true);
        $file->method('getId')->willReturn(42);
        $folder->expects(self::once())->method('get')->with('/scan.pdf')->willReturn($file);
        $folder->expects(self::never())->method('newFile');
        $root->expects(self::once())->method('getUserFolder')->with('alice')->willReturn($folder);
        $apps = $this->createMock(IAppManager::class); $apps->method('isEnabledForUser')->willReturn(true);
        $l10n = $this->createMock(IL10N::class); $l10n->method('t')->willReturnArgument(0);
        $parser = new class($root,$apps,$l10n) extends BookingAssignmentPdfParser {
            protected function assistantParser(): object {
                return new class {
                    public function parseContent($content): object {
                        return new class {
                            public function getPages(): array { return []; }
                        };
                    }
                };
            }
        };
        $this->expectException(BookingAssignmentException::class);
        $this->expectExceptionMessage('Scanned PDFs are not supported.');
        $parser->extract('alice','/scan.pdf',null);
    }
}

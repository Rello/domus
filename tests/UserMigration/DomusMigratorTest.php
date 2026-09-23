<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\Domus\Tests\UserMigration;

use OCA\Domus\UserMigration\DomusMigrator;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\IL10N;
use OCP\UserMigration\IImportSource;
use OCP\UserMigration\UserMigrationException;
use PHPUnit\Framework\TestCase;

class DomusMigratorTest extends TestCase {
    public function testCanImportAcceptsCurrentVersion(): void {
        $source = $this->createConfiguredMock(IImportSource::class, [
            'getMigratorVersion' => 2,
        ]);

        $this->assertTrue($this->createMigrator()->canImport($source));
    }

    public function testCanImportRejectsMissingOrNewerVersion(): void {
        $missingSource = $this->createConfiguredMock(IImportSource::class, [
            'getMigratorVersion' => null,
        ]);
        $newerSource = $this->createConfiguredMock(IImportSource::class, [
            'getMigratorVersion' => 3,
        ]);

        $this->assertFalse($this->createMigrator()->canImport($missingSource));
        $this->assertFalse($this->createMigrator()->canImport($newerSource));
    }

    public function testCanImportRejectsVersionReadFailures(): void {
        $source = $this->createMock(IImportSource::class);
        $source->method('getMigratorVersion')->willThrowException(new UserMigrationException('broken'));

        $this->assertFalse($this->createMigrator()->canImport($source));
    }

    public function testEntityIdRemappingKeepsUnknownReferencesOut(): void {
        $migrator = $this->createMigrator();
        $method = new \ReflectionMethod(DomusMigrator::class, 'remapEntityId');
        $method->setAccessible(true);

        $maps = [
            'property' => [10 => 100],
            'unit' => [20 => 200],
        ];

        $this->assertSame(100, $method->invoke($migrator, 'property', 10, $maps));
        $this->assertSame(200, $method->invoke($migrator, 'unit', '20', $maps));
        $this->assertNull($method->invoke($migrator, 'booking', 30, $maps));
        $this->assertNull($method->invoke($migrator, 'property', null, $maps));
    }

    public function testDocumentLinksUseImportedFileAndEntityIds(): void {
        $query = new class {
            public array $inserted = [];
            private array $values = [];
            public function insert($table) { return $this; }
            public function createNamedParameter($value) { return $value; }
            public function values($values) { $this->values = $values; return $this; }
            public function executeStatement() { $this->inserted[] = $this->values; }
            public function getLastInsertId() { return count($this->inserted); }
        };
        $db = $this->createMock(IDBConnection::class);
        $db->method('getQueryBuilder')->willReturn($query);
        $migrator = new DomusMigrator($db, $this->createMock(IConfig::class), $this->createMock(IL10N::class), $this->createMock(\OCA\Domus\UserMigration\DocumentFiles::class));
        $method = new \ReflectionMethod(DomusMigrator::class, 'importDocumentLinks');
        $method->setAccessible(true);
        $method->invoke($migrator, 'bob', [
            ['id' => 1, 'entity_type' => 'unit', 'entity_id' => 10, 'file_id' => 12, 'note' => 'Invoice'],
            ['id' => 2, 'entity_type' => 'booking', 'entity_id' => 20, 'file_id' => 12],
        ], ['unit' => [10 => 100], 'booking' => [20 => 200], 'file' => [12 => 999]]);
        self::assertSame([999, 999], array_column($query->inserted, 'file_id'));
        self::assertSame([100, 200], array_column($query->inserted, 'entity_id'));
        self::assertSame(['bob', 'bob'], array_column($query->inserted, 'user_id'));
        self::assertSame('Invoice', $query->inserted[0]['note']);
    }

    public function testDatabaseFailureRollsBackAndCleansImportedFiles(): void {
        $db = $this->createMock(IDBConnection::class);
        $db->expects(self::once())->method('beginTransaction');
        $db->expects(self::once())->method('rollBack');
        $db->expects(self::never())->method('commit');
        $db->method('getQueryBuilder')->willThrowException(new \RuntimeException('Database unavailable'));
        $folder = $this->createMock(\OCP\Files\Folder::class);
        $folder->expects(self::once())->method('delete');
        $files = $this->createMock(\OCA\Domus\UserMigration\DocumentFiles::class);
        $files->method('import')->willReturn(['files' => [12 => 999], 'folder' => $folder]);
        $migrator = new DomusMigrator($db, $this->createMock(IConfig::class), $this->createMock(IL10N::class), $files);
        $source = $this->createMock(IImportSource::class);
        $source->method('pathExists')->willReturn(true);
        $source->method('getFileContents')->willReturn(json_encode(['properties' => [['id' => 1]], 'documentFiles' => [12 => 'contract.pdf']]));
        $user = $this->createMock(\OCP\IUser::class);
        $user->method('getUID')->willReturn('bob');
        $this->expectException(UserMigrationException::class);
        $migrator->import($user, $source, $this->createMock(\Symfony\Component\Console\Output\OutputInterface::class));
    }

    public function testLegacyDocumentArchiveFailsBeforeWritingAnything(): void {
        $db = $this->createMock(IDBConnection::class);
        $db->expects(self::never())->method('beginTransaction');
        $files = $this->createMock(\OCA\Domus\UserMigration\DocumentFiles::class);
        $files->expects(self::never())->method('import');
        $migrator = new DomusMigrator($db, $this->createMock(IConfig::class), $this->createMock(IL10N::class), $files);
        $source = $this->createMock(IImportSource::class);
        $source->method('pathExists')->willReturn(true);
        $source->method('getFileContents')->willReturn(json_encode(['documentLinks' => [['file_id' => 12]]]));
        $user = $this->createMock(\OCP\IUser::class);
        $user->method('getUID')->willReturn('bob');
        $this->expectException(UserMigrationException::class);
        $this->expectExceptionMessage('Export it again');
        $migrator->import($user, $source, $this->createMock(\Symfony\Component\Console\Output\OutputInterface::class));
    }

    private function createMigrator(): DomusMigrator {
        return new DomusMigrator(
            $this->createMock(IDBConnection::class),
            $this->createMock(IConfig::class),
            new class implements IL10N {
                public function t(string $text, array $parameters = [], ?int $count = null): string {
                    if ($parameters !== []) {
                        return vsprintf($text, $parameters);
                    }

                    return $text;
                }
            },
            $this->createMock(\OCA\Domus\UserMigration\DocumentFiles::class),
        );
    }
}

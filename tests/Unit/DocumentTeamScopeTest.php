<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\DocumentService;
use OCA\Domus\Db\DocumentLink;
use OCA\Domus\Db\Property;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use PHPUnit\Framework\TestCase;

class DocumentTeamScopeTest extends TestCase {
    /** @dataProvider closedBookingDocumentOperations */
    public function testClosedBookingDocumentChangesAreRejectedBeforeWrites(string $operation): void {
        $dependencies = [];
        foreach ((new \ReflectionClass(DocumentService::class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $booking = new \OCA\Domus\Db\Booking();
        $booking->setId(402);
        $booking->setUnitId(34);
        $dependencies['bookingMapper']->method('findForUser')->with(402, 'actor')->willReturn($booking);
        $dependencies['bookingService']->method('assertYearOpenForBooking')->with($booking)->willThrowException(new \InvalidArgumentException('Bookings cannot be changed in a closed year.'));
        $link = new DocumentLink();
        $link->setId(7);
        $link->setFileId(42);
        $link->setEntityType($operation === 'unitUnlink' ? 'unit' : 'booking');
        $link->setEntityId($operation === 'unitUnlink' ? 34 : 402);
        $dependencies['documentLinkMapper']->method('findForUser')->willReturn($link);
        $bookingLink = clone $link;
        $bookingLink->setEntityType('booking');
        $bookingLink->setEntityId(402);
        $dependencies['documentLinkMapper']->method('findByFileId')->willReturn([$bookingLink]);
        foreach (['insert', 'update', 'delete', 'deleteByIds'] as $method) {
            $dependencies['documentLinkMapper']->expects($this->never())->method($method);
        }
        $dependencies['rootFolder']->expects($this->never())->method('getUserFolder');
        $dependencies['rootFolder']->expects($this->never())->method('getById');
        $service = new DocumentService(...array_values($dependencies));
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Bookings cannot be changed in a closed year.');
        match ($operation) {
            'upload' => $service->uploadAndLink('actor', 'booking', 402, []),
            'link' => $service->linkFile('actor', 'booking', 402, '/receipt.pdf'),
            'attach' => $service->attachToTargets('actor', [['entityType' => 'unit', 'entityId' => 34], ['entityType' => 'booking', 'entityId' => 402]], null, '/receipt.pdf'),
            'content' => $service->createContentForTargets('actor', [['entityType' => 'booking', 'entityId' => 402]], 'receipt.txt', 'receipt'),
            default => $service->unlink('actor', 7),
        };
    }

    public static function closedBookingDocumentOperations(): array {
        return array_map(static fn($operation) => [$operation], ['upload', 'link', 'attach', 'content', 'unlink', 'unitUnlink']);
    }

    public function testUnitDocumentListMarksOnlyTenancyAssignedFiles(): void {
        $dependencies = [];
        foreach ((new \ReflectionClass(DocumentService::class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $links = [];
        foreach ([42, 43, null] as $index => $fileId) {
            $link = new DocumentLink();
            $link->setId($index + 1);
            $link->setEntityType('unit');
            $link->setEntityId(1);
            $link->setFileId($fileId);
            $links[] = $link;
        }
        $dependencies['documentLinkMapper']->method('findForEntity')->with('actor', 'unit', 1)->willReturn($links);
        $dependencies['documentLinkMapper']->expects($this->once())->method('findTenancyAssignedFileIds')
            ->with('actor', [42, 43])->willReturn([42]);
        $dependencies['managementContext']->method('actorUserId')->willReturn('actor');
        $folder = $this->createMock(Folder::class);
        $folder->method('getById')->willReturn([]);
        $dependencies['rootFolder']->method('getUserFolder')->willReturn($folder);
        $result = (new DocumentService(...array_values($dependencies)))->listForEntity('actor', 'unit', 1);
        self::assertSame([true, false, false], array_map(static fn($link) => $link->jsonSerialize()['assignedToTenancy'], $result));
    }

    /** @dataProvider viewerAccess */
    public function testDocumentViewerRequiresReadableFileInActorFiles(bool $mounted, bool $readable, string $route): void {
        $dependencies = [];
        foreach ((new \ReflectionClass(DocumentService::class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $link = new DocumentLink();
        $link->setId(7);
        $link->setFileId(42);
        $link->setFileName('Invoice.pdf');
        $dependencies['documentLinkMapper']->method('findForEntity')->with('actor', 'unit', 1)->willReturn([$link]);
        $dependencies['managementContext']->method('actorUserId')->willReturn('actor');
        $file = $this->createMock(File::class);
        $file->method('isReadable')->willReturn($readable);
        $folder = $this->createMock(Folder::class);
        $folder->method('getById')->with(42)->willReturn($mounted ? [$file] : []);
        $dependencies['rootFolder']->method('getUserFolder')->with('actor')->willReturn($folder);
        $dependencies['urlGenerator']->method('linkToRouteAbsolute')->willReturnCallback(static function ($name, $params) {
            if ($name === 'files.view.showFile') {
                self::assertSame(['fileid' => 42, 'openfile' => 'true'], $params);
            }
            return $name;
        });
        $result = (new DocumentService(...array_values($dependencies)))->listForEntity('actor', 'unit', 1);
        self::assertSame($route, $result[0]->jsonSerialize()['fileUrl']);
    }

    public static function viewerAccess(): array {
        return [
            [true, true, 'files.view.showFile'],
            [false, false, 'domus.Document.content'],
            [true, false, 'domus.Document.content'],
        ];
    }

    public function testUnitUnlinkRemovesOnlyTheSameFilesUnitAndDescendantRelations(): void {
        $constructor = (new \ReflectionClass(DocumentService::class))->getConstructor();
        $dependencies = [];
        foreach ($constructor->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $makeLink = static function (int $id, string $type, int $entityId): DocumentLink {
            $link = new DocumentLink();
            $link->setId($id);
            $link->setFileId(42);
            $link->setEntityType($type);
            $link->setEntityId($entityId);
            return $link;
        };
        $unitLink = $makeLink(1, 'unit', 10);
        $links = [
            $unitLink, $makeLink(2, 'tenancy', 20), $makeLink(3, 'booking', 30),
            $makeLink(4, 'tenancy', 21), $makeLink(5, 'booking', 31),
            $makeLink(6, 'property', 40), $makeLink(7, 'partner', 50),
            $makeLink(8, 'unit', 11), $makeLink(9, 'unit', 10),
            $makeLink(10, 'tenancy', 22),
        ];
        $dependencies['documentLinkMapper']->method('findForUser')->with(1, 'actor')->willReturn($unitLink);
        $dependencies['documentLinkMapper']->method('findByFileId')->with('actor', 42)->willReturn($links);
        $dependencies['tenancyMapper']->method('findForUser')->willReturnCallback(static function ($id, $userId) {
            if ($userId !== 'actor' || $id === 22) return null;
            $tenancy = new \OCA\Domus\Db\Tenancy();
            $tenancy->setUnitId($id === 20 ? 10 : 11);
            return $tenancy;
        });
        $dependencies['bookingMapper']->method('findForUser')->willReturnCallback(static function ($id, $userId) {
            if ($userId !== 'actor') return null;
            $booking = new \OCA\Domus\Db\Booking();
            $booking->setUnitId($id === 30 ? 10 : 11);
            return $booking;
        });
        $dependencies['documentLinkMapper']->expects($this->once())->method('deleteByIds')->with('actor', [1, 2, 3, 9]);
        $dependencies['documentLinkMapper']->expects($this->never())->method('delete');
        $dependencies['rootFolder']->expects($this->never())->method('getById');
        (new DocumentService(...array_values($dependencies)))->unlink('actor', 1);
    }

    public function testUnlinkBelowUnitKeepsOtherRelations(): void {
        foreach (['tenancy', 'booking'] as $type) {
            $constructor = (new \ReflectionClass(DocumentService::class))->getConstructor();
            $dependencies = [];
            foreach ($constructor->getParameters() as $parameter) {
                $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
            }
            $link = new DocumentLink();
            $link->setId(7);
            $link->setFileId(42);
            $link->setEntityType($type);
            $link->setEntityId(20);
            $dependencies['documentLinkMapper']->method('findForUser')->with(7, 'actor')->willReturn($link);
            $dependencies['bookingMapper']->method('findForUser')->willReturn(new \OCA\Domus\Db\Booking());
            $dependencies['documentLinkMapper']->expects($this->never())->method('findByFileId');
            $dependencies['documentLinkMapper']->expects($this->never())->method('deleteByIds');
            $dependencies['documentLinkMapper']->expects($this->once())->method('delete')->with($link);
            (new DocumentService(...array_values($dependencies)))->unlink('actor', 7);
        }
    }

    public function testRepeatedAttachmentsUpdateTheExistingRelationAndClearItsNote(): void {
        $folder = new class extends Folder {
            public function nodeExists(string $path): bool { return true; }
            public function get(string $path): File { return new File(42, 'contract.pdf'); }
        };
        $constructor = (new \ReflectionClass(DocumentService::class))->getConstructor();
        $dependencies = [];
        foreach ($constructor->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $dependencies['rootFolder']->method('getUserFolder')->willReturn($folder);
        $dependencies['propertyMapper']->method('findForUser')->with(99, 'actor')->willReturn(new Property());
        $existing = new DocumentLink();
        $existing->setId(7);
        $existing->setFileId(42);
        $existing->setCreatedAt(123);
        $existing->setNote('Old note');
        $duplicate = clone $existing;
        $duplicate->setId(6);
        $otherFile = clone $existing;
        $otherFile->setId(9);
        $otherFile->setFileId(43);
        $dependencies['rootFolder']->method('getById')->with(42)->willReturn([new File(42, 'contract.pdf')]);
        $dependencies['documentLinkMapper']->method('findForUser')->with(7, 'actor')->willReturn($existing);
        $dependencies['documentLinkMapper']->method('findForEntity')->with('actor', 'property', 99)->willReturn([$otherFile, $duplicate, $existing]);
        $dependencies['documentLinkMapper']->expects($this->never())->method('insert');
        $dependencies['documentLinkMapper']->expects($this->exactly(3))->method('update')->with($existing)->willReturn($existing);
        $service = new DocumentService(...array_values($dependencies));

        foreach (['Changed note', '', null] as $note) {
            $links = $service->attachToTargets('actor', [['entityType' => 'property', 'entityId' => 99]], null, null, null, 'Contract', $note, null, 7, '2025-06-15');
            $this->assertCount(1, $links);
            $this->assertSame(7, $links[0]->getId());
            $this->assertSame(123, $links[0]->getCreatedAt());
            $this->assertSame('2025-06-15', $links[0]->getDocumentDate());
            $this->assertSame($note ?: null, $links[0]->getNote());
            $this->assertSame('Old note', $duplicate->getNote());
            $this->assertSame('Old note', $otherFile->getNote());
        }
    }

    public function testLinkRejectsForeignTargetBeforeCreatingDocumentRow(): void {
        $folder = new class extends Folder {
            public function nodeExists(string $path): bool { return true; }
            public function get(string $path): File { return new File(42, 'contract.pdf'); }
        };
        $root = $this->createMock(IRootFolder::class);
        $root->method('getUserFolder')->willReturn($folder);
        $constructor = (new \ReflectionClass(DocumentService::class))->getConstructor();
        $dependencies = [];
        foreach ($constructor->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $dependencies['rootFolder'] = $root;
        $dependencies['propertyMapper']->method('findForUser')->with(99, 'actor')->willReturn(null);
        $dependencies['documentLinkMapper']->expects($this->never())->method('insert');

        $service = new DocumentService(...array_values($dependencies));
        $this->expectException(\DomainException::class);
        $service->linkFile('actor', 'property', 99, 'contract.pdf');
    }
}

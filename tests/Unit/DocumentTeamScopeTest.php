<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\DocumentService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use PHPUnit\Framework\TestCase;

class DocumentTeamScopeTest extends TestCase {
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

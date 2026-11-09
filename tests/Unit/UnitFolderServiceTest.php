<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\Unit;
use OCA\Domus\Exception\ConflictException;
use OCA\Domus\Service\{ManagementAccessContext, TeamIntegrationService, UnitFolderService};
use OCP\Files\{Folder, IRootFolder};
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class UnitFolderServiceTest extends TestCase {
    /** @dataProvider teamScopes */
    public function testNewUnitFolderUsesSelectedScope(?string $teamId): void {
        $root = $this->createMock(IRootFolder::class);
        $context = $this->createMock(ManagementAccessContext::class);
        $context->method('activeTeamId')->willReturn($teamId);
        $teams = $this->createMock(TeamIntegrationService::class);
        $l10n = $this->createMock(IL10N::class);
        $unit = new Unit();
        $unit->setDocumentPath('DomusApp/Building/Apartment');
        if ($teamId === null) {
            $root->expects(self::never())->method('getUserFolder');
            $teams->expects(self::never())->method('getTeamFolder');
        } else {
            $teams->expects(self::once())->method('getTeamFolder')->with('team-a')->willReturn(['mountPoint' => 'Team files']);
            $user = $this->getMockBuilder(Folder::class)->onlyMethods(['get', 'newFolder'])->addMethods(['isReadable', 'isCreatable', 'nodeExists', 'getId', 'getPath', 'getRelativePath'])->getMock();
            $team = $this->getMockBuilder(Folder::class)->onlyMethods(['get', 'newFolder'])->addMethods(['isReadable', 'isCreatable', 'nodeExists', 'getId', 'getPath', 'getRelativePath'])->getMock();
            $app = $this->getMockBuilder(Folder::class)->onlyMethods(['get', 'newFolder'])->addMethods(['isReadable', 'isCreatable', 'nodeExists', 'getId', 'getPath', 'getRelativePath'])->getMock();
            $building = $this->getMockBuilder(Folder::class)->onlyMethods(['get', 'newFolder'])->addMethods(['isReadable', 'isCreatable', 'nodeExists', 'getId', 'getPath', 'getRelativePath'])->getMock();
            $destination = $this->getMockBuilder(Folder::class)->onlyMethods(['get', 'newFolder'])->addMethods(['isReadable', 'isCreatable', 'nodeExists', 'getId', 'getPath', 'getRelativePath'])->getMock();
            $root->method('getUserFolder')->with('alice')->willReturn($user);
            $user->expects(self::once())->method('get')->with('Team files')->willReturn($team);
            foreach ([$team, $app, $building] as $folder) {
                $folder->method('isReadable')->willReturn(true);
                $folder->method('isCreatable')->willReturn(true);
            }
            $team->method('nodeExists')->with('DomusApp')->willReturn(true);
            $team->method('get')->with('DomusApp')->willReturn($app);
            $app->method('nodeExists')->with('Building')->willReturn(false);
            $app->expects(self::once())->method('newFolder')->with('Building')->willReturn($building);
            $building->method('nodeExists')->willReturnCallback(fn($name) => $name === 'Apartment');
            $building->expects(self::once())->method('newFolder')->with('Apartment (2)')->willReturn($destination);
            $destination->method('getId')->willReturn(42);
            $destination->method('getPath')->willReturn('/alice/files/Team files/DomusApp/Building/Apartment (2)');
            $user->method('getRelativePath')->willReturn('Team files/DomusApp/Building/Apartment (2)');
        }
        (new UnitFolderService($root, $l10n, $context, $teams))->initialize($unit, 'alice');
        self::assertSame($teamId === null ? 'DomusApp/Building/Apartment' : 'Team files/DomusApp/Building/Apartment (2)', $unit->getDocumentPath());
        self::assertSame($teamId === null ? null : 42, $unit->getDocumentFolderId());
    }

    public static function teamScopes(): array {
        return [[null], ['team-a']];
    }

    public function testMissingTeamFolderCannotFallBackToPersonalFiles(): void {
        $root = $this->createMock(IRootFolder::class);
        $root->expects(self::never())->method('getUserFolder');
        $context = $this->createMock(ManagementAccessContext::class);
        $context->method('activeTeamId')->willReturn('team-a');
        $teams = $this->createMock(TeamIntegrationService::class);
        $teams->method('getTeamFolder')->willReturn(null);
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        $this->expectException(ConflictException::class);
        (new UnitFolderService($root, $l10n, $context, $teams))->initialize(new Unit(), 'alice');
    }
}

<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\TaskTemplate;
use OCA\Domus\Db\TaskTemplateMapper;
use OCA\Domus\Db\TaskTemplateStepMapper;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\TaskTemplateService;
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class TaskTemplateMapperTest extends TestCase {
    private function mapper(?string $teamId, array $results = []): TaskTemplateMapper {
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('activeTeamId')->willReturn($teamId);
        $access->method('legacyOwnerUserId')->willReturn('owner');
        $mapper = $this->getMockBuilder(TaskTemplateMapper::class)
            ->setConstructorArgs([new TransferDatabase(), $access])
            ->onlyMethods(['findEntities', 'findEntity'])
            ->getMock();
        // Nextcloud's singular lookup throws for zero rows; nullable lookups must avoid it.
        $mapper->expects(self::never())->method('findEntity');
        $mapper->method('findEntities')->willReturn($results);
        return $mapper;
    }

    public function testMissingTemplateLookupsReturnNull(): void {
        $mapper = $this->mapper(null);
        self::assertNull($mapper->findByKey('new-template'));
        self::assertNull($mapper->findById(999));
    }

    public function testExistingTemplateLookupsReturnTheTemplate(): void {
        $template = new TaskTemplate();
        $template->setId(7);
        $mapper = $this->mapper(null, [$template]);
        self::assertSame($template, $mapper->findByKey('existing'));
        self::assertSame($template, $mapper->findById(7));
    }

    /** @dataProvider contexts */
    public function testCreateAndUpdateTemplateInSelectedContext(?string $teamId): void {
        $mapper = $this->mapper($teamId);
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        $service = new TaskTemplateService(
            $mapper, $this->createMock(TaskTemplateStepMapper::class), new TransferDatabase(), $l10n,
        );
        $template = $service->createTemplate(['key' => 'new-template', 'name' => 'New template', 'isActive' => true]);
        self::assertSame('new-template', $template->getKey());
        self::assertSame($teamId, $template->getTeamId());
        if ($teamId !== null) {
            self::assertSame('team:' . $teamId, $template->getScopeKey());
        }
        self::assertSame($template, $mapper->update($template));
    }

    public static function contexts(): array {
        return [[null], ['team-a']];
    }

    public function testPersonalContextCannotUpdateTeamTemplate(): void {
        $template = new TaskTemplate();
        $template->setTeamId('team-a');
        $this->expectException(\DomainException::class);
        $this->mapper(null)->update($template);
    }

    public function testTeamContextCannotUpdateAnotherTeamsTemplate(): void {
        $template = new TaskTemplate();
        $template->setTeamId('team-b');
        $this->expectException(\DomainException::class);
        $this->mapper('team-a')->update($template);
    }
}

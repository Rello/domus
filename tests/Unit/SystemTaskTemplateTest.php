<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{TaskTemplate, TaskTemplateMapper, TaskTemplateStep, TaskTemplateStepMapper};
use OCA\Domus\Service\{ManagementAccessContext, TaskTemplateService};
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\AppFramework\Db\Entity;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

/** Exercise real scope queries with persistence underneath the lightweight OCP stubs. */
trait TemplateTestStorage {
    protected function findEntities(mixed $query): array {
        return array_map(function ($row) {
            $class = $this->getEntityClass();
            $entity = new $class();
            foreach ($row as $column => $value) $entity->{'set' . str_replace(' ', '', ucwords(str_replace('_', ' ', $column)))}($value);
            return $entity;
        }, $query->executeQuery()->fetchAll());
    }
    public function insert(Entity $entity): Entity {
        parent::insert($entity);
        $reflection = new \ReflectionObject($entity);
        $values = [];
        foreach ($reflection->getProperties(\ReflectionProperty::IS_PROTECTED) as $property) {
            $name = $property->getName();
            if (in_array($name, ['id', 'stepsCount', 'scope'], true)) continue;
            $column = strtolower(preg_replace('/[A-Z]/', '_$0', $name));
            $values[$column] = $entity->{'get' . ucfirst($name)}();
        }
        $qb = $this->db->getQueryBuilder();
        $qb->insert($this->getTableName())->values($values)->executeStatement();
        $entity->setId($qb->getLastInsertId());
        return $entity;
    }
}
class StoredTemplateMapper extends TaskTemplateMapper { use TemplateTestStorage; }
class StoredTemplateStepMapper extends TaskTemplateStepMapper { use TemplateTestStorage; }

class SystemTaskTemplateTest extends TestCase {
    private TransferDatabase $db;
    protected function setUp(): void {
        $this->db = new TransferDatabase();
        $this->db->tables['domus_task_templates'] = [
            ['id' => 1, 'scope_key' => 'system', 'team_id' => null, 'key' => 'year_end', 'name' => 'Year End', 'description' => 'Default', 'applies_to' => 'unit', 'is_active' => 1, 'system_template_id' => null],
            ['id' => 2, 'scope_key' => 'user:bob', 'team_id' => null, 'key' => 'year_end', 'name' => 'Bob', 'applies_to' => 'unit', 'is_active' => 0, 'system_template_id' => 1],
            ['id' => 3, 'scope_key' => 'team:a', 'team_id' => 'a', 'key' => 'year_end', 'name' => 'Team A', 'applies_to' => 'property', 'is_active' => 1, 'system_template_id' => 1],
        ];
        $this->db->tables['domus_task_tpl_steps'] = [
            ['id' => 10, 'template_id' => 1, 'team_id' => null, 'title' => 'Original', 'description' => 'Instructions', 'sort_order' => 1, 'default_due_days_offset' => 7, 'allow_early_completion' => 1, 'action_type' => 'url', 'action_url' => 'https://example.com'],
            ['id' => 20, 'template_id' => 2, 'team_id' => null, 'title' => 'Bob step', 'sort_order' => 1],
        ];
    }
    private function context(string $user, ?string $team = null): array {
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('activeTeamId')->willReturn($team);
        $access->method('legacyOwnerUserId')->willReturn($user);
        $access->method('managementUserId')->willReturn($user);
        $templates = new StoredTemplateMapper($this->db, $access);
        $steps = new StoredTemplateStepMapper($this->db, $access, $templates);
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        return [$templates, $steps, new TaskTemplateService($templates, $steps, $this->db, $l10n)];
    }
    public function testOverridePrecedesActiveAndEntityFiltersAndRejectsShadowedIds(): void {
        [$alice] = $this->context('alice');
        [$bob] = $this->context('bob');
        [$team] = $this->context('alice', 'a');
        self::assertSame(1, $alice->findByKey('year_end')->getId());
        self::assertSame([], $bob->findAll(true));
        self::assertSame(2, $bob->findByKey('year_end')->getId());
        self::assertNull($bob->findById(1));
        self::assertNull($alice->findById(2));
        self::assertSame([], $team->findAll(true, 'unit'));
        self::assertSame(3, $team->findAll(true, 'property')[0]->getId());
    }
    public function testCustomizeCopiesAllStepsAndResetRestoresDefaultForOnlyThatScope(): void {
        [$templates, $steps, $service] = $this->context('alice');
        $copy = $service->customize(1);
        self::assertSame('user:alice', $copy->getScopeKey());
        self::assertSame(1, $copy->getSystemTemplateId());
        self::assertSame($copy->getId(), $templates->findByKey('year_end')->getId());
        $step = $steps->findByTemplate($copy->getId())[0];
        self::assertSame('Original', $step->getTitle());
        self::assertSame(7, $step->getDefaultDueDaysOffset());
        self::assertSame(1, $step->getAllowEarlyCompletion());
        self::assertSame('https://example.com', $step->getActionUrl());
        self::assertSame(1, $service->reset($copy->getId())->getId());
        self::assertNull($templates->findById($copy->getId()));
        self::assertNull($steps->findById($step->getId()));
        self::assertSame('archived:' . $copy->getId(), $this->db->tables['domus_task_templates'][3]['scope_key']);
        self::assertSame(2, $this->context('bob')[0]->findByKey('year_end')->getId());
        self::assertCount(3, $this->db->tables['domus_task_tpl_steps'], 'Historical steps remain stored');
    }
    public function testDisableSystemTemplateCreatesInactiveOverrideForSelectedTeamOnly(): void {
        [$templates, , $service] = $this->context('alice', 'b');
        $copy = $service->updateTemplate(1, ['isActive' => false]);
        self::assertSame('team:b', $copy->getScopeKey());
        self::assertSame(0, $copy->getIsActive());
        self::assertSame([], $templates->findAll(true));
        self::assertSame(1, $this->context('alice')[0]->findAll(true)[0]->getId());
        self::assertSame(1, $service->reset($copy->getId())->getId());
    }
    public function testStepReadsAndWritesCannotReachOtherUsersOrSystemDefinitions(): void {
        [, $steps, $service] = $this->context('alice');
        self::assertNull($steps->findById(20));
        self::assertCount(1, $steps->findByTemplate(1));
        foreach (['update', 'delete'] as $operation) {
            try { $steps->$operation($steps->findById(10)); self::fail('System write allowed'); }
            catch (\DomainException $e) { self::assertStringContainsString('not available', $e->getMessage()); }
        }
        $this->expectException(\InvalidArgumentException::class);
        $service->addOrUpdateStep(1, ['title' => 'Changed']);
    }
    public function testSystemDefinitionCannotBeEditedDirectly(): void {
        $this->expectException(\InvalidArgumentException::class);
        $this->context('alice')[2]->updateTemplate(1, ['name' => 'Changed']);
    }
    public function testArchivedDefinitionIsExportableOnlyThroughAnOwnedProcess(): void {
        [$mapper, $steps, $service] = $this->context('alice');
        $copy = $service->customize(1);
        $this->db->tables['domus_units'] = [['id' => 9, 'user_id' => 'alice', 'team_id' => null]];
        $this->db->tables['domus_workflow_runs'] = [['id' => 7, 'template_id' => $copy->getId(), 'entity_type' => 'unit', 'entity_id' => 9, 'team_id' => null]];
        $run = new \OCA\Domus\Db\WorkflowRun();
        $run->setId(7); $run->setTemplateId($copy->getId()); $run->setEntityType('unit'); $run->setEntityId(9);
        $service->reset($copy->getId());
        self::assertNull($mapper->findById($copy->getId()));
        self::assertSame($copy->getId(), $mapper->findForRun($run)->getId());
        self::assertCount(1, $steps->findForRun($run));
        self::assertNull($this->context('bob')[0]->findForRun($run));
        $run->setTemplateId(2);
        self::assertNull($mapper->findForRun($run), 'Forged process/template link must not grant history access');
    }
}

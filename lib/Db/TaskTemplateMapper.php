<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Db;

use OCA\Domus\Service\ManagementAccessContext;
use OCP\IDBConnection;

class TaskTemplateMapper extends TeamScopedMapper {
    public function __construct(IDBConnection $db, ?ManagementAccessContext $access = null) {
        parent::__construct($db, 'domus_task_templates', TaskTemplate::class, $access);
    }

    public function currentScopeKey(): string {
        if ($this->access === null) return 'global';
        $teamId = $this->access->activeTeamId();
        return $teamId === null ? 'user:' . $this->access->legacyOwnerUserId() : 'team:' . $teamId;
    }

    public function findAll(?bool $activeOnly = null, ?string $appliesTo = null): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName());
        $qb->where($qb->expr()->in('scope_key', $qb->createNamedParameter(['system', $this->currentScopeKey()], $qb::PARAM_STR_ARRAY)));
        $templates = $this->findEntities($qb);
        $effective = [];
        foreach ($templates as $template) {
            $key = $template->getKey();
            if (!isset($effective[$key]) || $template->getScopeKey() !== 'system') $effective[$key] = $template;
        }
        // Resolve overrides BEFORE filtering: a disabled/local property template must hide its default.
        $effective = array_values($effective);
        usort($effective, fn($a, $b) => (int)$a->getId() <=> (int)$b->getId());
        return array_values(array_filter($effective, fn($template) =>
            ($activeOnly === null || (bool)$template->getIsActive() === $activeOnly)
            && ($appliesTo === null || $appliesTo === '' || $template->getAppliesTo() === $appliesTo)));
    }

    public function findById(int $id): ?TaskTemplate {
        foreach ($this->findAll() as $template) if ((int)$template->getId() === $id) return $template;
        return null;
    }

    public function findByKey(string $key): ?TaskTemplate {
        foreach ($this->findAll() as $template) if ($template->getKey() === $key) return $template;
        return null;
    }

    /** Historical definitions are readable only through an owned process, never by arbitrary template ID. */
    public function findForRun(WorkflowRun $run): ?TaskTemplate {
        if ($this->access === null) return $this->findById((int)$run->getTemplateId());
        $teamId = $this->access->activeTeamId();
        if ($run->getTeamId() !== $teamId) return null;
        $table = match ($run->getEntityType()) {
            'unit' => 'domus_units', 'property' => 'domus_properties', default => null,
        };
        if ($table === null) return null;
        $qb = $this->db->getQueryBuilder();
        $qb->select('id')->from($table)
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($run->getEntityId())))
            ->andWhere($this->ownerExpression($qb, $this->access->managementUserId()));
        $result = $qb->executeQuery();
        $owner = $result->fetchOne();
        $result->closeCursor();
        if ($owner === false) return null;
        $qb = $this->db->getQueryBuilder();
        $qb->select('id')->from('domus_workflow_runs')
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($run->getId())))
            ->andWhere($qb->expr()->eq('template_id', $qb->createNamedParameter($run->getTemplateId())))
            ->andWhere($qb->expr()->eq('entity_type', $qb->createNamedParameter($run->getEntityType())))
            ->andWhere($qb->expr()->eq('entity_id', $qb->createNamedParameter($run->getEntityId())));
        $this->applyScope($qb);
        $result = $qb->executeQuery();
        $exists = $result->fetchOne();
        $result->closeCursor();
        if ($exists === false) return null;
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($run->getTemplateId())));
        return $this->findEntities($qb)[0] ?? null;
    }

    /** Only shared definitions, used to validate reset and reserved keys. */
    public function findSystemByKey(string $key): ?TaskTemplate {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')->from($this->getTableName())
            ->where($qb->expr()->eq('scope_key', $qb->createNamedParameter('system')))
            ->andWhere($qb->expr()->eq('key', $qb->createNamedParameter($key)));
        return $this->findEntities($qb)[0] ?? null;
    }

    /** Keep historical IDs and steps for already-created processes. */
    public function archive(TaskTemplate $template): void {
        if ($template->getScopeKey() !== $this->currentScopeKey()) throw new \DomainException('The record is not available to this owner.');
        $qb = $this->db->getQueryBuilder();
        $qb->update($this->getTableName())
            ->set('scope_key', $qb->createNamedParameter('archived:' . $template->getId()))
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($template->getId())))
            ->andWhere($qb->expr()->eq('scope_key', $qb->createNamedParameter($this->currentScopeKey())))
            ->executeStatement();
    }
}

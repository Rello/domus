<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCA\Domus\Exception\ResourceNotFoundException;

use OCA\Domus\Db\Task;
use OCA\Domus\Db\TaskMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\DB\Exception as DbException;
use OCP\IL10N;

class TaskService {
    private const STATUS_OPEN = 'open';
    private const STATUS_CLOSED = 'closed';
    private const STATUS_NEW = 'new';

    public function __construct(
        private TaskMapper $taskMapper,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private IL10N $l10n,
    ) {
    }

    /**
     * @throws DbException
     */
    public function createTask(string $entityType, int $entityId, string $title, ?string $description, ?string $dueDate, string $userId): Task {
        $this->assertEntityExists($entityType, $entityId, $userId);
        $title = trim($title);
        if ($title === '') {
            throw new \InvalidArgumentException($this->l10n->t('Task title is required.'));
        }
        $now = time();
        $task = new Task();
        $task->setEntityType($entityType);
        $task->setEntityId($entityId);
        $task->setTitle($title);
        $task->setDescription($description ?: null);
        $task->setStatus(self::STATUS_OPEN);
        $task->setDueDate($dueDate ?: null);
        $task->setClosedAt(null);
        $task->setClosedBy(null);
        $task->setCreatedBy($userId);
        $task->setCreatedAt($now);
        $task->setUpdatedAt($now);

        return $this->taskMapper->insert($task);
    }

    /**
     * @throws DbException
     */
    public function listTasksByEntity(string $entityType, int $entityId, string $userId, ?string $status = null): array {
        $this->assertEntityExists($entityType, $entityId, $userId);
        return $this->taskMapper->findByEntity($entityType, $entityId, $status);
    }

    /**
     * @throws DbException
     */
    public function listOpenTasks(string $userId, string $role, ?string $entityType = null, ?int $entityId = null, bool $includeDeferred = false): array {
        if ($entityType !== null && $entityId !== null) {
            $this->assertEntityExists($entityType, $entityId, $userId);
            $tasks = $this->taskMapper->findByEntity($entityType, $entityId, self::STATUS_OPEN);
            return $includeDeferred ? $tasks : $this->visibleTasks($tasks);
        }

        $entities = [];
        if ($role === 'buildingMgmt') {
            $properties = $this->propertyMapper->findByUser($userId);
            foreach ($properties as $property) {
                $propertyId = $property->getId();
                if ($propertyId !== null) {
                    $entities[] = ['entityType' => 'property', 'entityId' => (int)$propertyId];
                }
            }
        }
        $units = $this->unitMapper->findByUser($userId, null, false);
        if ($role === 'buildingMgmt') {
            $units = array_filter($units, fn($unit) => $unit->getPropertyId() !== null);
        } elseif ($role === 'landlord') {
            $units = array_filter($units, fn($unit) => $unit->getPropertyId() === null);
        }
        foreach ($units as $unit) {
            $unitId = $unit->getId();
            if ($unitId !== null) {
                $entities[] = ['entityType' => 'unit', 'entityId' => (int)$unitId];
            }
        }
        $tasks = $this->taskMapper->findOpenTasks($entities);
        return $includeDeferred ? $tasks : $this->visibleTasks($tasks);
    }

    /**
     * @throws DbException
     */
    public function updateTask(int $taskId, string $title, ?string $description, ?string $dueDate, string $userId): Task {
        $task = $this->taskMapper->findById($taskId);
        if (!$task) {
            throw new ResourceNotFoundException($this->l10n->t('Task not found.'));
        }
        $this->assertTaskAccess($task, $userId);
        $title = trim($title);
        if ($title === '') {
            throw new \InvalidArgumentException($this->l10n->t('Task title is required.'));
        }

        $task->setTitle($title);
        $task->setDescription($description ?: null);
        $task->setDueDate($dueDate ?: null);
        $task->setUpdatedAt(time());

        return $this->taskMapper->update($task);
    }

    /**
     * @throws DbException
     */
    public function closeTask(int $taskId, string $userId): Task {
        $task = $this->taskMapper->findById($taskId);
        if (!$task) {
            throw new ResourceNotFoundException($this->l10n->t('Task not found.'));
        }
        $this->assertTaskAccess($task, $userId);
        if (!in_array($task->getStatus(), [self::STATUS_OPEN, self::STATUS_NEW], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Only open tasks can be closed.'));
        }
        $now = time();
        $task->setStatus(self::STATUS_CLOSED);
        $task->setDeferredUntil(null);
        $task->setClosedAt($now);
        $task->setClosedBy($userId);
        $task->setUpdatedAt($now);

        return $this->taskMapper->update($task);
    }

    /**
     * @throws DbException
     */
    public function reopenTask(int $taskId, string $userId): Task {
        $task = $this->taskMapper->findById($taskId);
        if (!$task) {
            throw new ResourceNotFoundException($this->l10n->t('Task not found.'));
        }
        $this->assertTaskAccess($task, $userId);
        if ($task->getStatus() !== self::STATUS_CLOSED) {
            throw new \InvalidArgumentException($this->l10n->t('Only closed tasks can be reopened.'));
        }
        $now = time();
        $task->setStatus(self::STATUS_OPEN);
        $task->setClosedAt(null);
        $task->setClosedBy(null);
        $task->setUpdatedAt($now);

        return $this->taskMapper->update($task);
    }

    /**
     * @throws DbException
     */
    public function deleteTask(int $taskId, string $userId): void {
        $task = $this->taskMapper->findById($taskId);
        if (!$task) {
            throw new ResourceNotFoundException($this->l10n->t('Task not found.'));
        }
        $this->assertTaskAccess($task, $userId);

        $this->taskMapper->delete($task);
    }

    public function findTask(int $taskId, string $userId): ?Task {
        try {
            $task = $this->taskMapper->findById($taskId);
        } catch (\OCP\AppFramework\Db\DoesNotExistException) {
            return null;
        }
        if ($task) $this->assertTaskAccess($task, $userId);
        return $task;
    }

    public function deferTask(int $taskId, ?int $until, string $userId): Task {
        $task = $this->findTask($taskId, $userId);
        if (!$task) throw new ResourceNotFoundException($this->l10n->t('Task not found.'));
        if ($task->getStatus() !== self::STATUS_OPEN) {
            throw new \InvalidArgumentException($this->l10n->t('Only open tasks can be deferred.'));
        }
        if ($until !== null && $until <= time()) {
            throw new \InvalidArgumentException($this->l10n->t('Choose a future reminder date.'));
        }
        $task->setDeferredUntil($until);
        if ($until !== null) $task->setDueDate(date('Y-m-d', $until));
        $task->setUpdatedAt(time());
        return $this->taskMapper->update($task);
    }

    /** Called only after a rule has been re-evaluated under its ownership lock. */
    public function synchronizeRuleTask(int $taskId, int $ruleId, ?int $tenancyId, string $description, bool $relevant, string $userId, bool $detach = false): void {
        $task = $this->findTask($taskId, $userId);
        if (!$task) return; // Deleted tasks are never recreated for this cycle.
        $changed = false;
        if ($task->getRuleId() === null) {
            $task->setRuleId($ruleId);
            $changed = true;
        }
        if ($relevant && $task->getRuleTenancyId() !== $tenancyId) {
            $task->setRuleTenancyId($tenancyId);
            $changed = true;
        }
        if ($task->getStatus() === self::STATUS_OPEN) {
            if (!$relevant) {
                $task->setStatus(self::STATUS_CLOSED);
                $task->setClosedAt(time());
                $task->setClosedBy($userId);
                $task->setDeferredUntil(null);
                $changed = true;
            } else {
                if ($task->getDescription() !== $description) {
                    $task->setDescription($description);
                    $changed = true;
                }
                if ($task->getDeferredUntil() !== null && $task->getDeferredUntil() <= time()) {
                    $task->setDueDate($task->getEffectiveDueDate());
                    $task->setDeferredUntil(null);
                    $changed = true;
                }
            }
        }
        if ($detach) {
            $task->setRuleId(null);
            $task->setRuleTenancyId(null);
            $changed = true;
        }
        if ($changed) {
            $task->setUpdatedAt(time());
            $this->taskMapper->update($task);
        }
    }

    public function visibleTasks(array $tasks): array {
        return array_values(array_filter($tasks, static fn(Task $task) =>
            $task->getDeferredUntil() === null
            || ($task->getRuleId() === null && $task->getDeferredUntil() <= time())));
    }

    private function assertTaskAccess(Task $task, string $userId): void {
        try {
            $this->assertEntityExists((string)$task->getEntityType(), (int)$task->getEntityId(), $userId);
            return;
        } catch (\RuntimeException) {
            // Allow managing legacy/orphaned tasks when they still belong to the current user.
        }

        if ((string)$task->getCreatedBy() !== $userId) {
            throw new ResourceNotFoundException($this->l10n->t('Task not found.'));
        }
    }

    private function assertEntityExists(string $entityType, int $entityId, string $userId): void {
        if ($entityId <= 0) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid entity.'));
        }
        if ($entityType === 'unit') {
            $unit = $this->unitMapper->findForUser($entityId, $userId);
            if (!$unit) {
                throw new ResourceNotFoundException($this->l10n->t('Unit not found.'));
            }
            return;
        }
        if ($entityType === 'property') {
            $property = $this->propertyMapper->findForUser($entityId, $userId);
            if (!$property) {
                throw new ResourceNotFoundException($this->l10n->t('Property not found.'));
            }
            return;
        }
        throw new \InvalidArgumentException($this->l10n->t('Unsupported entity type.'));
    }
}

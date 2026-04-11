<?php

namespace OCA\Domus\Service;

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
    public function listOpenTasks(string $userId, string $role, ?string $entityType = null, ?int $entityId = null): array {
        if ($entityType !== null && $entityId !== null) {
            $this->assertEntityExists($entityType, $entityId, $userId);
            return $this->taskMapper->findByEntity($entityType, $entityId, self::STATUS_OPEN);
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
        return $this->taskMapper->findOpenTasks($entities);
    }

    /**
     * @throws DbException
     */
    public function updateTask(int $taskId, string $title, ?string $description, ?string $dueDate, string $userId): Task {
        $task = $this->taskMapper->findById($taskId);
        if (!$task) {
            throw new \RuntimeException($this->l10n->t('Task not found.'));
        }
        $this->assertEntityExists((string)$task->getEntityType(), (int)$task->getEntityId(), $userId);
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
            throw new \RuntimeException($this->l10n->t('Task not found.'));
        }
        $this->assertEntityExists((string)$task->getEntityType(), (int)$task->getEntityId(), $userId);
        if (!in_array($task->getStatus(), [self::STATUS_OPEN, self::STATUS_NEW], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Only open tasks can be closed.'));
        }
        $now = time();
        $task->setStatus(self::STATUS_CLOSED);
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
            throw new \RuntimeException($this->l10n->t('Task not found.'));
        }
        $this->assertEntityExists((string)$task->getEntityType(), (int)$task->getEntityId(), $userId);
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
            throw new \RuntimeException($this->l10n->t('Task not found.'));
        }
        $this->assertEntityExists((string)$task->getEntityType(), (int)$task->getEntityId(), $userId);

        $this->taskMapper->delete($task);
    }

    private function assertEntityExists(string $entityType, int $entityId, string $userId): void {
        if ($entityId <= 0) {
            throw new \RuntimeException($this->l10n->t('Invalid entity.'));
        }
        if ($entityType === 'unit') {
            if (!$this->unitMapper->findForUser($entityId, $userId)) {
                throw new \RuntimeException($this->l10n->t('Unit not found.'));
            }
            return;
        }
        if ($entityType === 'property') {
            if (!$this->propertyMapper->findForUser($entityId, $userId)) {
                throw new \RuntimeException($this->l10n->t('Property not found.'));
            }
            return;
        }
        throw new \RuntimeException($this->l10n->t('Unsupported entity type.'));
    }
}

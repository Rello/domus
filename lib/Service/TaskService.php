<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Task;
use OCA\Domus\Db\TaskMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\DB\Exception as DbException;
use OCP\IL10N;

class TaskService {
    private const STATUS_OPEN = 'open';
    private const STATUS_CLOSED = 'closed';
    private const STATUS_NEW = 'new';

    public function __construct(
        private TaskMapper $taskMapper,
        private UnitMapper $unitMapper,
        private IL10N $l10n,
    ) {
    }

    /**
     * @throws DbException
     */
    public function createTask(int $unitId, string $title, ?string $description, ?string $dueDate, string $userId): Task {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        $title = trim($title);
        if ($title === '') {
            throw new \InvalidArgumentException($this->l10n->t('Task title is required.'));
        }
        $now = time();
        $task = new Task();
        $task->setUnitId($unitId);
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
    public function listTasksByUnit(int $unitId, string $userId, ?string $status = null): array {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        return $this->taskMapper->findByUnit($unitId, $status);
    }

    /**
     * @throws DbException
     */
    public function listOpenTasks(string $userId, string $role, ?int $unitId = null): array {
        if ($unitId !== null) {
            $unit = $this->unitMapper->findForUser($unitId, $userId);
            if (!$unit) {
                throw new \RuntimeException($this->l10n->t('Unit not found.'));
            }
            return $this->taskMapper->findByUnit($unitId, self::STATUS_OPEN);
        }

        $units = $this->unitMapper->findByUser($userId, null, false);
        if ($role === 'buildingMgmt') {
            $units = array_filter($units, fn($unit) => $unit->getPropertyId() !== null);
        } elseif ($role === 'landlord') {
            $units = array_filter($units, fn($unit) => $unit->getPropertyId() === null);
        }

        $unitIds = array_map(fn($unit) => $unit->getId(), $units);
        return $this->taskMapper->findOpenTasks($unitIds);
    }

    /**
     * @throws DbException
     */
    public function closeTask(int $taskId, string $userId): Task {
        $task = $this->taskMapper->findById($taskId);
        if (!$task) {
            throw new \RuntimeException($this->l10n->t('Task not found.'));
        }
        $unit = $this->unitMapper->findForUser($task->getUnitId(), $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
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
        $unit = $this->unitMapper->findForUser($task->getUnitId(), $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
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
}

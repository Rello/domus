<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\TaskTemplate;
use OCA\Domus\Db\TaskTemplateMapper;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Db\UnitTask;
use OCA\Domus\Db\UnitTaskMapper;
use OCP\DB\Exception as DbException;
use OCP\IDBConnection;
use OCP\IL10N;

class TaskService {
    public const STATUS_OPEN = 'open';
    public const STATUS_DONE = 'done';

    public function __construct(
        private TaskTemplateMapper $taskTemplateMapper,
        private UnitTaskMapper $unitTaskMapper,
        private UnitMapper $unitMapper,
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    /**
     * @throws DbException
     */
    public function getTasksForUnitYear(string $userId, int $unitId, int $year): array {
        $this->materializeTasksForUnitYear($userId, $unitId, $year);

        return $this->unitTaskMapper->findByUnitYear($userId, $unitId, $year);
    }

    /**
     * @throws DbException
     */
    public function completeTask(string $userId, int $taskId, ?string $notes = null): UnitTask {
        $task = $this->unitTaskMapper->findForUser($taskId, $userId);
        if (!$task) {
            throw new \RuntimeException($this->l10n->t('Task not found.'));
        }

        $payload = ['manuallyCompleted' => true];
        if ($notes !== null && $notes !== '') {
            $payload['notes'] = $notes;
        }

        $this->applyCompletion($task, $payload);

        return $this->unitTaskMapper->update($task);
    }

    /**
     * @throws DbException
     */
    public function autoCompleteTasksForTrigger(string $userId, string $triggerType, array $context): array {
        $unitId = isset($context['unitId']) ? (int)$context['unitId'] : null;
        $year = isset($context['year']) ? (int)$context['year'] : null;

        if ($unitId === null || $year === null) {
            return [];
        }

        $propertyId = isset($context['propertyId']) ? (int)$context['propertyId'] : null;
        $templates = $this->taskTemplateMapper->findForContext($userId, $propertyId, $unitId);
        $matchingTemplates = array_filter(
            $templates,
            fn(TaskTemplate $template) => $template->getTriggerType() === $triggerType
                && $this->matchesTriggerConfig($template, $context)
        );

        $templateIds = array_map(
            static fn(TaskTemplate $template) => (int)$template->getId(),
            $matchingTemplates
        );

        $tasks = $this->unitTaskMapper->findOpenByTemplateIds($userId, $unitId, $year, $templateIds);
        if ($tasks === []) {
            return [];
        }

        $completed = [];
        foreach ($tasks as $task) {
            $this->applyCompletion($task, [
                'autoCompleted' => true,
                'autoCompletedBy' => $triggerType,
            ]);
            $completed[] = $this->unitTaskMapper->update($task);
        }

        return $completed;
    }

    /**
     * @throws DbException
     */
    private function materializeTasksForUnitYear(string $userId, int $unitId, int $year): void {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        $propertyId = $unit->getPropertyId();
        $templates = $this->taskTemplateMapper->findForContext($userId, $propertyId, $unitId);
        if ($templates === []) {
            return;
        }

        $existingTasks = $this->unitTaskMapper->findByUnitYear($userId, $unitId, $year);
        $existingTemplateIds = [];
        foreach ($existingTasks as $task) {
            $existingTemplateIds[(int)$task->getTemplateId()] = true;
        }

        $now = time();
        $newTasks = [];

        foreach ($templates as $template) {
            $templateId = (int)$template->getId();
            if (isset($existingTemplateIds[$templateId])) {
                continue;
            }

            $task = new UnitTask();
            $task->setUserId($userId);
            $task->setUnitId($unitId);
            $task->setYear($year);
            $task->setTemplateId($templateId);
            $task->setStatus(self::STATUS_OPEN);
            $task->setCreatedAt($now);
            $task->setUpdatedAt($now);
            $newTasks[] = $task;
        }

        if ($newTasks === []) {
            return;
        }

        $this->connection->beginTransaction();
        try {
            foreach ($newTasks as $task) {
                $this->unitTaskMapper->insert($task);
            }
            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }
    }

    private function applyCompletion(UnitTask $task, array $payload): void {
        $now = time();
        $task->setStatus(self::STATUS_DONE);
        if ($task->getCompletedAt() === null) {
            $task->setCompletedAt($now);
        }
        $task->setUpdatedAt($now);
        $this->mergeDataJson($task, $payload);
    }

    private function mergeDataJson(UnitTask $task, array $payload): void {
        if ($payload === []) {
            return;
        }

        $data = $this->decodeJson($task->getDataJson());
        foreach ($payload as $key => $value) {
            $data[$key] = $value;
        }

        $task->setDataJson(json_encode($data));
    }

    private function decodeJson(?string $value): array {
        if ($value === null || $value === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function matchesTriggerConfig(TaskTemplate $template, array $context): bool {
        $config = $this->decodeJson($template->getTriggerConfig());
        if ($config === []) {
            return true;
        }

        foreach ($config as $key => $value) {
            if (!array_key_exists($key, $context)) {
                return false;
            }
            if ((string)$context[$key] !== (string)$value) {
                return false;
            }
        }

        return true;
    }
}

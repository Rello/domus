<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\TaskStep;
use OCA\Domus\Db\TaskStepMapper;
use OCA\Domus\Db\TaskTemplateMapper;
use OCA\Domus\Db\TaskTemplateStepMapper;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Db\WorkflowRun;
use OCA\Domus\Db\WorkflowRunMapper;
use OCP\DB\Exception as DbException;
use OCP\IDBConnection;
use OCP\IL10N;

class WorkflowRunService {
    private const STATUS_OPEN = 'open';
    private const STATUS_CLOSED = 'closed';
    private const STATUS_CANCELLED = 'cancelled';

    private const STEP_STATUS_NEW = 'new';
    private const STEP_STATUS_OPEN = 'open';
    private const STEP_STATUS_CLOSED = 'closed';

    public function __construct(
        private WorkflowRunMapper $workflowRunMapper,
        private TaskStepMapper $taskStepMapper,
        private TaskTemplateMapper $templateMapper,
        private TaskTemplateStepMapper $templateStepMapper,
        private UnitMapper $unitMapper,
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    /**
     * @throws DbException
     */
    public function startWorkflowRun(int $unitId, int $templateId, ?int $year, ?string $name, string $userId): WorkflowRun {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        $template = $this->templateMapper->findById($templateId);
        if (!$template || (int)$template->getIsActive() !== 1) {
            throw new \RuntimeException($this->l10n->t('Task template is not active.'));
        }

        $steps = $this->templateStepMapper->findByTemplate($templateId);
        if (empty($steps)) {
            throw new \RuntimeException($this->l10n->t('Template has no steps.'));
        }

        $now = time();
        $displayName = $name !== null && trim($name) !== '' ? trim($name) : $template->getName();

        $run = new WorkflowRun();
        $run->setUnitId($unitId);
        $run->setTemplateId($templateId);
        $run->setName($displayName);
        $run->setYear($year);
        $run->setStatus(self::STATUS_OPEN);
        $run->setStartedAt($now);
        $run->setClosedAt(null);
        $run->setCreatedBy($userId);
        $run->setCreatedAt($now);
        $run->setUpdatedAt($now);

        $this->connection->beginTransaction();
        try {
            $run = $this->workflowRunMapper->insert($run);
            $order = 1;
            foreach ($steps as $stepTemplate) {
                $taskStep = new TaskStep();
                $taskStep->setWorkflowRunId($run->getId());
                $taskStep->setUnitId($unitId);
                $taskStep->setSortOrder($order);
                $taskStep->setTitle($stepTemplate->getTitle());
                $taskStep->setDescription($stepTemplate->getDescription());
                $taskStep->setActionType($stepTemplate->getActionType());
                $taskStep->setActionUrl($stepTemplate->getActionUrl());
                $isOpen = $order === 1;
                $taskStep->setStatus($isOpen ? self::STEP_STATUS_OPEN : self::STEP_STATUS_NEW);
                $taskStep->setDueDate($isOpen ? $this->buildDueDate((int)$stepTemplate->getDefaultDueDaysOffset(), $now) : null);
                $taskStep->setOpenedAt($isOpen ? $now : null);
                $taskStep->setClosedAt(null);
                $taskStep->setClosedBy(null);
                $taskStep->setCreatedAt($now);
                $taskStep->setUpdatedAt($now);
                $this->taskStepMapper->insert($taskStep);
                $order++;
            }
            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }

        return $this->getWorkflowRun($run->getId(), $userId);
    }

    /**
     * @throws DbException
     */
    public function getWorkflowRunsByUnit(int $unitId, string $userId): array {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        $runs = $this->workflowRunMapper->findByUnit($unitId);
        foreach ($runs as $run) {
            $steps = $this->taskStepMapper->findByRun($run->getId());
            $run->setSteps($steps);
        }

        return $runs;
    }

    /**
     * @throws DbException
     */
    public function getWorkflowRun(int $runId, string $userId): WorkflowRun {
        $run = $this->workflowRunMapper->findById($runId);
        if (!$run) {
            throw new \RuntimeException($this->l10n->t('Workflow run not found.'));
        }
        $unit = $this->unitMapper->findForUser($run->getUnitId(), $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        $steps = $this->taskStepMapper->findByRun($run->getId());
        $run->setSteps($steps);

        return $run;
    }

    /**
     * @throws DbException
     */
    public function closeStep(int $stepId, string $userId): TaskStep {
        $step = $this->taskStepMapper->findById($stepId);
        if (!$step) {
            throw new \RuntimeException($this->l10n->t('Task step not found.'));
        }

        $unit = $this->unitMapper->findForUser($step->getUnitId(), $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        if ($step->getStatus() !== self::STEP_STATUS_OPEN) {
            throw new \InvalidArgumentException($this->l10n->t('Only open steps can be closed.'));
        }

        $now = time();

        $this->connection->beginTransaction();
        try {
            $step->setStatus(self::STEP_STATUS_CLOSED);
            $step->setClosedAt($now);
            $step->setClosedBy($userId);
            $step->setUpdatedAt($now);
            $this->taskStepMapper->update($step);

            $next = $this->taskStepMapper->findNextNewStep($step->getWorkflowRunId(), (int)$step->getSortOrder());
            if ($next) {
                $run = $this->workflowRunMapper->findById($step->getWorkflowRunId());
                $offset = 0;
                if ($run) {
                    $templateStep = $this->templateStepMapper->findByTemplateAndSortOrder($run->getTemplateId(), (int)$next->getSortOrder());
                    $offset = $templateStep ? (int)$templateStep->getDefaultDueDaysOffset() : 0;
                }
                $next->setStatus(self::STEP_STATUS_OPEN);
                $next->setOpenedAt($now);
                $next->setDueDate($this->buildDueDate($offset, $now));
                $next->setUpdatedAt($now);
                $this->taskStepMapper->update($next);
            } else {
                $run = $this->workflowRunMapper->findById($step->getWorkflowRunId());
                if ($run) {
                    $run->setStatus(self::STATUS_CLOSED);
                    $run->setClosedAt($now);
                    $run->setUpdatedAt($now);
                    $this->workflowRunMapper->update($run);
                }
            }
            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }

        return $step;
    }

    /**
     * @throws DbException
     */
    public function reopenStep(int $stepId, string $userId): TaskStep {
        $step = $this->taskStepMapper->findById($stepId);
        if (!$step) {
            throw new \RuntimeException($this->l10n->t('Task step not found.'));
        }

        $unit = $this->unitMapper->findForUser($step->getUnitId(), $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        if ($step->getStatus() !== self::STEP_STATUS_CLOSED) {
            throw new \InvalidArgumentException($this->l10n->t('Only closed steps can be reopened.'));
        }

        $now = time();

        $this->connection->beginTransaction();
        try {
            $openStep = $this->taskStepMapper->findOpenStepForRun($step->getWorkflowRunId());
            if ($openStep && $openStep->getId() !== $step->getId()) {
                $openStep->setStatus(self::STEP_STATUS_NEW);
                $openStep->setOpenedAt(null);
                $openStep->setUpdatedAt($now);
                $this->taskStepMapper->update($openStep);
            }

            $offset = 0;
            $run = $this->workflowRunMapper->findById($step->getWorkflowRunId());
            if ($run) {
                $templateStep = $this->templateStepMapper->findByTemplateAndSortOrder($run->getTemplateId(), (int)$step->getSortOrder());
                $offset = $templateStep ? (int)$templateStep->getDefaultDueDaysOffset() : 0;
            }
            $step->setStatus(self::STEP_STATUS_OPEN);
            $step->setOpenedAt($now);
            $step->setDueDate($this->buildDueDate($offset, $now));
            $step->setClosedAt(null);
            $step->setClosedBy(null);
            $step->setUpdatedAt($now);
            $this->taskStepMapper->update($step);

            if ($run && $run->getStatus() !== self::STATUS_OPEN) {
                $run->setStatus(self::STATUS_OPEN);
                $run->setClosedAt(null);
                $run->setUpdatedAt($now);
                $this->workflowRunMapper->update($run);
            }
            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }

        return $step;
    }

    /**
     * @throws DbException
     */
    public function deleteRun(int $runId, string $userId): void {
        $run = $this->workflowRunMapper->findById($runId);
        if (!$run) {
            throw new \RuntimeException($this->l10n->t('Workflow run not found.'));
        }

        $unit = $this->unitMapper->findForUser($run->getUnitId(), $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        $this->connection->beginTransaction();
        try {
            $steps = $this->taskStepMapper->findByRun($run->getId());
            foreach ($steps as $step) {
                $this->taskStepMapper->delete($step);
            }
            $this->workflowRunMapper->delete($run);
            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }
    }

    /**
     * @throws DbException
     */
    public function listOpenStepsForUser(string $userId, string $role): array {
        $units = $this->unitMapper->findByUser($userId, null, false);
        if ($role === 'buildingMgmt') {
            $units = array_filter($units, fn($unit) => $unit->getPropertyId() !== null);
        } elseif ($role === 'landlord') {
            $units = array_filter($units, fn($unit) => $unit->getPropertyId() === null);
        }

        $unitMap = [];
        foreach ($units as $unit) {
            $unitMap[$unit->getId()] = $unit->getLabel();
        }
        $unitIds = array_keys($unitMap);
        if (empty($unitIds)) {
            return [];
        }

        $steps = $this->taskStepMapper->findOpenStepsByUnits($unitIds);
        $runs = [];
        foreach ($steps as $step) {
            $run = $this->workflowRunMapper->findById($step->getWorkflowRunId());
            if ($run) {
                $runs[$run->getId()] = $run;
            }
        }

        return array_map(function (TaskStep $step) use ($unitMap, $runs) {
            $run = $runs[$step->getWorkflowRunId()] ?? null;
            return [
                'type' => 'process',
                'stepId' => $step->getId(),
                'workflowRunId' => $step->getWorkflowRunId(),
                'unitId' => $step->getUnitId(),
                'unitName' => $unitMap[$step->getUnitId()] ?? '',
                'title' => $step->getTitle(),
                'description' => $step->getDescription(),
                'actionType' => $step->getActionType(),
                'actionUrl' => $step->getActionUrl(),
                'dueDate' => $step->getDueDate(),
                'workflowName' => $run?->getName(),
            ];
        }, $steps);
    }

    private function buildDueDate(int $offset, int $timestamp): string {
        return (new \DateTimeImmutable('@' . $timestamp))
            ->setTimezone(new \DateTimeZone(date_default_timezone_get()))
            ->modify(sprintf('%+d days', $offset))
            ->format('Y-m-d');
    }
}

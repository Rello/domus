<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\{RuleMapper, UnitMapper, PropertyMapper, TenancyMapper};
use OCA\Domus\Exception\ResourceNotFoundException;
use OCP\IL10N;

class RuleService {
    public function __construct(
        private RuleMapper $rules,
        private UnitMapper $units,
        private PropertyMapper $properties,
        private TenancyMapper $tenancies,
        private RentReviewEvaluator $evaluator,
        private TaskService $tasks,
        private IL10N $l10n,
        private \OCA\Domus\Db\PartnerRelMapper $relations,
    ) {
    }

    public function listRules(): array {
        return $this->rules->listRules();
    }

    public function options(string $userId): array {
        return [
            'units' => array_map(fn($unit) => ['id' => (int)$unit->getId(), 'label' => $unit->getLabel()], $this->units->findByUser($userId)),
            'properties' => array_map(fn($property) => ['id' => (int)$property->getId(), 'name' => $property->getName()], $this->properties->findByUser($userId)),
        ];
    }

    public function validate(array $data, string $userId): array {
        $name = trim(is_string($data['name'] ?? null) ? $data['name'] : '');
        $alertWarning = $data['alertWarning'] ?? $this->l10n->t('The rent has not been increased for at least {months} months.');
        if (!is_string($alertWarning) || trim($alertWarning) === '' || mb_strlen($alertWarning) > 1000) {
            throw new \InvalidArgumentException($this->l10n->t('Enter an alert warning of 1–1000 characters.'));
        }
        $alertWarning = trim($alertWarning);
        $months = filter_var($data['months'] ?? 36, FILTER_VALIDATE_INT);
        $dueDays = filter_var($data['dueDays'] ?? 30, FILTER_VALIDATE_INT);
        $scope = $data['scope'] ?? 'allUnits';
        if ($name === '' || mb_strlen($name) > 150 || $months === false || $months < 1 || $months > 600
            || $dueDays === false || $dueDays < 0 || $dueDays > 365
            || !in_array($scope, ['allUnits', 'units', 'properties'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Enter a name, a threshold of 1–600 months and a task deadline of 0–365 days.'));
        }
        $ids = $data['scopeIds'] ?? [];
        if (!is_array($ids) || count($ids) > 1000) throw new \InvalidArgumentException($this->l10n->t('Invalid rule scope.'));
        foreach ($ids as $id) {
            if (filter_var($id, FILTER_VALIDATE_INT) === false || (int)$id < 1) throw new \InvalidArgumentException($this->l10n->t('Invalid rule scope.'));
        }
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if ($scope === 'allUnits') $ids = [];
        elseif (!$ids) throw new \InvalidArgumentException($this->l10n->t('Select at least one unit or property.'));
        foreach ($ids as $id) {
            $entity = $scope === 'units' ? $this->units->findForUser($id, $userId) : $this->properties->findForUser($id, $userId);
            if (!$entity) throw new ResourceNotFoundException($this->l10n->t('Invalid rule scope.'));
        }
        foreach (['enabled', 'autoTask'] as $key) {
            if (isset($data[$key]) && !is_bool($data[$key])) throw new \InvalidArgumentException($this->l10n->t('Invalid rule setting.'));
        }
        return ['name' => $name, 'alertWarning' => $alertWarning, 'type' => 'rentReview', 'months' => $months, 'scope' => $scope, 'scopeIds' => $ids,
            'enabled' => $data['enabled'] ?? true, 'autoTask' => true, 'dueDays' => $dueDays];
    }

    public function save(?int $id, array $data, string $userId): array {
        $definition = $this->validate($data, $userId);
        if ($id === null) return $this->rules->saveRule(null, $definition);
        return $this->rules->locked($id, fn() => $this->rules->saveRule($id, $definition));
    }

    public function delete(int $id, string $userId): void {
        $this->rules->locked($id, function ($rule) use ($id, $userId) {
            foreach ($this->rules->taskLinks($id) as $row) {
                if ($row['taskId'] ?? null) $this->tasks->synchronizeRuleTask($row['taskId'], $id, null, '', false, $userId, true);
            }
            $this->rules->deleteRule($id);
        });
    }

    public function preview(array $data, string $userId): array {
        return $this->matches($this->validate($data, $userId), $userId);
    }

    private function matches(array $rule, string $userId): array {
        $units = [];
        foreach ($this->units->findByUser($userId) as $unit) {
            if ($rule['scope'] === 'units' && !in_array((int)$unit->getId(), $rule['scopeIds'], true)) continue;
            if ($rule['scope'] === 'properties' && !in_array((int)$unit->getPropertyId(), $rule['scopeIds'], true)) continue;
            $units[(int)$unit->getId()] = $unit;
        }
        $result = [];
        $today = new \DateTimeImmutable('today');
        $tenancies = $this->tenancies->findByUser($userId);
        $references = $this->rules->references(array_map(fn($row) => (int)$row->getId(), $tenancies));
        $partnerIds = [];
        foreach ($this->relations->findForTenancies(array_map(fn($row) => (int)$row->getId(), $tenancies), $userId) as $relation) {
            $partnerIds[(int)$relation->getRelationId()][] = (int)$relation->getPartnerId();
        }
        $historyByUnit = [];
        foreach ($tenancies as $tenancy) {
            $tenancy->setPartnerIds(array_values(array_unique($partnerIds[(int)$tenancy->getId()] ?? [])));
            $historyByUnit[(int)$tenancy->getUnitId()][] = $tenancy;
        }
        foreach ($tenancies as $tenancy) {
            $unit = $units[(int)$tenancy->getUnitId()] ?? null;
            // Building-management owner records and rent-free occupancy have no base rent to review.
            if (!$unit || (float)$tenancy->getBaseRent() <= 0) continue;
            $match = $this->evaluator->evaluate($tenancy, $rule['months'], $today, $historyByUnit[(int)$tenancy->getUnitId()], $references);
            if (!$match || $match['status'] === 'ok') continue;
            $cycle = hash('sha256', $unit->getId() . ':' . $match['anchor'] . ':' . ($match['baselineDate'] ?? 'unknown'));
            $result[] = $match + ['cycle' => $cycle, 'unitId' => (int)$unit->getId(), 'unitLabel' => $unit->getLabel(),
                'tenancyId' => (int)$tenancy->getId(), 'ruleName' => $rule['name'], 'months' => $rule['months'],
                'alertWarning' => str_replace('{months}', (string)$rule['months'],
                    $rule['alertWarning'] ?? $this->l10n->t('The rent has not been increased for at least {months} months.'))];
        }
        return $result;
    }

    /** Run on explicit page evaluation and by the scheduled background job. */
    public function evaluate(string $userId, ?int $unitId = null): array {
        if ($unitId !== null && !$this->units->findForUser($unitId, $userId)) {
            throw new ResourceNotFoundException($this->l10n->t('Unit not found.'));
        }
        $alerts = [];
        $createdTasks = 0;
        foreach ($this->rules->listRules() as $rule) {
            $rows = $this->rules->locked($rule['id'], function ($current) use ($userId, &$createdTasks) {
                return $this->synchronize($current, $userId, $createdTasks);
            });
            foreach ($rows as $row) {
                if ($unitId === null || $row['unitId'] === $unitId) $alerts[] = $row;
            }
        }
        return ['alerts' => $alerts, 'createdTasks' => $createdTasks, 'checkedAt' => time()];
    }

    private function synchronize(array $rule, string $userId, int &$createdTasks): array {
        $stored = $this->rules->taskLinks($rule['id']);
        $current = [];
        foreach ($rule['enabled'] ? $this->matches($rule, $userId) : [] as $match) {
            $cycle = $match['cycle'];
            $link = $stored[$cycle] ?? null;
            if ($link === null) {
                $taskId = $this->createReviewTask($rule, $match, $userId);
                $link = $this->rules->linkTask($rule['id'], $cycle, $taskId);
                $createdTasks++;
            }
            $this->tasks->synchronizeRuleTask($link['taskId'], $rule['id'], $match['status'] === 'unknown' ? $match['tenancyId'] : null, $this->taskDescription($match), true, $userId);
            // Evaluation results are transient. Only the occurrence/task link is persisted.
            $current[$cycle] = $match + ['ruleId' => $rule['id'], 'taskId' => $link['taskId']];
        }
        foreach ($stored as $cycle => $link) {
            if (!isset($current[$cycle])) {
                $this->tasks->synchronizeRuleTask($link['taskId'], $rule['id'], null, '', false, $userId);
            }
        }
        return array_values($current);
    }

    private function createReviewTask(array $rule, array $alert, string $userId): int {
        $task = $this->tasks->createTask('unit', $alert['unitId'],
            $alert['status'] === 'unknown' ? $this->l10n->t('Check rent history') : $this->l10n->t('Review rent'),
            $this->taskDescription($alert), date('Y-m-d'), $userId);
        return (int)$task->getId();
    }

    private function taskDescription(array $alert): string {
        return $alert['status'] === 'unknown'
            ? $this->l10n->t('When was the rent last increased? Add a date so we can remind you when a review is due.')
            : $alert['alertWarning'];
    }

    public function remindTask(int $taskId, string $choice, ?string $date, string $userId): void {
        $task = $this->tasks->findTask($taskId, $userId);
        if (!$task) throw new ResourceNotFoundException($this->l10n->t('Task not found.'));
        $until = TaskReminderSchedule::calculate($choice, $date, $this->l10n);
        if ($task->getRuleId() !== null) {
            $this->rules->locked($task->getRuleId(), function ($rule) use ($taskId, $until, $userId) {
                $created = 0;
                $this->synchronize($rule, $userId, $created);
                $this->tasks->deferTask($taskId, $until, $userId);
            });
        } else {
            $this->tasks->deferTask($taskId, $until, $userId);
        }
    }

    public function setReference(int $tenancyId, string $date, string $userId): void {
        $tenancy = $this->tenancies->findForUser($tenancyId, $userId);
        if (!$tenancy || !$this->units->findForUser((int)$tenancy->getUnitId(), $userId)) {
            throw new ResourceNotFoundException($this->l10n->t('Tenancy not found.'));
        }
        if (!InputValidation::date($date) || $date > date('Y-m-d')) {
            throw new \InvalidArgumentException($this->l10n->t('Choose a valid reference date that is not in the future.'));
        }
        $this->rules->saveReference($tenancyId, $date);
    }
}

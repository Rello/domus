<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCA\Domus\Exception\ResourceNotFoundException;

use OCA\Domus\Db\TaskTemplate;
use OCA\Domus\Db\TaskTemplateMapper;
use OCA\Domus\Db\TaskTemplateStep;
use OCA\Domus\Db\TaskTemplateStepMapper;
use OCP\DB\Exception as DbException;
use OCP\IDBConnection;
use OCP\IL10N;

class TaskTemplateService {
    public function __construct(
        private TaskTemplateMapper $templateMapper,
        private TaskTemplateStepMapper $stepMapper,
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    /**
     * @throws DbException
     */
    public function listTemplates(bool $activeOnly = true, ?string $appliesTo = null): array {
        if ($appliesTo !== null && !in_array($appliesTo, ['unit', 'property'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid template entity type.'));
        }
        $templates = $this->templateMapper->findAll($activeOnly ? true : null, $appliesTo);
        $templateIds = array_map(fn(TaskTemplate $template) => $template->getId(), $templates);
        $counts = $this->stepMapper->countByTemplateIds($templateIds);
        foreach ($templates as $template) {
            $template->setStepsCount($counts[$template->getId()] ?? 0);
        }

        return $templates;
    }

    /**
     * @throws DbException
     */
    public function getTemplateWithSteps(int $templateId): TaskTemplate {
        $template = $this->templateMapper->findById($templateId);
        if (!$template) {
            throw new ResourceNotFoundException($this->l10n->t('Task template not found.'));
        }
        $steps = $this->stepMapper->findByTemplate($templateId);
        $template->setSteps($steps);
        $template->setStepsCount(count($steps));

        return $template;
    }

    /**
     * @throws DbException
     */
    public function createTemplate(array $payload): TaskTemplate {
        $key = trim((string)($payload['key'] ?? ''));
        if ($key === '') {
            throw new \InvalidArgumentException($this->l10n->t('Template key is required.'));
        }
        if ($this->templateMapper->findByKey($key)) {
            throw new \InvalidArgumentException($this->l10n->t('Template key already exists.'));
        }
        $name = trim((string)($payload['name'] ?? ''));
        if ($name === '') {
            throw new \InvalidArgumentException($this->l10n->t('Template name is required.'));
        }
        $appliesTo = (string)($payload['appliesTo'] ?? 'unit');
        if (!in_array($appliesTo, ['unit', 'property'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid template entity type.'));
        }

        $template = new TaskTemplate();
        $template->setKey($key);
        $template->setName($name);
        $template->setDescription($payload['description'] ?? null);
        $template->setAppliesTo($appliesTo);
        $template->setIsActive(!empty($payload['isActive']) ? 1 : 0);
        $now = time();
        $template->setCreatedAt($now);
        $template->setUpdatedAt($now);

        return $this->templateMapper->insert($template);
    }

    /**
     * @throws DbException
     */
    public function updateTemplate(int $templateId, array $payload): TaskTemplate {
        $template = $this->templateMapper->findById($templateId);
        if (!$template) {
            throw new ResourceNotFoundException($this->l10n->t('Task template not found.'));
        }

        if ($template->getScopeKey() === 'system') {
            if (array_keys($payload) === ['isActive']) return $this->customize($templateId, !empty($payload['isActive']));
            throw new \InvalidArgumentException($this->l10n->t('Customize the system template before editing it.'));
        }
        if ($template->getSystemTemplateId() !== null && isset($payload['key']) && $payload['key'] !== $template->getKey()) {
            throw new \InvalidArgumentException($this->l10n->t('The key of a customized system template cannot be changed.'));
        }

        if (array_key_exists('key', $payload)) {
            $key = trim((string)$payload['key']);
            if ($key === '') {
                throw new \InvalidArgumentException($this->l10n->t('Template key is required.'));
            }
            $existing = $this->templateMapper->findByKey($key);
            if ($existing && $existing->getId() !== $template->getId()) {
                throw new \InvalidArgumentException($this->l10n->t('Template key already exists.'));
            }
            $template->setKey($key);
        }

        if (array_key_exists('name', $payload)) {
            $name = trim((string)$payload['name']);
            if ($name === '') {
                throw new \InvalidArgumentException($this->l10n->t('Template name is required.'));
            }
            $template->setName($name);
        }

        if (array_key_exists('description', $payload)) {
            $template->setDescription($payload['description'] ?? null);
        }
        if (array_key_exists('appliesTo', $payload)) {
            $appliesTo = (string)$payload['appliesTo'];
            if (!in_array($appliesTo, ['unit', 'property'], true)) {
                throw new \InvalidArgumentException($this->l10n->t('Invalid template entity type.'));
            }
            $template->setAppliesTo($appliesTo);
        }

        if (array_key_exists('isActive', $payload)) {
            $template->setIsActive(!empty($payload['isActive']) ? 1 : 0);
        }

        $template->setUpdatedAt(time());

        return $this->templateMapper->update($template);
    }

    /**
     * @throws DbException
     */
    public function deleteTemplate(int $templateId): void {
        $template = $this->templateMapper->findById($templateId);
        if (!$template) {
            throw new ResourceNotFoundException($this->l10n->t('Task template not found.'));
        }
        if ($template->getScopeKey() === 'system' || $template->getSystemTemplateId() !== null) {
            throw new \InvalidArgumentException($this->l10n->t('Disable this template for this portfolio, or reset its customization.'));
        }
        $this->templateMapper->archive($template);
    }

    /**
     * @throws DbException
     */
    public function reorderSteps(int $templateId, array $orderedStepIds): array {
        $this->assertWritableTemplate($templateId);
        $existing = $this->stepMapper->findByTemplate($templateId);
        $existingIds = array_map(fn(TaskTemplateStep $step) => $step->getId(), $existing);
        $ordered = array_values(array_filter(array_map('intval', $orderedStepIds), fn($id) => in_array($id, $existingIds, true)));

        $this->connection->beginTransaction();
        try {
            $order = 1;
            foreach ($ordered as $id) {
                $step = $this->stepMapper->findById($id);
                if (!$step || $step->getTemplateId() !== $templateId) {
                    continue;
                }
                $step->setSortOrder($order);
                $step->setUpdatedAt(time());
                $this->stepMapper->update($step);
                $order++;
            }
            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }

        return $this->stepMapper->findByTemplate($templateId);
    }

    /**
     * @throws DbException
     */
    public function addOrUpdateStep(int $templateId, array $payload): TaskTemplateStep {
        $this->assertWritableTemplate($templateId);
        $title = trim((string)($payload['title'] ?? ''));
        if ($title === '') {
            throw new \InvalidArgumentException($this->l10n->t('Step title is required.'));
        }
        $description = $payload['description'] ?? null;
        $offset = isset($payload['defaultDueDaysOffset']) ? (int)$payload['defaultDueDaysOffset'] : 0;
        $actionType = trim((string)($payload['actionType'] ?? ''));
        $actionUrl = $payload['actionUrl'] ?? null;
        if ($actionType === '') {
            $actionType = null;
            $actionUrl = null;
        } elseif ($actionType === 'url') {
            $actionUrl = trim((string)$actionUrl);
            if ($actionUrl === '') {
                throw new \InvalidArgumentException($this->l10n->t('Link URL is required.'));
            }
        } else {
            $actionUrl = null;
        }
        $now = time();

        if (!empty($payload['id'])) {
            $step = $this->stepMapper->findById((int)$payload['id']);
            if (!$step || $step->getTemplateId() !== $templateId) {
                throw new ResourceNotFoundException($this->l10n->t('Task step not found.'));
            }
            $step->setTitle($title);
            $step->setDescription($description);
            $step->setDefaultDueDaysOffset($offset);
            if (array_key_exists('allowEarlyCompletion', $payload)) {
                $step->setAllowEarlyCompletion(!empty($payload['allowEarlyCompletion']) ? 1 : 0);
            }
            $step->setActionType($actionType);
            $step->setActionUrl($actionUrl);
            $step->setUpdatedAt($now);
            return $this->stepMapper->update($step);
        }

        $sortOrder = $payload['sortOrder'] ?? null;
        if ($sortOrder === null) {
            $existing = $this->stepMapper->findByTemplate($templateId);
            $sortOrder = count($existing) + 1;
        }

        $step = new TaskTemplateStep();
        $step->setTemplateId($templateId);
        $step->setSortOrder((int)$sortOrder);
        $step->setTitle($title);
        $step->setDescription($description);
        $step->setDefaultDueDaysOffset($offset);
        $step->setAllowEarlyCompletion(!empty($payload['allowEarlyCompletion']) ? 1 : 0);
        $step->setActionType($actionType);
        $step->setActionUrl($actionUrl);
        $step->setCreatedAt($now);
        $step->setUpdatedAt($now);

        return $this->stepMapper->insert($step);
    }

    /**
     * @throws DbException
     */
    public function deleteStep(int $stepId): void {
        $step = $this->stepMapper->findById($stepId);
        if (!$step) {
            throw new ResourceNotFoundException($this->l10n->t('Task step not found.'));
        }
        $this->assertWritableTemplate((int)$step->getTemplateId());
        $this->stepMapper->delete($step);
    }
    private function assertWritableTemplate(int $templateId): TaskTemplate {
        $template = $this->getTemplateWithSteps($templateId);
        if ($template->getScopeKey() === 'system') {
            throw new \InvalidArgumentException($this->l10n->t('Customize the system template before editing it.'));
        }
        return $template;
    }

    public function customize(int $templateId, ?bool $active = null): TaskTemplate {
        $source = $this->templateMapper->findById($templateId);
        if (!$source) throw new ResourceNotFoundException($this->l10n->t('Task template not found.'));
        if ($source->getScopeKey() !== 'system') return $source;
        $steps = $this->stepMapper->findByTemplate($templateId);
        $this->connection->beginTransaction();
        try {
            $copy = new TaskTemplate();
            foreach (['Key', 'Name', 'Description', 'AppliesTo', 'IsActive'] as $field) {
                $copy->{'set' . $field}($source->{'get' . $field}());
            }
            $copy->setSystemTemplateId($templateId);
            $copy->setCreatedAt(time());
            $copy->setUpdatedAt(time());
            if ($active !== null) $copy->setIsActive($active ? 1 : 0);
            $copy = $this->templateMapper->insert($copy);
            $copies = [];
            foreach ($steps as $step) {
                $newStep = new TaskTemplateStep();
                foreach (['SortOrder', 'Title', 'Description', 'DefaultDueDaysOffset', 'AllowEarlyCompletion', 'ActionType', 'ActionUrl'] as $field) {
                    $newStep->{'set' . $field}($step->{'get' . $field}());
                }
                $newStep->setTemplateId($copy->getId());
                $newStep->setCreatedAt(time());
                $newStep->setUpdatedAt(time());
                $copies[] = $this->stepMapper->insert($newStep);
            }
            $copy->setSteps($copies);
            $copy->setStepsCount(count($copies));
            $this->connection->commit();
            return $copy;
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }
    }

    public function reset(int $templateId): TaskTemplate {
        $template = $this->getTemplateWithSteps($templateId);
        if ($template->getScopeKey() === 'system') return $template;
        $system = $this->templateMapper->findSystemByKey($template->getKey());
        if (!$system || (int)$template->getSystemTemplateId() !== (int)$system->getId()) {
            throw new \InvalidArgumentException($this->l10n->t('This template has no system default.'));
        }
        $this->templateMapper->archive($template);
        return $this->getTemplateWithSteps((int)$system->getId());
    }
}

<?php

namespace OCA\Domus\Service;

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
    public function listTemplates(bool $activeOnly = true): array {
        return $this->templateMapper->findAll($activeOnly ? true : null);
    }

    /**
     * @throws DbException
     */
    public function getTemplateWithSteps(int $templateId): TaskTemplate {
        $template = $this->templateMapper->find($templateId);
        if (!$template) {
            throw new \RuntimeException($this->l10n->t('Task template not found.'));
        }
        $steps = $this->stepMapper->findByTemplate($templateId);
        $template->setSteps($steps);

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

        $template = new TaskTemplate();
        $template->setKey($key);
        $template->setName($name);
        $template->setDescription($payload['description'] ?? null);
        $template->setAppliesTo($payload['appliesTo'] ?? 'unit');
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
        $template = $this->templateMapper->find($templateId);
        if (!$template) {
            throw new \RuntimeException($this->l10n->t('Task template not found.'));
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
        $template = $this->templateMapper->find($templateId);
        if (!$template) {
            throw new \RuntimeException($this->l10n->t('Task template not found.'));
        }
        $this->templateMapper->delete($template);
    }

    /**
     * @throws DbException
     */
    public function reorderSteps(int $templateId, array $orderedStepIds): array {
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
        $title = trim((string)($payload['title'] ?? ''));
        if ($title === '') {
            throw new \InvalidArgumentException($this->l10n->t('Step title is required.'));
        }
        $description = $payload['description'] ?? null;
        $offset = isset($payload['defaultDueDaysOffset']) ? (int)$payload['defaultDueDaysOffset'] : 0;
        $now = time();

        if (!empty($payload['id'])) {
            $step = $this->stepMapper->findById((int)$payload['id']);
            if (!$step || $step->getTemplateId() !== $templateId) {
                throw new \RuntimeException($this->l10n->t('Task step not found.'));
            }
            $step->setTitle($title);
            $step->setDescription($description);
            $step->setDefaultDueDaysOffset($offset);
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
            throw new \RuntimeException($this->l10n->t('Task step not found.'));
        }
        $this->stepMapper->delete($step);
    }
}

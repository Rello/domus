<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\TaskTemplate;
use OCA\Domus\Db\TaskTemplateMapper;
use OCP\IL10N;

class TaskTemplateService {
    public function __construct(
        private TaskTemplateMapper $taskTemplateMapper,
        private IL10N $l10n,
    ) {
    }

    public function listTemplatesForUser(string $userId): array {
        return $this->taskTemplateMapper->findByUser($userId);
    }

    public function createTemplate(array $data, string $userId): TaskTemplate {
        $title = trim((string)($data['title'] ?? ''));
        if ($title === '') {
            throw new \InvalidArgumentException($this->l10n->t('Task title is required.'));
        }

        $description = $this->normalizeOptionalText($data['description'] ?? null);
        $required = $this->normalizeBoolFlag($data['required'] ?? null);
        $enabled = $this->normalizeBoolFlag($data['enabled'] ?? true);
        $order = isset($data['order']) ? (int)$data['order'] : ($this->taskTemplateMapper->getMaxOrderForUser($userId) + 1);
        $now = time();

        $template = new TaskTemplate();
        $template->setUserId($userId);
        $template->setScope($this->normalizeScope($data['scope'] ?? 'global'));
        $template->setPropertyId($this->normalizeOptionalInt($data['propertyId'] ?? null));
        $template->setUnitId($this->normalizeOptionalInt($data['unitId'] ?? null));
        $template->setKey($this->normalizeKey($data['key'] ?? null, $title));
        $template->setTitle($title);
        $template->setDescription($description);
        $template->setOrder($order);
        $template->setRequired($required ? 1 : 0);
        $template->setEnabled($enabled ? 1 : 0);
        $template->setTriggerType($this->normalizeOptionalText($data['triggerType'] ?? null));
        $template->setTriggerConfig($this->normalizeOptionalText($data['triggerConfig'] ?? null));
        $template->setCreatedAt($now);
        $template->setUpdatedAt($now);

        return $this->taskTemplateMapper->insert($template);
    }

    public function updateTemplate(int $id, array $data, string $userId): TaskTemplate {
        $template = $this->getTemplate($id, $userId);

        if (array_key_exists('title', $data)) {
            $title = trim((string)$data['title']);
            if ($title === '') {
                throw new \InvalidArgumentException($this->l10n->t('Task title is required.'));
            }
            $template->setTitle($title);
        }

        if (array_key_exists('description', $data)) {
            $template->setDescription($this->normalizeOptionalText($data['description']));
        }

        if (array_key_exists('required', $data)) {
            $template->setRequired($this->normalizeBoolFlag($data['required']) ? 1 : 0);
        }

        if (array_key_exists('enabled', $data)) {
            $template->setEnabled($this->normalizeBoolFlag($data['enabled']) ? 1 : 0);
        }

        if (array_key_exists('order', $data)) {
            $template->setOrder((int)$data['order']);
        }

        $template->setUpdatedAt(time());
        return $this->taskTemplateMapper->update($template);
    }

    public function reorderTemplates(string $userId, array $orderedIds): array {
        $templates = $this->taskTemplateMapper->findByUser($userId);
        if ($templates === []) {
            return [];
        }

        $byId = [];
        foreach ($templates as $template) {
            $byId[(int)$template->getId()] = $template;
        }

        $order = 1;
        $seen = [];
        foreach ($orderedIds as $id) {
            $id = (int)$id;
            if (!isset($byId[$id])) {
                continue;
            }
            $template = $byId[$id];
            $template->setOrder($order++);
            $template->setUpdatedAt(time());
            $this->taskTemplateMapper->update($template);
            $seen[$id] = true;
        }

        foreach ($templates as $template) {
            $id = (int)$template->getId();
            if (isset($seen[$id])) {
                continue;
            }
            $template->setOrder($order++);
            $template->setUpdatedAt(time());
            $this->taskTemplateMapper->update($template);
        }

        return $this->taskTemplateMapper->findByUser($userId);
    }

    private function getTemplate(int $id, string $userId): TaskTemplate {
        $template = $this->taskTemplateMapper->findForUser($id, $userId);
        if (!$template) {
            throw new \RuntimeException($this->l10n->t('Task template not found.'));
        }

        return $template;
    }

    private function normalizeOptionalText(mixed $value): ?string {
        if ($value === null) {
            return null;
        }
        $normalized = trim((string)$value);
        return $normalized === '' ? null : $normalized;
    }

    private function normalizeOptionalInt(mixed $value): ?int {
        if ($value === null || $value === '') {
            return null;
        }
        return (int)$value;
    }

    private function normalizeBoolFlag(mixed $value): bool {
        if ($value === null) {
            return false;
        }
        if (is_bool($value)) {
            return $value;
        }
        if (is_numeric($value)) {
            return (int)$value === 1;
        }
        $normalized = strtolower(trim((string)$value));
        return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
    }

    private function normalizeScope(mixed $value): string {
        $scope = strtolower(trim((string)$value));
        if (!in_array($scope, ['global', 'property', 'unit'], true)) {
            return 'global';
        }
        return $scope;
    }

    private function normalizeKey(?string $value, string $title): string {
        if ($value !== null && trim($value) !== '') {
            return trim($value);
        }
        $slug = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $title) ?? 'task');
        $slug = trim($slug, '-');
        return ($slug ?: 'task') . '-' . substr((string)time(), -6) . '-' . random_int(100, 999);
    }
}

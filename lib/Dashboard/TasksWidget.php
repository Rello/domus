<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Dashboard;

use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\TaskService;
use OCA\Domus\Service\WorkflowRunService;
use OCP\Dashboard\IButtonWidget;
use OCP\Dashboard\IConditionalWidget;
use OCP\Dashboard\IIconWidget;
use OCP\Dashboard\IReloadableWidget;
use OCP\Dashboard\Model\WidgetButton;
use OCP\Dashboard\Model\WidgetItem;
use OCP\Dashboard\Model\WidgetItems;
use OCP\IConfig;
use OCP\IL10N;
use OCP\IURLGenerator;

/** Standard Dashboard API proof of concept for the landlord's selected portfolio. */
class TasksWidget implements IReloadableWidget, IButtonWidget, IIconWidget, IConditionalWidget {
    public function __construct(
        private ManagementAccessContext $access,
        private TaskService $tasks,
        private WorkflowRunService $workflows,
        private IURLGenerator $urls,
        private IL10N $l10n,
        private IConfig $config,
        private UnitMapper $units,
    ) {
    }

    public function getId(): string { return 'domus-tasks'; }
    public function getTitle(): string { return $this->l10n->t('Domus tasks'); }
    public function getOrder(): int { return 50; }
    public function getIconClass(): string { return ''; }
    public function getIconUrl(): string { return $this->iconUrl('dashboard-app'); }
    public function getUrl(): ?string { return $this->urls->linkToRouteAbsolute('domus.page.index'); }
    public function load(): void {}
    public function getReloadInterval(): int { return 60; }

    public function isEnabled(): bool {
        try {
            $this->access->managementUserId();
            return true;
        } catch (\DomainException|\RuntimeException) {
            return false;
        }
    }

    public function getWidgetButtons(string $userId): array {
        return [new WidgetButton(WidgetButton::TYPE_MORE, $this->getUrl(), $this->l10n->t('Open Domus'))];
    }

    public function getItemsV2(string $userId, ?string $since = null, int $limit = 7): WidgetItems {
        // Dashboard requests do not carry Domus's role header. The PoC uses the
        // landlord view and the existing saved Personal/Team scope, with fresh access checks.
        if (!$this->isEnabled() || $this->access->actorUserId() !== $userId) {
            return new WidgetItems([], $this->l10n->t('No upcoming tasks.'));
        }
        $owner = $this->access->managementUserId();
        $rows = $this->workflows->listOpenStepsForUser($owner, 'landlord', true);
        foreach ($this->tasks->listOpenTasks($owner, 'landlord', null, null, true) as $task) {
            $rows[] = [
                'title' => $task->getTitle(),
                'dueDate' => $task->getEffectiveDueDate(),
                'entityId' => $task->getEntityId(),
            ];
        }
        try {
            $timezone = new \DateTimeZone($this->config->getUserValue($userId, 'core', 'timezone', date_default_timezone_get()));
        } catch (\Exception) {
            $timezone = new \DateTimeZone(date_default_timezone_get());
        }
        $today = new \DateTimeImmutable('today', $timezone);
        $lastDate = $today->modify('+7 days')->format('Y-m-d');
        $todayDate = $today->format('Y-m-d');
        $rows = array_values(array_filter($rows, static function (array $row) use ($lastDate): bool {
            $value = $row['dueDate'] ?? '';
            if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) return false;
            $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);
            return $date !== false && $date->format('Y-m-d') === $value && $value <= $lastDate;
        }));
        usort($rows, static fn(array $a, array $b) => [$a['dueDate'], $a['title'], $a['entityId']] <=> [$b['dueDate'], $b['title'], $b['entityId']]);
        $rows = array_slice($rows, 0, max(0, min($limit, 100)));
        $unitNames = [];
        foreach ($this->units->findForUserByIds(array_unique(array_column($rows, 'entityId')), $owner) as $unit) {
            $unitNames[$unit->getId()] = $unit->getLabel();
        }
        $items = [];
        // Return a full snapshot so closed/rescheduled items disappear on refresh.
        foreach ($rows as $row) {
            $due = $row['dueDate'];
            $status = $due < $todayDate ? 'overdue' : ($due === $todayDate ? 'today' : 'upcoming');
            $subtitle = $unitNames[$row['entityId']] ?? '';
            $link = $this->getUrl() . 'unitDetail/' . (int)$row['entityId'];
            $items[] = new WidgetItem(
                isset($row['stepId']) ? $this->l10n->t($row['title']) : $row['title'],
                $subtitle,
                $link,
                $this->iconUrl('dashboard-' . $status),
            );
        }
        return new WidgetItems($items, $this->l10n->t('No upcoming tasks.'));
    }

    private function iconUrl(string $name): string {
        return $this->urls->getAbsoluteURL($this->urls->imagePath('domus', $name . '.svg'));
    }
}

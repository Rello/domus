<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;
use OCP\IConfig;
use Psr\Log\LoggerInterface;
use OCP\TaskProcessing\IManager;
use OCP\TaskProcessing\Task;
use OCP\TaskProcessing\TaskTypes\TextToTextChat;

class BookingAssignmentPreviewService {
    public function __construct(private ManagementAccessContext $access, private UnitMapper $units,
        private BookingAssignmentPdfParser $parser, private BookingAssignmentResult $result, private IL10N $l10n,
        private IConfig $config, private LoggerInterface $logger, private AiDocumentValidationService $aiValidation) {}

    /** Temporary opt-in diagnostics; expire automatically without changing global log verbosity. */
    private function trace(string $stage, array $details = []): void {
        if ((int)$this->config->getAppValue('domus', 'bookingPreviewTraceUntil', '0') <= time()) return;
        $this->logger->warning('Temporary booking preview timing', [
            'app' => 'domus',
            'stage' => $stage,
            'timestampUtc' => (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.u\Z'),
        ] + $details);
    }

    private function elapsedMs(int $start): float {
        return round((hrtime(true) - $start) / 1000000, 2);
    }

    private function binding(int $unitId): string {
        $unit = $unitId === 0 ? true : $this->units->findForUser($unitId, $this->access->managementUserId());
        if ($unit === null) throw new \DomainException($this->l10n->t('Unit not found.'));
        return 'booking-preview:' . $unitId . ':' . hash('sha256', json_encode([$this->access->actorUserId(), $this->access->activeTeamId()]));
    }

    protected function manager(): IManager {
        try {
            return \OCP\Server::get(IManager::class);
        } catch (\Throwable $e) {
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('AI task processing is unavailable.'), 0, $e);
        }
    }

    public function create(int $unitId, ?string $path, ?array $upload): array {
        $binding = $this->binding($unitId);
        $status = $this->aiValidation->status();
        if (!$status['enabled'] || !$status['available']) {
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('AI document validation is disabled or unavailable.'));
        }
        if (($path !== null && $path !== '') === ($upload !== null)) throw new \InvalidArgumentException($this->l10n->t('Select exactly one PDF.'));
        $manager = $this->manager();
        $actor = $this->access->actorUserId();
        if (!in_array(TextToTextChat::ID, $manager->getAvailableTaskTypeIds(false, $actor), true)) {
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('No AI chat provider is available.'));
        }
        $traceId = bin2hex(random_bytes(8));
        $started = hrtime(true);
        $details = ['traceId' => $traceId, 'unitId' => $unitId, 'source' => $upload !== null ? 'upload' : 'nextcloud'];
        $this->trace('pdfPreparationStarted', $details);
        try {
            $text = $this->parser->extract($actor, $path, $upload);
        } catch (\Throwable $e) {
            $this->trace('pdfPreparationFailed', $details + ['elapsedMs' => $this->elapsedMs($started), 'errorClass' => get_class($e)]);
            throw $e;
        }
        $this->trace('pdfPreparationFinished', $details + ['elapsedMs' => $this->elapsedMs($started), 'textBytes' => strlen($text)]);
        $scheduleStarted = hrtime(true);
        $this->trace('schedulingStarted', $details);
        $identity = '';
        if ($unitId === 0) {
            preg_match_all('/^.*\b(?:Objekt|WEG|WEB|Einheit(?:snummer|s[- ]?Nr\.?)?)\b[^\r\n]*$/imu', $text, $lines);
            $identity = implode("\n", array_unique($lines[0]));
        }
        $text = BookingAssignmentPageSelector::select($text);
        if ($identity !== '') $text .= "\n\nDocument identification excerpts:\n" . $identity;
        $task = new Task(TextToTextChat::ID, ['system_prompt' => BookingAssignmentResult::PROMPT, 'input' => $text, 'history' => []], 'domus', $actor, $binding);
        try {
            // Nextcloud supplies provider defaults/limits and owns scheduling and expiry.
            $manager->scheduleTask($task);
        } catch (\Throwable $e) {
            $this->trace('schedulingFailed', $details + ['elapsedMs' => $this->elapsedMs($scheduleStarted), 'errorClass' => get_class($e)]);
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('Unable to schedule AI processing. Check provider availability and document size.'), 0, $e);
        }
        $this->trace('taskScheduled', $details + ['taskId' => $task->getId(), 'schedulingMs' => $this->elapsedMs($scheduleStarted), 'preparationTotalMs' => $this->elapsedMs($started)]);
        return ['taskId' => $task->getId()];
    }

    private function task(int $unitId, int $taskId, IManager $manager): Task {
        $binding = $this->binding($unitId);
        $task = $manager->getUserTask($taskId, $this->access->actorUserId());
        if ($task->getAppId() !== 'domus' || $task->getTaskTypeId() !== TextToTextChat::ID || $task->getCustomId() !== $binding || $task->getUserId() !== $this->access->actorUserId()) {
            throw new \DomainException($this->l10n->t('Preview task is not accessible.'));
        }
        return $task;
    }

    public function show(int $unitId, int $taskId): array {
        $task = $this->task($unitId, $taskId, $this->manager());
        $scheduled = $task->getScheduledAt();
        $started = $task->getStartedAt();
        $ended = $task->getEndedAt();
        $this->trace('taskObserved', [
            'unitId' => $unitId, 'taskId' => $taskId, 'status' => $task->getStatus(),
            'scheduledAt' => $scheduled, 'startedAt' => $started, 'endedAt' => $ended,
            'queueSeconds' => $scheduled !== null ? ($started ?? time()) - $scheduled : null,
            'executionSeconds' => $started !== null ? ($ended ?? time()) - $started : null,
            'progress' => $task->getProgress(),
        ]);
        if (in_array($task->getStatus(), [Task::STATUS_FAILED, Task::STATUS_CANCELLED], true)) throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('AI processing failed or was cancelled.'));
        if ($task->getStatus() !== Task::STATUS_SUCCESSFUL) {
            return [
                'status' => 'processing',
                'phase' => match ($task->getStatus()) {
                    Task::STATUS_SCHEDULED => 'queued',
                    Task::STATUS_RUNNING => 'running',
                    default => 'pending',
                },
                'progress' => $task->getProgress(),
            ];
        }
        $output = $task->getOutput()['output'] ?? '';
        if (is_string($output) && trim($output) === '') {
            $this->trace('resultEmpty', ['taskId' => $taskId]);
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('The AI provider returned an empty answer. Test again or check the AI provider logs.'));
        }
        $validationStarted = hrtime(true);
        try {
            $result = $this->result->normalize($output, $task->getInput()['input']);
        } catch (\Throwable $e) {
            $this->trace('resultValidationFailed', ['taskId' => $taskId, 'elapsedMs' => $this->elapsedMs($validationStarted), 'errorClass' => get_class($e)]);
            throw new \OCA\Domus\Exception\BookingAssignmentException($this->l10n->t('The AI returned unusable output. Test again or enter the amounts manually.'), 0, $e);
        }
        if ($unitId === 0) {
            $result['unitIdentification'] = BookingAssignmentUnitMatcher::inspect($task->getInput()['input'], $this->units->findByUser($this->access->managementUserId()));
            $result['unitId'] = $result['unitIdentification']['unitId'];
        }
        $this->trace('resultReady', ['taskId' => $taskId, 'validationMs' => $this->elapsedMs($validationStarted)]);
        return ['status' => 'complete', 'result' => $result];
    }

    public function discard(int $unitId, int $taskId): void {
        $manager = $this->manager();
        $task = $this->task($unitId, $taskId, $manager);
        if (in_array($task->getStatus(), [Task::STATUS_SCHEDULED, Task::STATUS_RUNNING], true)) $manager->cancelTask($taskId);
        $manager->deleteTask($task);
        $this->trace('taskDiscarded', ['taskId' => $taskId, 'unitId' => $unitId]);
    }
}

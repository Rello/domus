<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Exception\{ConflictException, ResourceNotFoundException};
use OCP\Files\{File, Folder, IRootFolder};
use OCP\{IDBConnection, IL10N};

/** Resumable file copies followed by a single database ownership cutover. */
class UnitMoveService {
    public function __construct(
        private UnitMoveDataService $data,
        private ManagementAccessContext $access,
        private TeamIntegrationService $teams,
        private UnitFolderService $folders,
        private UnitMoveGuard $guard,
        private IRootFolder $root,
        private IDBConnection $db,
        private IL10N $l10n,
        private ?AuditService $audit = null,
    ) {}

    public function status(int $unitId): array {
        $userId = $this->access->legacyOwnerUserId();
        $job = $this->job($unitId, $userId);
        return $job ? $this->summary($job) : ['status' => 'new'];
    }

    public function preview(int $unitId, string $teamId): array {
        $userId = $this->access->legacyOwnerUserId();
        $graph = $this->data->inventory($unitId, $userId);
        $folder = $this->teamFolder($teamId, $userId);
        $entries = $this->inventoryFiles($graph, $userId, $folder);
        $name = $this->destinationName($graph, $folder);
        return [
            'status' => 'preview', 'teamId' => $teamId,
            'sourceFolderMissing' => $entries[0]['id'] === 0,
            'token' => $this->token($graph, $entries, $teamId, (int)$folder->getId(), $name),
            'destination' => $this->folders->path($userId, $folder) . '/' . $name,
            'files' => count(array_filter($entries, fn($entry) => !$entry['folder'])),
            'folders' => count(array_filter($entries, fn($entry) => $entry['folder'])),
            'bytes' => array_sum(array_column($entries, 'size')),
            'tenancies' => count($graph['domus_tenancies']), 'bookings' => count($graph['domus_bookings']),
            'contacts' => count($graph['domus_partners']), 'tasks' => count($graph['domus_tasks']),
            'activities' => count($graph['domus_action_logs']),
            'workflowRuns' => count($graph['domus_workflow_runs']), 'taskSteps' => count($graph['domus_task_steps']),
        ];
    }

    public function start(int $unitId, string $teamId, string $token): array {
        return $this->locked(function (string $userId) use ($unitId, $teamId, $token) {
            $job = $this->job($unitId, $userId);
            if ($job && $job['status'] !== 'cancelled') {
                if ($job['team_id'] !== $teamId) throw new ConflictException($this->l10n->t('Cancel the existing move before choosing another Team.'));
                $this->teams->assertTeamAdmin($teamId);
                return $this->summary($job);
            }
            $this->guard->assertWritable($userId);
            $graph = $this->data->inventory($unitId, $userId);
            $folder = $this->teamFolder($teamId, $userId);
            $entries = $this->inventoryFiles($graph, $userId, $folder);
            $name = $this->destinationName($graph, $folder);
            if (!hash_equals($this->token($graph, $entries, $teamId, (int)$folder->getId(), $name), $token)) $this->changed();
            $free = $folder->getFreeSpace();
            if ($free >= 0 && $free < array_sum(array_column($entries, 'size'))) {
                throw new ConflictException($this->l10n->t('The Team folder does not have enough free space.'));
            }
            $payload = ['graph' => $graph, 'entries' => $entries, 'copied' => [], 'verified' => 0,
                'teamFolderId' => (int)$folder->getId(), 'targetName' => $name, 'targetId' => null,
                'destination' => $this->folders->path($userId, $folder) . '/' . $name];
            $values = ['unit_id' => $unitId, 'user_id' => $userId, 'team_id' => $teamId, 'status' => 'copying', 'data' => json_encode($payload, JSON_THROW_ON_ERROR)];
            if ($job) {
                $this->data->update('domus_unit_moves', (int)$job['id'], $values);
                $values['id'] = $job['id'];
            } else {
                $values['id'] = $this->data->insert('domus_unit_moves', $values);
            }
            $this->auditMove('started', $values);
            return $this->summary($values);
        });
    }

    public function advance(int $unitId): array {
        return $this->locked(function (string $userId) use ($unitId) {
            $job = $this->job($unitId, $userId);
            if (!$job) throw new ResourceNotFoundException($this->l10n->t('Unit move not found.'));
            $this->teams->assertTeamAdmin($job['team_id']);
            if ($job['status'] !== 'copying') return $this->summary($job);
            try {
                $payload = json_decode($job['data'], true, 512, JSON_THROW_ON_ERROR);
                $teamFolder = $this->teamFolder($job['team_id'], $userId);
                if ((int)$teamFolder->getId() !== $payload['teamFolderId']) $this->changed();
                $target = $this->targetFolder($teamFolder, $payload);
                $this->save($job, $payload);
                $started = microtime(true);
                $processed = 0;
                foreach ($payload['entries'] as $index => $entry) {
                    if (isset($payload['copied'][$index])) continue;
                    $payload['copied'][$index] = $this->copyEntry($entry, $target, $userId);
                    $this->save($job, $payload);
                    if (++$processed >= 10 || microtime(true) - $started > 8) return $this->summary($job);
                }
                // Verify in bounded batches too, including recovered copies after a lost response.
                while ($payload['verified'] < count($payload['entries'])) {
                    $index = $payload['verified'];
                    $entry = $payload['entries'][$index];
                    $copy = $payload['copied'][$index];
                    $node = $entry['path'] === '' ? $target : $target->get($entry['path']);
                    if ((int)$node->getId() !== $copy['id'] || !$node->isReadable()) $this->changed();
                    if (!$entry['folder']) {
                        $source = $this->sourceFile($userId, $entry['id']);
                        if ((string)$source->getEtag() !== $entry['etag'] || !$node instanceof File || $this->hash($node) !== $copy['hash']) $this->changed();
                    } elseif (!$node instanceof Folder) $this->changed();
                    $payload['verified']++;
                    $this->save($job, $payload);
                    if (++$processed >= 10 || microtime(true) - $started > 8) return $this->summary($job);
                }
                $this->db->beginTransaction();
                try {
                    $graph = $this->data->inventory($unitId, $userId);
                    if ($this->data->fingerprint($graph) !== $this->data->fingerprint($payload['graph'])
                        || $this->inventoryFiles($graph, $userId, $teamFolder) !== $payload['entries']) $this->changed();
                    foreach ($payload['entries'] as $index => $entry) {
                        $node = $entry['path'] === '' ? $target : $target->get($entry['path']);
                        $copy = $payload['copied'][$index];
                        if ((int)$node->getId() !== $copy['id'] || !$node->isReadable()
                            || (!$entry['folder'] && (string)$node->getEtag() !== $copy['etag'])) $this->changed();
                    }
                    $this->teams->clearRequestCache();
                    $this->teams->assertTeamAdmin($job['team_id']);
                    $mapping = [];
                    foreach ($payload['entries'] as $index => $entry) if (!$entry['folder']) $mapping[$entry['id']] = $payload['copied'][$index]['id'];
                    $path = $this->folders->path($userId, $target);
                    $this->data->transfer($graph, $job['team_id'], $userId, $mapping, (int)$target->getId(), $path);
                    $job['status'] = 'complete';
                    // Retain a compact audit journal, not a second copy of all personal data.
                    $payload = ['destination' => $path, 'targetId' => (int)$target->getId(), 'fileMap' => $mapping, 'completedAt' => time()];
                    $this->save($job, $payload);
                    $this->db->commit();
                } catch (\Throwable $e) {
                    $this->db->rollBack();
                    throw $e;
                }
            } catch (\Throwable $e) {
                $this->auditMove('failed', $job);
                throw $e;
            }
            $this->auditMove('completed', $job);
            return $this->summary($job);
        });
    }

    public function cancel(int $unitId): array {
        return $this->locked(function (string $userId) use ($unitId) {
            $job = $this->job($unitId, $userId);
            if (!$job) return ['status' => 'cancelled'];
            if (in_array($job['status'], ['complete', 'cancelled'], true)) return $this->summary($job);
            // Cancellation never deletes files, including files another Team member may have edited.
            $payload = json_decode($job['data'], true, 512, JSON_THROW_ON_ERROR);
            $job['status'] = 'cancelled';
            $this->save($job, ['destination' => $payload['destination'], 'targetId' => $payload['targetId']]);
            $this->auditMove('cancelled', $job);
            return $this->summary($job);
        });
    }

    private function auditMove(string $action, array $job): void {
        $this->audit?->record('unit_move.' . $action, (int)$job['unit_id'], $job['user_id'], null,
            ['destinationTeam' => $job['team_id'], 'transferId' => (int)$job['id']]);
    }

    private function locked(callable $operation): array {
        $userId = $this->access->legacyOwnerUserId();
        $this->guard->acquire($userId, true);
        try { return $operation($userId); }
        finally { $this->guard->release($userId, true); }
    }

    private function job(int $unitId, string $userId): ?array {
        return $this->data->rows('domus_unit_moves', ['unit_id' => $unitId, 'user_id' => $userId])[0] ?? null;
    }

    private function save(array &$job, array $payload): void {
        $job['data'] = json_encode($payload, JSON_THROW_ON_ERROR);
        $this->data->update('domus_unit_moves', (int)$job['id'], ['status' => $job['status'], 'data' => $job['data']]);
    }

    private function summary(array $job): array {
        $payload = json_decode($job['data'], true, 512, JSON_THROW_ON_ERROR);
        return ['status' => $job['status'], 'teamId' => $job['team_id'], 'unitId' => (int)$job['unit_id'],
            'destination' => $payload['destination'], 'copied' => count($payload['copied'] ?? []),
            'total' => count($payload['entries'] ?? []), 'verified' => $payload['verified'] ?? 0];
    }

    private function token(array $graph, array $entries, string $teamId, int $folderId, string $name): string {
        return hash('sha256', json_encode([$graph, $entries, $teamId, $folderId, $name], JSON_THROW_ON_ERROR));
    }

    private function destinationName(array $graph, Folder $folder): string {
        $base = basename(rtrim($graph['domus_units'][0]['document_path'], '/'));
        $name = $base;
        for ($suffix = 2; $folder->nodeExists($name); $suffix++) {
            $ending = ' (' . $suffix . ')';
            $name = mb_strcut($base, 0, 255 - strlen($ending), 'UTF-8') . $ending;
        }
        return $name;
    }

    private function teamFolder(string $teamId, string $userId): Folder {
        $details = $this->teams->getTeamFolder($teamId);
        if (!$details || empty($details['mountPoint'])) throw new ConflictException($this->l10n->t('This Team has no accessible Team folder.'));
        $folder = $this->root->getUserFolder($userId)->get(trim($details['mountPoint'], '/'));
        if (!$folder instanceof Folder || !$folder->isReadable() || !$folder->isCreatable()) {
            throw new ConflictException($this->l10n->t('This Team has no accessible Team folder.'));
        }
        return $folder;
    }

    private function inventoryFiles(array $graph, string $userId, Folder $destination): array {
        $unit = $graph['domus_units'][0];
        $userFolder = $this->root->getUserFolder($userId);
        $sourcePath = trim((string)$unit['document_path'], '/');
        if ($sourcePath === '' || in_array('..', explode('/', $sourcePath), true)) throw new \InvalidArgumentException($this->l10n->t('Select a dedicated unit folder.'));
        $source = $userFolder->nodeExists($sourcePath) ? $userFolder->get($sourcePath) : null;
        if ($source !== null && (!$source instanceof Folder || !$source->isReadable())) throw new ConflictException($this->l10n->t('The unit folder is not accessible.'));
        if ($source && (str_starts_with($destination->getPath() . '/', $source->getPath() . '/') || str_starts_with($source->getPath() . '/', $destination->getPath() . '/'))) {
            throw new ConflictException($this->l10n->t('Source and destination folders must be separate.'));
        }
        $entries = [];
        $seen = [];
        $seenFolders = [];
        $walk = function ($node, string $path) use (&$walk, &$entries, &$seen, &$seenFolders) {
            if (!$node->isReadable()) throw new ConflictException($this->l10n->t('The unit folder is not accessible.'));
            $folder = $node instanceof Folder;
            if ($folder && isset($seenFolders[(int)$node->getId()])) $this->changed();
            if ($folder) $seenFolders[(int)$node->getId()] = true;
            $entries[] = ['id' => (int)$node->getId(), 'path' => $path, 'folder' => $folder,
                'size' => $folder ? 0 : (int)$node->getSize(), 'etag' => $folder ? '' : (string)$node->getEtag()];
            if (!$folder) $seen[(int)$node->getId()] = true;
            else {
                $children = $node->getDirectoryListing();
                usort($children, fn($a, $b) => strcmp($a->getName(), $b->getName()));
                foreach ($children as $child) $walk($child, $path === '' ? $child->getName() : $path . '/' . $child->getName());
            }
        };
        if ($source !== null) $walk($source, '');
        else $entries[] = ['id' => 0, 'path' => '', 'folder' => true, 'size' => 0, 'etag' => ''];
        $fileIds = array_column($graph['domus_docLinks'], 'file_id');
        if ($unit['image_file_id']) $fileIds[] = $unit['image_file_id'];
        $fileIds = array_unique(array_map('intval', $fileIds));
        sort($fileIds);
        $externalFolder = 'Linked documents';
        $paths = array_column($entries, 'path');
        while (in_array($externalFolder, $paths, true)) $externalFolder .= '-';
        foreach ($fileIds as $id) {
            if (isset($seen[$id])) continue;
            $file = $this->sourceFile($userId, $id);
            if (!in_array($externalFolder, array_column($entries, 'path'), true)) {
                $entries[] = ['id' => 0, 'path' => $externalFolder, 'folder' => true, 'size' => 0, 'etag' => ''];
            }
            $entries[] = ['id' => 0, 'path' => $externalFolder . '/' . $id, 'folder' => true, 'size' => 0, 'etag' => ''];
            $walk($file, $externalFolder . '/' . $id . '/' . $file->getName());
        }
        return $entries;
    }

    private function sourceFile(string $userId, int $id): File {
        foreach ($this->root->getUserFolder($userId)->getById($id) as $file) {
            if ($file instanceof File && $file->isReadable()) return $file;
        }
        throw new ResourceNotFoundException($this->l10n->t('A linked file is missing or unreadable.'));
    }

    private function targetFolder(Folder $teamFolder, array &$payload): Folder {
        $name = $payload['targetName'];
        if ($payload['targetId'] !== null && !$teamFolder->nodeExists($name)) $this->changed();
        // Never adopt or merge an existing folder that this move did not record.
        if ($payload['targetId'] === null && $teamFolder->nodeExists($name)) $this->changed();
        $node = $teamFolder->nodeExists($name) ? $teamFolder->get($name) : $teamFolder->newFolder($name);
        if (!$node instanceof Folder || !$node->isCreatable() || ($payload['targetId'] !== null && (int)$node->getId() !== $payload['targetId'])) $this->changed();
        $payload['targetId'] = (int)$node->getId();
        return $node;
    }

    private function copyEntry(array $entry, Folder $target, string $userId): array {
        if ($entry['path'] === '') return ['id' => (int)$target->getId()];
        if ($entry['folder']) {
            $node = $target->nodeExists($entry['path']) ? $target->get($entry['path']) : $target->newFolder($entry['path']);
            if (!$node instanceof Folder) $this->changed();
            return ['id' => (int)$node->getId()];
        }
        $source = $this->sourceFile($userId, $entry['id']);
        if ((string)$source->getEtag() !== $entry['etag']) $this->changed();
        $hash = $this->hash($source);
        if ($target->nodeExists($entry['path'])) {
            $node = $target->get($entry['path']);
        } else {
            $stream = $source->fopen('rb');
            if (!is_resource($stream)) $this->changed();
            try { $node = $target->newFile($entry['path'], $stream); }
            finally { if (is_resource($stream)) fclose($stream); }
        }
        if (!$node instanceof File || (int)$node->getSize() !== $entry['size'] || $this->hash($node) !== $hash || (string)$source->getEtag() !== $entry['etag']) $this->changed();
        return ['id' => (int)$node->getId(), 'hash' => $hash, 'etag' => (string)$node->getEtag()];
    }

    private function hash(File $file): string {
        $stream = $file->fopen('rb');
        if (!is_resource($stream)) $this->changed();
        try {
            $context = hash_init('sha256');
            if (hash_update_stream($context, $stream) === false) $this->changed();
            return hash_final($context);
        } finally { if (is_resource($stream)) fclose($stream); }
    }

    private function changed(): never {
        throw new ConflictException($this->l10n->t('The unit or its files changed. Cancel the move and start again.'));
    }
}

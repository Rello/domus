<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\FinancialHistoryMapper;
use OCA\Domus\Exception\{ConflictException, ResourceNotFoundException};
use OCP\IL10N;

/** Preview and removal use the same graph; all changes are database-only and atomic. */
class FinancialHistoryService {
    public function __construct(
        private FinancialHistoryMapper $mapper,
        private ManagementAccessContext $access,
        private IL10N $l10n,
        private AuditService $audit,
    ) {}

    public function preview(int $year, ?int $unitId, ?int $propertyId): array {
        $this->access->assertCapability('deleteRecords');
        return $this->describe($this->plan($year, $unitId, $propertyId));
    }

    public function remove(int $year, ?int $unitId, ?int $propertyId, string $token): array {
        $this->access->assertCapability('deleteRecords');
        // Authorize outside the transaction so its first consistent read follows the locks.
        $initial = $this->plan($year, $unitId, $propertyId);
        $result = $this->mapper->transaction(function () use ($year, $unitId, $propertyId, $token, $initial) {
            $userId = $initial['userId'];
            $this->mapper->lockScope($propertyId !== null ? 'domus_properties' : 'domus_units', $propertyId ?? $unitId, $userId);
            foreach ($initial['units'] as $unit) $this->mapper->lockScope('domus_units', (int)$unit['id'], $userId);
            foreach (['bookings' => 'domus_bookings', 'deleteTenancies' => 'domus_tenancies', 'adjustTenancies' => 'domus_tenancies',
                'documents' => 'domus_doclinks', 'relations' => 'domus_partner_rel', 'activities' => 'domus_action_logs',
                'tasks' => 'domus_tasks', 'closures' => 'domus_booking_years'] as $key => $table) {
                foreach ($initial[$key] as $row) $this->mapper->lockScope($table, (int)$row['id'], $userId, !in_array($key, ['tasks', 'closures'], true));
            }
            $plan = $this->plan($year, $unitId, $propertyId);
            $preview = $this->describe($plan);
            if ($token === '' || !hash_equals($preview['token'], $token)) {
                throw new ConflictException($this->l10n->t('Financial history changed. Create a new preview before removing it.'));
            }
            if ($preview['blockers'] !== []) throw new ConflictException(implode(' ', $preview['blockers']));
            if (!$preview['hasChanges']) throw new ConflictException($this->l10n->t('There is no financial history before this year.'));

            // Retarget links in place: keep files, document metadata and link IDs accessible.
            foreach ($plan['documents'] as $document) {
                $parent = $plan['parents'][$document['entity_type'] . ':' . $document['entity_id']];
                $this->mapper->change('domus_doclinks', $document, [
                    'entity_type' => $parent['type'], 'entity_id' => $parent['id'],
                ], $userId);
            }
            foreach ($plan['adjustTenancies'] as $tenancy) {
                $note = $this->adjustmentNote($plan, $tenancy);
                $conditions = (string)($tenancy['conditions'] ?? '');
                $this->mapper->change('domus_tenancies', $tenancy, [
                    'start_date' => $plan['cutoff'], 'conditions' => ($conditions === '' ? '' : $conditions . "\n\n") . $note,
                    'updated_at' => time(),
                ], $userId);
            }
            foreach ($plan['relations'] as $row) $this->mapper->change('domus_partner_rel', $row, [], $userId);
            foreach ($plan['activities'] as $row) $this->mapper->change('domus_action_logs', $row, [], $userId);
            // Rule tasks live on the unit. Close obsolete reminders, retaining occurrence links
            // so background evaluation cannot recreate them for deleted tenancy IDs.
            foreach ($plan['tasks'] as $row) $this->mapper->change('domus_tasks', $row, [
                'rule_tenancy_id' => null, 'status' => 'closed', 'closed_at' => time(),
                'closed_by' => $userId, 'updated_at' => time(),
            ], $userId, false);
            foreach ($plan['deleteTenancies'] as $row) {
                $this->mapper->removeRuleContext((int)$row['id']);
                $this->mapper->change('domus_tenancies', $row, [], $userId);
            }
            foreach ($plan['bookings'] as $row) $this->mapper->change('domus_bookings', $row, [], $userId);
            foreach ($plan['closures'] as $row) $this->mapper->change('domus_booking_years', $row, [], $userId, false);
            return $preview;
        });
        $this->audit->record('financial_history.deleted', $propertyId ?? $unitId, $this->access->managementUserId(), $this->access->activeTeamId(), [
            'scopeType' => $propertyId !== null ? 'property' : 'unit', 'beforeYear' => $year,
            'bookings' => count($result['bookings']), 'deletedTenancies' => count($result['deleteTenancies']),
            'adjustedTenancies' => count($result['adjustTenancies']),
        ]);
        return [
            'year' => $year, 'removedBookings' => count($result['bookings']),
            'deletedTenancies' => count($result['deleteTenancies']), 'adjustedTenancies' => count($result['adjustTenancies']),
            'preservedDocuments' => $result['preservedDocuments'],
        ];
    }

    private function plan(int $year, ?int $unitId, ?int $propertyId): array {
        if ($year < 1900 || $year > 9999 || ($unitId === null) === ($propertyId === null)
            || ($unitId !== null && $unitId < 1) || ($propertyId !== null && $propertyId < 1)) {
            throw new \InvalidArgumentException($this->l10n->t('Select a unit or property and a first retained year between 1900 and 9999.'));
        }
        $userId = $this->access->managementUserId();
        $scopeType = $propertyId !== null ? 'property' : 'unit';
        $scopeId = $propertyId ?? $unitId;
        $table = $propertyId !== null ? 'domus_properties' : 'domus_units';
        $scope = $this->mapper->rows($table, ['id' => $scopeId], $userId)[0] ?? null;
        if ($scope === null) throw new ResourceNotFoundException($this->l10n->t('Resource not found.'));
        $units = $propertyId !== null ? $this->mapper->rows('domus_units', ['property_id' => $propertyId], $userId) : [$scope];
        $plan = compact('userId', 'year', 'scopeType', 'scopeId', 'scope', 'units');
        $plan['cutoff'] = sprintf('%04d-01-01', $year);
        $plan['adjustmentDate'] = date('Y-m-d');
        foreach (['bookings', 'deleteTenancies', 'adjustTenancies', 'documents', 'relations', 'activities', 'tasks', 'closures', 'parents', 'blockers'] as $key) $plan[$key] = [];
        $allBookings = [];
        if ($propertyId !== null) {
            foreach ($this->mapper->rows('domus_bookings', ['property_id' => $propertyId], $userId) as $row) $allBookings[(int)$row['id']] = $row;
            $plan['closures'] = $this->mapper->rows('domus_booking_years', ['property_id' => $propertyId, 'unit_id' => null], $userId, false);
        }
        foreach ($units as $unit) {
            $id = (int)$unit['id'];
            foreach ($this->mapper->rows('domus_bookings', ['unit_id' => $id], $userId) as $row) $allBookings[(int)$row['id']] = $row;
            array_push($plan['closures'], ...$this->mapper->rows('domus_booking_years', ['unit_id' => $id], $userId, false));
            foreach ($this->mapper->rows('domus_tenancies', ['unit_id' => $id], $userId) as $row) {
                if ($row['start_date'] >= $plan['cutoff']) continue;
                if (!empty($row['end_date']) && $row['end_date'] < $plan['cutoff']) $plan['deleteTenancies'][] = $row;
                else $plan['adjustTenancies'][] = $row;
            }
        }
        ksort($allBookings, SORT_NUMERIC);
        $plan['bookings'] = array_values(array_filter($allBookings, static fn($row) => (int)$row['year'] < $year));
        $plan['closures'] = array_values(array_filter($plan['closures'], static fn($row) => (int)$row['year'] < $year));
        $deletedTenancyIds = array_fill_keys(array_column($plan['deleteTenancies'], 'id'), true);
        foreach ($units as $unit) foreach ($this->mapper->rows('domus_tasks', ['entity_type' => 'unit', 'entity_id' => (int)$unit['id']], $userId, false) as $task) {
            if (isset($deletedTenancyIds[$task['rule_tenancy_id'] ?? 0])) $plan['tasks'][(int)$task['id']] = $task;
        }
        $bookingIds = array_fill_keys(array_column($plan['bookings'], 'id'), true);
        foreach ($plan['bookings'] as $booking) {
            $sourceId = $booking['source_property_booking_id'] ?? null;
            if ($sourceId !== null && !isset($bookingIds[$sourceId])) $plan['blockers'][] = $this->distributionBlocker();
        }
        foreach ($this->mapper->rows('domus_bookings', ['source_property_booking_id' => array_keys($bookingIds)], $userId) as $child) {
            if (!isset($bookingIds[$child['id']])) $plan['blockers'][] = $this->distributionBlocker();
        }
        if ($unitId !== null && !empty($scope['property_id'])) {
            // A surviving property source (including drafts) can repopulate the unit's old years.
            foreach ($this->mapper->rows('domus_bookings', ['property_id' => (int)$scope['property_id'], 'unit_id' => null], $userId) as $row) {
                if ((int)$row['year'] < $year && !empty($row['distribution_key_id'])) $plan['blockers'][] = $this->distributionBlocker();
            }
            foreach ($this->mapper->rows('domus_booking_years', ['property_id' => (int)$scope['property_id'], 'unit_id' => null], $userId, false) as $row) {
                if ((int)$row['year'] < $year) $plan['blockers'][] = $this->l10n->t('Earlier years are closed at property level. Remove history for the whole property instead.');
            }
        }
        $unitIds = array_map(static fn($unit) => (int)$unit['id'], $units);
        foreach (['booking' => $plan['bookings'], 'tenancy' => $plan['deleteTenancies']] as $type => $rows) {
            foreach ($rows as $row) {
                $id = (int)$row['id'];
                $parent = !empty($row['unit_id']) ? ['type' => 'unit', 'id' => (int)$row['unit_id']]
                    : ['type' => 'property', 'id' => (int)$row['property_id']];
                if ($parent['type'] === 'unit' && !in_array($parent['id'], $unitIds, true)) $plan['blockers'][] = $this->distributionBlocker();
                $plan['parents'][$type . ':' . $id] = $parent;
            }
            $ids = array_column($rows, 'id');
            array_push($plan['documents'], ...$this->mapper->rows('domus_doclinks', ['entity_type' => $type, 'entity_id' => $ids], $userId));
            foreach (['entity', 'linked_entity'] as $prefix) foreach ($this->mapper->rows('domus_action_logs', [$prefix . '_type' => $type, $prefix . '_id' => $ids], $userId) as $activity) {
                $plan['activities'][(int)$activity['id']] = $activity;
            }
            if ($type === 'tenancy') {
                array_push($plan['relations'], ...$this->mapper->rows('domus_partner_rel', ['type' => 'tenancy', 'relation_id' => $ids], $userId));
            }
        }
        foreach ($plan['adjustTenancies'] as $row) {
            $note = $this->adjustmentNote($plan, $row);
            if (strlen((string)($row['conditions'] ?? '') . "\n\n" . $note) > 65535) {
                $plan['blockers'][] = $this->l10n->t('A tenancy has insufficient space for the adjustment note. Shorten its conditions before continuing.');
            }
        }
        $plan['blockers'] = array_values(array_unique($plan['blockers']));
        return $plan;
    }

    private function distributionBlocker(): string {
        return $this->l10n->t('This history includes a property distribution outside the selected scope. Remove history for the whole property instead.');
    }

    private function adjustmentNote(array $plan, array $tenancy): string {
        return $this->l10n->t('Financial history before %s removed on %s. Tenancy start date adjusted from %s to %s.',
            [(string)$plan['year'], $plan['adjustmentDate'], $tenancy['start_date'], $plan['cutoff']]);
    }

    private function describe(array $plan): array {
        $labels = [];
        foreach ($plan['units'] as $unit) $labels[(int)$unit['id']] = $unit['label'];
        $tenancy = static fn($row) => ['id' => (int)$row['id'], 'unit' => $labels[(int)$row['unit_id']] ?? '',
            'startDate' => $row['start_date'], 'endDate' => $row['end_date'] ?? null];
        return [
            'year' => $plan['year'], 'cutoff' => $plan['cutoff'], 'scopeType' => $plan['scopeType'], 'scopeId' => $plan['scopeId'],
            'scopeLabel' => $plan['scope']['name'] ?? $plan['scope']['label'], 'unitCount' => count($plan['units']),
            'token' => hash('sha256', json_encode($plan, JSON_THROW_ON_ERROR)),
            'bookings' => array_map(static fn($row) => ['id' => (int)$row['id'], 'year' => (int)$row['year'],
                'date' => $row['date'], 'description' => $row['description'] ?? '', 'amount' => (float)$row['amount'],
                'unit' => $labels[(int)($row['unit_id'] ?? 0)] ?? '',
            ], $plan['bookings']),
            'deleteTenancies' => array_map($tenancy, $plan['deleteTenancies']),
            'adjustTenancies' => array_map(fn($row) => $tenancy($row) + ['newStartDate' => $plan['cutoff'], 'note' => $this->adjustmentNote($plan, $row)], $plan['adjustTenancies']),
            'preservedDocuments' => count($plan['documents']), 'removedClosures' => count($plan['closures']),
            'removedActivities' => count($plan['activities']), 'closedTasks' => count($plan['tasks']),
            'blockers' => $plan['blockers'],
            'hasChanges' => $plan['bookings'] !== [] || $plan['deleteTenancies'] !== [] || $plan['adjustTenancies'] !== [] || $plan['closures'] !== [],
        ];
    }
}

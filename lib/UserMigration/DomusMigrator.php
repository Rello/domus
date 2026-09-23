<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\Domus\UserMigration;

use OCA\Domus\AppInfo\Application;
use OCP\DB\Exception;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\IL10N;
use OCP\IUser;
use OCP\UserMigration\IExportDestination;
use OCP\UserMigration\IImportSource;
use OCP\UserMigration\IMigrator;
use OCP\UserMigration\ISizeEstimationMigrator;
use OCP\UserMigration\UserMigrationException;
use Symfony\Component\Console\Output\OutputInterface;

class DomusMigrator implements IMigrator, ISizeEstimationMigrator {
    private const EXPORT_FILE = Application::APP_ID . '/user-data.json';
    private const VERSION = 2;
    private const SETTINGS = ['taxRate', 'wizard', 'initialDemoContentCreated'];

    public function __construct(
        private IDBConnection $db,
        private IConfig $config,
        private IL10N $l10n,
        private DocumentFiles $documentFiles,
    ) {
    }

    public function getEstimatedExportSize(IUser $user): int|float {
        $uid = $user->getUID();
        $rows = 0;

        foreach ([
            'domus_properties',
            'domus_units',
            'domus_partners',
            'domus_partner_rel',
            'domus_tenancies',
            'domus_bookings',
            'domus_docLinks',
            'domus_dist_keys',
            'domus_dist_key_units',
            'domus_action_logs',
        ] as $table) {
            $rows += $this->countByColumn($table, 'user_id', $uid);
        }

        $rows += $this->countByColumn('domus_workflow_runs', 'created_by', $uid);
        $rows += $this->countByColumn('domus_tasks', 'created_by', $uid);

        return max(1, $rows * 2 + $this->documentFiles->estimateSize($uid, $this->fetchAllByUser('domus_docLinks', $uid)));
    }

    public function export(IUser $user, IExportDestination $exportDestination, OutputInterface $output): void {
        $uid = $user->getUID();
        $output->writeln('<info>Exporting Domus data</info>');

        try {
            $properties = $this->fetchAllByUser('domus_properties', $uid);
            $propertyIds = $this->extractIds($properties);
            $units = $this->fetchAllByUser('domus_units', $uid);
            $unitIds = $this->extractIds($units);
            $partners = $this->fetchAllByUser('domus_partners', $uid);
            $tenancies = $this->fetchAllByUser('domus_tenancies', $uid);
            $distKeys = $this->fetchAllByUser('domus_dist_keys', $uid);
            $bookings = $this->fetchAllByUser('domus_bookings', $uid);
            $workflowRuns = $this->fetchAllByColumn('domus_workflow_runs', 'created_by', $uid);
            $workflowRunIds = $this->extractIds($workflowRuns);
            $templateIds = $this->extractColumnIds($workflowRuns, 'template_id');

            $payload = [
                'settings' => $this->exportSettings($uid),
                'properties' => $properties,
                'units' => $units,
                'partners' => $partners,
                'tenancies' => $tenancies,
                'distributionKeys' => $distKeys,
                'distributionKeyUnits' => $this->fetchAllByUser('domus_dist_key_units', $uid),
                'bookings' => $bookings,
                'partnerRelations' => $this->fetchAllByUser('domus_partner_rel', $uid),
                'documentLinks' => $this->fetchAllByUser('domus_docLinks', $uid),
                'bookingYears' => $this->fetchBookingYears($propertyIds, $unitIds),
                'actionLogs' => $this->fetchAllByUser('domus_action_logs', $uid),
                'workflowRuns' => $workflowRuns,
                'taskSteps' => $this->fetchAllByIds('domus_task_steps', 'workflow_run_id', $workflowRunIds),
                'tasks' => $this->fetchAllByColumn('domus_tasks', 'created_by', $uid),
                'taskTemplates' => $this->fetchAllByIds('domus_task_templates', 'id', $templateIds),
            ];

            $payload['documentFiles'] = $this->documentFiles->export($uid, $payload['documentLinks'], $exportDestination);

            $exportDestination->addFileContents(self::EXPORT_FILE, json_encode($payload, JSON_THROW_ON_ERROR));
        } catch (\Throwable $e) {
            throw new UserMigrationException('Unable to export Domus data', 0, $e);
        }
    }

    public function import(IUser $user, IImportSource $importSource, OutputInterface $output): void {
        if (!$importSource->pathExists(self::EXPORT_FILE)) {
            $output->writeln('<comment>No Domus data found in archive</comment>');
            return;
        }

        try {
            $payload = json_decode($importSource->getFileContents(self::EXPORT_FILE), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable $e) {
            throw new UserMigrationException('Invalid Domus migration payload', 0, $e);
        }

        if (!is_array($payload)) {
            throw new UserMigrationException('Invalid Domus migration payload');
        }

        $uid = $user->getUID();
        $templateMap = $this->buildTemplateMap($payload['taskTemplates'] ?? []);
        $maps = [
            'property' => [],
            'unit' => [],
            'partner' => [],
            'tenancy' => [],
            'distributionKey' => [],
            'booking' => [],
            'workflowRun' => [],
        ];

        $documentManifest = $payload['documentFiles'] ?? [];
        foreach ($payload['documentLinks'] ?? [] as $link) {
            if (!isset($documentManifest[(int)($link['file_id'] ?? 0)])) {
                throw new UserMigrationException('The archive has document links without files. Export it again with the current Domus version.');
            }
        }
        $documents = $this->documentFiles->import($uid, $documentManifest, $importSource);
        $maps['file'] = $documents['files'];
        $transactionStarted = false;
        try {
            $this->db->beginTransaction();
            $transactionStarted = true;
            $this->importSettings($uid, $payload['settings'] ?? []);
            $maps['property'] = $this->importProperties($uid, $payload['properties'] ?? []);
            $maps['unit'] = $this->importUnits($uid, $payload['units'] ?? [], $maps);
            $maps['partner'] = $this->importPartners($uid, $payload['partners'] ?? []);
            $maps['tenancy'] = $this->importTenancies($uid, $payload['tenancies'] ?? [], $maps);
            $maps['distributionKey'] = $this->importDistributionKeys($uid, $payload['distributionKeys'] ?? [], $maps);
            $this->importDistributionKeyUnits($uid, $payload['distributionKeyUnits'] ?? [], $maps);
            $maps['booking'] = $this->importBookings($uid, $payload['bookings'] ?? [], $maps);
            $this->remapBookingSources($payload['bookings'] ?? [], $maps['booking']);
            $this->importPartnerRelations($uid, $payload['partnerRelations'] ?? [], $maps);
            $this->importDocumentLinks($uid, $payload['documentLinks'] ?? [], $maps);
            $this->importBookingYears($payload['bookingYears'] ?? [], $maps);
            $this->importActionLogs($uid, $payload['actionLogs'] ?? [], $maps);
            $maps['workflowRun'] = $this->importWorkflowRuns($uid, $payload['workflowRuns'] ?? [], $maps, $templateMap);
            $this->importTaskSteps($uid, $payload['taskSteps'] ?? [], $maps);
            $this->importTasks($uid, $payload['tasks'] ?? [], $maps);
            $this->db->commit();
        } catch (\Throwable $e) {
            if ($transactionStarted) {
                $this->db->rollBack();
            }
            $documents['folder']?->delete();
            throw new UserMigrationException('Unable to import Domus data', 0, $e);
        }
    }

    public function getId(): string {
        return Application::APP_ID;
    }

    public function getDisplayName(): string {
        return $this->l10n->t('Domus');
    }

    public function getDescription(): string {
        return $this->l10n->t('Properties, units, bookings and documents');
    }

    public function getVersion(): int {
        return self::VERSION;
    }

    public function canImport(IImportSource $importSource): bool {
        try {
            $version = $importSource->getMigratorVersion($this->getId());
        } catch (UserMigrationException) {
            return false;
        }

        return $version !== null && $version <= self::VERSION;
    }

    /**
     * @return array<string,string>
     */
    private function exportSettings(string $uid): array {
        $settings = [];
        foreach (self::SETTINGS as $key) {
            $settings[$key] = $this->config->getUserValue($uid, Application::APP_ID, $key, '');
        }

        return $settings;
    }

    private function importSettings(string $uid, array $settings): void {
        foreach (self::SETTINGS as $key) {
            if (!array_key_exists($key, $settings)) {
                continue;
            }

            $this->config->setUserValue($uid, Application::APP_ID, $key, (string)$settings[$key]);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array<int,int>
     * @throws Exception
     */
    private function importProperties(string $uid, array $rows): array {
        return $this->importOwnedRows($uid, 'domus_properties', $rows);
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array<int,int>
     * @throws Exception
     */
    private function importUnits(string $uid, array $rows, array $maps): array {
        $idMap = [];
        foreach ($rows as $row) {
            if (!isset($row['id'])) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            $values['property_id'] = $this->remapNullableEntityId('property', $row['property_id'] ?? null, $maps);
            $idMap[(int)$row['id']] = $this->insertAndReturnId('domus_units', $values);
        }

        return $idMap;
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array<int,int>
     * @throws Exception
     */
    private function importPartners(string $uid, array $rows): array {
        $idMap = [];
        foreach ($rows as $row) {
            if (!isset($row['id'])) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            if (($values['nc_user_id'] ?? null) === $row['user_id']) {
                $values['nc_user_id'] = $uid;
            }
            $idMap[(int)$row['id']] = $this->insertAndReturnId('domus_partners', $values);
        }

        return $idMap;
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array<int,int>
     * @throws Exception
     */
    private function importTenancies(string $uid, array $rows, array $maps): array {
        $idMap = [];
        foreach ($rows as $row) {
            $unitId = $this->remapEntityId('unit', $row['unit_id'] ?? null, $maps);
            if (!isset($row['id']) || $unitId === null) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            $values['unit_id'] = $unitId;
            $idMap[(int)$row['id']] = $this->insertAndReturnId('domus_tenancies', $values);
        }

        return $idMap;
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array<int,int>
     * @throws Exception
     */
    private function importDistributionKeys(string $uid, array $rows, array $maps): array {
        $idMap = [];
        foreach ($rows as $row) {
            $propertyId = $this->remapEntityId('property', $row['property_id'] ?? null, $maps);
            if (!isset($row['id']) || $propertyId === null) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            $values['property_id'] = $propertyId;
            $idMap[(int)$row['id']] = $this->insertAndReturnId('domus_dist_keys', $values);
        }

        return $idMap;
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @throws Exception
     */
    private function importDistributionKeyUnits(string $uid, array $rows, array $maps): void {
        foreach ($rows as $row) {
            $distributionKeyId = $this->remapEntityId('distributionKey', $row['distribution_key_id'] ?? null, $maps);
            $unitId = $this->remapEntityId('unit', $row['unit_id'] ?? null, $maps);
            if ($distributionKeyId === null || $unitId === null) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            $values['distribution_key_id'] = $distributionKeyId;
            $values['unit_id'] = $unitId;
            $this->insertAndReturnId('domus_dist_key_units', $values);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array<int,int>
     * @throws Exception
     */
    private function importBookings(string $uid, array $rows, array $maps): array {
        $idMap = [];
        foreach ($rows as $row) {
            if (!isset($row['id'])) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            $values['property_id'] = $this->remapNullableEntityId('property', $row['property_id'] ?? null, $maps);
            $values['unit_id'] = $this->remapNullableEntityId('unit', $row['unit_id'] ?? null, $maps);
            $values['distribution_key_id'] = $this->remapNullableEntityId('distributionKey', $row['distribution_key_id'] ?? null, $maps);
            $values['source_property_booking_id'] = null;
            $idMap[(int)$row['id']] = $this->insertAndReturnId('domus_bookings', $values);
        }

        return $idMap;
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @param array<int,int> $bookingMap
     * @throws Exception
     */
    private function remapBookingSources(array $rows, array $bookingMap): void {
        foreach ($rows as $row) {
            if (!isset($row['id'], $bookingMap[(int)$row['id']])) {
                continue;
            }

            $sourceId = $this->normalizeNullableInt($row['source_property_booking_id'] ?? null);
            if ($sourceId === null || !isset($bookingMap[$sourceId])) {
                continue;
            }

            $this->updateById('domus_bookings', $bookingMap[(int)$row['id']], [
                'source_property_booking_id' => $bookingMap[$sourceId],
            ]);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @throws Exception
     */
    private function importPartnerRelations(string $uid, array $rows, array $maps): void {
        foreach ($rows as $row) {
            $type = (string)($row['type'] ?? '');
            $relationId = $this->remapEntityId($type, $row['relation_id'] ?? null, $maps);
            $partnerId = $this->remapEntityId('partner', $row['partner_id'] ?? null, $maps);
            if ($relationId === null || $partnerId === null) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            $values['relation_id'] = $relationId;
            $values['partner_id'] = $partnerId;
            $this->insertAndReturnId('domus_partner_rel', $values);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @throws Exception
     */
    private function importDocumentLinks(string $uid, array $rows, array $maps): void {
        foreach ($rows as $row) {
            $entityType = (string)($row['entity_type'] ?? '');
            $entityId = $this->remapEntityId($entityType, $row['entity_id'] ?? null, $maps);
            if ($entityId === null) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            $values['entity_id'] = $entityId;
            $values['file_id'] = $maps['file'][(int)$row['file_id']]
                ?? throw new UserMigrationException('Missing imported Domus document');
            $this->insertAndReturnId('domus_docLinks', $values);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @throws Exception
     */
    private function importBookingYears(array $rows, array $maps): void {
        foreach ($rows as $row) {
            $propertyId = $this->remapNullableEntityId('property', $row['property_id'] ?? null, $maps);
            $unitId = $this->remapNullableEntityId('unit', $row['unit_id'] ?? null, $maps);
            if ($propertyId === null && $unitId === null) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['property_id'] = $propertyId;
            $values['unit_id'] = $unitId;
            $this->insertAndReturnId('domus_booking_years', $values);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @throws Exception
     */
    private function importActionLogs(string $uid, array $rows, array $maps): void {
        foreach ($rows as $row) {
            $entityType = (string)($row['entity_type'] ?? '');
            $entityId = $this->remapEntityId($entityType, $row['entity_id'] ?? null, $maps);
            if ($entityId === null) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            $values['entity_id'] = $entityId;
            $values['created_by'] = $uid;
            $this->remapLinkedEntityValues($values, $maps);
            $this->insertAndReturnId('domus_action_logs', $values);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @param array<int,int> $templateMap
     * @return array<int,int>
     * @throws Exception
     */
    private function importWorkflowRuns(string $uid, array $rows, array $maps, array $templateMap): array {
        $idMap = [];
        foreach ($rows as $row) {
            $entityType = (string)($row['entity_type'] ?? '');
            $entityId = $this->remapEntityId($entityType, $row['entity_id'] ?? null, $maps);
            if (!isset($row['id']) || $entityId === null) {
                continue;
            }

            $oldTemplateId = (int)($row['template_id'] ?? 0);
            $values = $this->valuesWithoutId($row);
            $values['entity_id'] = $entityId;
            $values['template_id'] = $templateMap[$oldTemplateId] ?? $oldTemplateId;
            $values['created_by'] = $uid;
            $idMap[(int)$row['id']] = $this->insertAndReturnId('domus_workflow_runs', $values);
        }

        return $idMap;
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @throws Exception
     */
    private function importTaskSteps(string $uid, array $rows, array $maps): void {
        foreach ($rows as $row) {
            $workflowRunId = $this->remapEntityId('workflowRun', $row['workflow_run_id'] ?? null, $maps);
            $entityType = (string)($row['entity_type'] ?? '');
            $entityId = $this->remapEntityId($entityType, $row['entity_id'] ?? null, $maps);
            if ($workflowRunId === null || $entityId === null) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['workflow_run_id'] = $workflowRunId;
            $values['entity_id'] = $entityId;
            $values['closed_by'] = $this->remapUserValue($values['closed_by'] ?? null, $uid);
            $this->insertAndReturnId('domus_task_steps', $values);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @throws Exception
     */
    private function importTasks(string $uid, array $rows, array $maps): void {
        foreach ($rows as $row) {
            $entityType = (string)($row['entity_type'] ?? '');
            $entityId = $this->remapEntityId($entityType, $row['entity_id'] ?? null, $maps);
            if ($entityId === null) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['entity_id'] = $entityId;
            $values['created_by'] = $uid;
            $values['closed_by'] = $this->remapUserValue($values['closed_by'] ?? null, $uid);
            $this->insertAndReturnId('domus_tasks', $values);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array<int,int>
     * @throws Exception
     */
    private function importOwnedRows(string $uid, string $table, array $rows): array {
        $idMap = [];
        foreach ($rows as $row) {
            if (!isset($row['id'])) {
                continue;
            }

            $values = $this->valuesWithoutId($row);
            $values['user_id'] = $uid;
            $idMap[(int)$row['id']] = $this->insertAndReturnId($table, $values);
        }

        return $idMap;
    }

    private function remapLinkedEntityValues(array &$values, array $maps): void {
        $linkedType = $values['linked_entity_type'] ?? null;
        $linkedId = $this->remapNullableEntityId((string)$linkedType, $values['linked_entity_id'] ?? null, $maps);
        if ($linkedType !== null && $values['linked_entity_id'] !== null && $linkedId === null) {
            $values['linked_entity_type'] = null;
            $values['linked_entity_id'] = null;
            return;
        }

        $values['linked_entity_id'] = $linkedId;
    }

    private function remapUserValue(mixed $value, string $uid): ?string {
        if ($value === null || $value === '') {
            return null;
        }

        return $uid;
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array<int,int>
     */
    private function buildTemplateMap(array $rows): array {
        $map = [];
        foreach ($rows as $row) {
            if (!isset($row['id'], $row['key'])) {
                continue;
            }

            $existingId = $this->findIdByColumn('domus_task_templates', 'key', (string)$row['key']);
            if ($existingId !== null) {
                $map[(int)$row['id']] = $existingId;
            }
        }

        return $map;
    }

    /**
     * @return array<string,mixed>
     */
    private function valuesWithoutId(array $row): array {
        unset($row['id']);
        return $row;
    }

    private function remapNullableEntityId(string $entityType, mixed $entityId, array $maps): ?int {
        if ($entityId === null || $entityId === '' || (int)$entityId === 0) {
            return null;
        }

        return $this->remapEntityId($entityType, $entityId, $maps);
    }

    private function remapEntityId(string $entityType, mixed $entityId, array $maps): ?int {
        $oldId = $this->normalizeNullableInt($entityId);
        if ($oldId === null) {
            return null;
        }

        return $maps[$entityType][$oldId] ?? null;
    }

    private function normalizeNullableInt(mixed $value): ?int {
        if ($value === null || $value === '') {
            return null;
        }

        return (int)$value;
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return list<int>
     */
    private function extractIds(array $rows): array {
        return $this->extractColumnIds($rows, 'id');
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return list<int>
     */
    private function extractColumnIds(array $rows, string $column): array {
        $ids = [];
        foreach ($rows as $row) {
            if (isset($row[$column]) && (int)$row[$column] > 0) {
                $ids[] = (int)$row[$column];
            }
        }

        return array_values(array_unique($ids));
    }

    /**
     * @return list<array<string,mixed>>
     * @throws Exception
     */
    private function fetchAllByUser(string $table, string $uid): array {
        return $this->fetchAllByColumn($table, 'user_id', $uid);
    }

    /**
     * @return list<array<string,mixed>>
     * @throws Exception
     */
    private function fetchAllByColumn(string $table, string $column, mixed $value): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($table)
            ->where($qb->expr()->eq($column, $qb->createNamedParameter($value)));

        $statement = $qb->executeQuery();
        $result = $statement->fetchAll();
        $statement->closeCursor();

        return is_array($result) ? $result : [];
    }

    /**
     * @param list<int> $ids
     * @return list<array<string,mixed>>
     * @throws Exception
     */
    private function fetchAllByIds(string $table, string $column, array $ids): array {
        if ($ids === []) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($table)
            ->where($qb->expr()->in($column, $qb->createParameter('ids')))
            ->setParameter('ids', $ids, IQueryBuilder::PARAM_INT_ARRAY);

        $statement = $qb->executeQuery();
        $result = $statement->fetchAll();
        $statement->closeCursor();

        return is_array($result) ? $result : [];
    }

    /**
     * @param list<int> $propertyIds
     * @param list<int> $unitIds
     * @return list<array<string,mixed>>
     * @throws Exception
     */
    private function fetchBookingYears(array $propertyIds, array $unitIds): array {
        if ($propertyIds === [] && $unitIds === []) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $conditions = [];
        $qb->select('*')->from('domus_booking_years');

        if ($propertyIds !== []) {
            $conditions[] = $qb->expr()->in('property_id', $qb->createParameter('propertyIds'));
            $qb->setParameter('propertyIds', $propertyIds, IQueryBuilder::PARAM_INT_ARRAY);
        }
        if ($unitIds !== []) {
            $conditions[] = $qb->expr()->in('unit_id', $qb->createParameter('unitIds'));
            $qb->setParameter('unitIds', $unitIds, IQueryBuilder::PARAM_INT_ARRAY);
        }

        $qb->where(call_user_func_array([$qb->expr(), 'orX'], $conditions));
        $statement = $qb->executeQuery();
        $result = $statement->fetchAll();
        $statement->closeCursor();

        return is_array($result) ? $result : [];
    }

    private function countByColumn(string $table, string $column, mixed $value): int {
        try {
            $qb = $this->db->getQueryBuilder();
            $qb->selectAlias($qb->createFunction('COUNT(*)'), 'amount')
                ->from($table)
                ->where($qb->expr()->eq($column, $qb->createNamedParameter($value)));

            return (int)$qb->executeQuery()->fetchOne();
        } catch (\Throwable) {
            return 1;
        }
    }

    private function findIdByColumn(string $table, string $column, mixed $value): ?int {
        $qb = $this->db->getQueryBuilder();
        $qb->select('id')
            ->from($table)
            ->where($qb->expr()->eq($column, $qb->createNamedParameter($value)))
            ->setMaxResults(1);

        $result = $qb->executeQuery()->fetchOne();
        if ($result === false || $result === null) {
            return null;
        }

        return (int)$result;
    }

    /**
     * @param array<string,mixed> $values
     * @throws Exception
     */
    private function updateById(string $table, int $id, array $values): void {
        if ($values === []) {
            return;
        }

        $qb = $this->db->getQueryBuilder();
        $qb->update($table);
        foreach ($values as $column => $value) {
            $qb->set($column, $qb->createNamedParameter($value));
        }

        $qb->where($qb->expr()->eq('id', $qb->createNamedParameter($id)));
        $qb->executeStatement();
    }

    /**
     * @param array<string,mixed> $values
     * @throws Exception
     */
    private function insertAndReturnId(string $table, array $values): int {
        $qb = $this->db->getQueryBuilder();
        $qb->insert($table);

        $preparedValues = [];
        foreach ($values as $column => $value) {
            $preparedValues[$column] = $qb->createNamedParameter($value);
        }
        $qb->values($preparedValues);
        $qb->executeStatement();

        return (int)$qb->getLastInsertId();
    }
}

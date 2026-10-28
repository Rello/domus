<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCA\Domus\UserMigration;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\PersonalArchiveValidation;
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
    private const VERSION = 3;
    private const SETTINGS = ['taxRate', 'wizard', 'initialDemoContentCreated'];

    // Native migration accepts only canonical database columns. Update this
    // contract deliberately when adding exported fields; never trust archive keys as SQL.
    private const IMPORT_TABLES = [
        'properties' => 'domus_properties',
        'units' => 'domus_units',
        'partners' => 'domus_partners',
        'tenancies' => 'domus_tenancies',
        'distributionKeys' => 'domus_dist_keys',
        'distributionKeyUnits' => 'domus_dist_key_units',
        'bookings' => 'domus_bookings',
        'partnerRelations' => 'domus_partner_rel',
        'documentLinks' => 'domus_docLinks',
        'bookingYears' => 'domus_booking_years',
        'actionLogs' => 'domus_action_logs',
        'workflowRuns' => 'domus_workflow_runs',
        'taskSteps' => 'domus_task_steps',
        'tasks' => 'domus_tasks',
        'taskTemplates' => 'domus_task_templates',
        'taskTemplateSteps' => 'domus_task_tpl_steps',
    ];

    private const IMPORT_COLUMNS = [
        'domus_properties' => [
            'id', 'user_id', 'usage_role', 'name', 'street', 'zip',
            'city', 'country', 'type', 'description', 'document_path', 'image_file_id',
            'image_file_name', 'created_at', 'updated_at', 'team_id',
        ],
        'domus_units' => [
            'id', 'user_id', 'property_id', 'label', 'street', 'zip',
            'city', 'country', 'unit_number', 'land_register', 'living_area', 'unit_type',
            'notes', 'buy_date', 'total_costs', 'tax_id', 'iban', 'bic',
            'document_path', 'image_file_id', 'image_file_name', 'created_at', 'updated_at', 'team_id',
        ],
        'domus_partners' => [
            'id', 'user_id', 'partner_type', 'name', 'street', 'zip',
            'city', 'country', 'email', 'phone', 'customer_ref', 'notes',
            'nc_user_id', 'created_at', 'updated_at', 'team_id',
        ],
        'domus_partner_rel' => [
            'id', 'user_id', 'type', 'relation_id', 'partner_id', 'team_id',
        ],
        'domus_tenancies' => [
            'id', 'user_id', 'unit_id', 'start_date', 'end_date', 'base_rent',
            'service_charge', 'deposit', 'conditions', 'created_at', 'updated_at', 'team_id',
        ],
        'domus_bookings' => [
            'id', 'user_id', 'account', 'date', 'delivery_date', 'amount',
            'year', 'property_id', 'unit_id', 'distribution_key_id', 'status', 'period_from',
            'period_to', 'source_property_booking_id', 'description', 'created_at', 'updated_at', 'team_id',
        ],
        'domus_docLinks' => [
            'id', 'user_id', 'entity_type', 'entity_id', 'file_id', 'file_name',
            'note', 'created_at', 'team_id', 'document_date',
        ],
        'domus_dist_keys' => [
            'id', 'user_id', 'property_id', 'type', 'name', 'config_json',
            'valid_from', 'valid_to', 'created_at', 'updated_at', 'team_id',
        ],
        'domus_dist_key_units' => [
            'id', 'user_id', 'distribution_key_id', 'unit_id', 'value', 'valid_from',
            'valid_to', 'created_at', 'updated_at', 'team_id',
        ],
        'domus_task_templates' => [
            'id', 'key', 'name', 'description', 'applies_to', 'is_active',
            'created_at', 'updated_at', 'team_id', 'scope_key', 'source_catalogue_id',
        ],
        'domus_task_tpl_steps' => [
            'id', 'template_id', 'sort_order', 'title', 'description', 'action_type',
            'action_url', 'default_due_days_offset', 'created_at', 'updated_at', 'team_id', 'allow_early_completion',
        ],
        'domus_workflow_runs' => [
            'id', 'entity_type', 'entity_id', 'template_id', 'name', 'year',
            'status', 'started_at', 'closed_at', 'created_by', 'created_at', 'updated_at',
            'team_id', 'completion_type', 'closed_by',
        ],
        'domus_task_steps' => [
            'id', 'workflow_run_id', 'entity_type', 'entity_id', 'sort_order', 'title',
            'description', 'action_type', 'action_url', 'status', 'due_date', 'opened_at',
            'closed_at', 'closed_by', 'created_at', 'updated_at', 'team_id', 'allow_early_completion', 'default_due_days_offset',
        ],
        'domus_tasks' => [
            'id', 'entity_type', 'entity_id', 'title', 'description', 'status',
            'due_date', 'closed_at', 'closed_by', 'created_by', 'created_at', 'updated_at',
            'team_id',
        ],
        'domus_booking_years' => [
            'id', 'property_id', 'unit_id', 'year', 'closed_at', 'team_id',
        ],
        'domus_action_logs' => [
            'id', 'user_id', 'entity_type', 'entity_id', 'type', 'title',
            'data', 'source', 'linked_entity_type', 'linked_entity_id', 'linked_label', 'created_by',
            'created_at', 'updated_at', 'team_id',
        ],
    ];


    public function __construct(
        private IDBConnection $db,
        private IConfig $config,
        private IL10N $l10n,
        private DocumentFiles $documentFiles,
    ) {
    }

    public function getEstimatedExportSize(IUser $user): int|float {
        $uid = $user->getUID();
        if ($this->isMappedOwner($uid)) {
            return 0;
        }
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
        $this->assertUnmappedOwner($uid);
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
                'taskTemplateSteps' => $this->fetchAllByIds('domus_task_tpl_steps', 'template_id', $templateIds),
            ];

            // Archive templates are portable copies, never grants to source scopes/system IDs.
            foreach ($payload['taskTemplates'] as &$template) {
                $template['scope_key'] = 'global';
                $template['source_catalogue_id'] = null;
                unset($template['system_template_id']);
            }
            unset($template);
            PersonalArchiveValidation::assertPersonal($payload);
            $payload['documentFiles'] = $this->documentFiles->export($uid, $payload['documentLinks'], $exportDestination);

            $exportDestination->addFileContents(self::EXPORT_FILE, json_encode($payload, JSON_THROW_ON_ERROR));
        } catch (\Throwable $e) {
            throw new UserMigrationException($this->l10n->t('Unable to export Domus data'), 0, $e);
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
            throw new UserMigrationException($this->l10n->t('Invalid Domus migration payload'), 0, $e);
        }

        if (!is_array($payload)) {
            throw new UserMigrationException($this->l10n->t('Invalid Domus migration payload'));
        }

        try {
            PersonalArchiveValidation::assertPersonal($payload);
            $this->validateImportRows($payload);
        } catch (\Throwable $e) {
            throw new UserMigrationException($this->l10n->t('Unable to import Domus data'), 0, $e);
        }

        $uid = $user->getUID();
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
                throw new UserMigrationException($this->l10n->t('The archive has document links without files. Export it again with the current Domus version.'));
            }
        }
        $documents = $this->documentFiles->import($uid, $documentManifest, $importSource);
        $maps['file'] = $documents['files'];
        $transactionStarted = false;
        try {
            $this->db->beginTransaction();
            $transactionStarted = true;
            $this->assertUnmappedOwner($uid);
            $templateMap = $this->importTemplates($payload['taskTemplates'] ?? [], $payload['taskTemplateSteps'] ?? null, $uid);
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
            $maps['document'] = $this->importDocumentLinks($uid, $payload['documentLinks'] ?? [], $maps);
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
            throw new UserMigrationException($this->l10n->t('Unable to import Domus data'), 0, $e);
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

    private function assertUnmappedOwner(string $uid): void {
        if ($this->isMappedOwner($uid)) {
            throw new UserMigrationException($this->l10n->t('This Domus portfolio belongs to a Team and cannot be moved through user migration.'));
        }
    }

    private function isMappedOwner(string $uid): bool {
        $ownedTables = [
            'domus_properties' => 'user_id',
            'domus_units' => 'user_id',
            'domus_partners' => 'user_id',
            'domus_partner_rel' => 'user_id',
            'domus_tenancies' => 'user_id',
            'domus_bookings' => 'user_id',
            'domus_docLinks' => 'user_id',
            'domus_dist_keys' => 'user_id',
            'domus_dist_key_units' => 'user_id',
            'domus_action_logs' => 'user_id',
            'domus_tasks' => 'created_by',
            'domus_workflow_runs' => 'created_by',
        ];
        foreach ($ownedTables as $table => $actorColumn) {
            $qb = $this->db->getQueryBuilder();
            $qb->select('id')->from($table)
                ->where($qb->expr()->eq($actorColumn, $qb->createNamedParameter($uid)))
                ->andWhere($qb->expr()->isNotNull('team_id'))
                ->setMaxResults(1);
            if ($qb->executeQuery()->fetchOne() !== false) {
                return true;
            }
        }
        return false;
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

            $values = $this->valuesWithoutId('domus_units', $row);
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

            $values = $this->valuesWithoutId('domus_partners', $row);
            $values['user_id'] = $uid;
            // Account identities are local to the destination and require explicit relinking.
            $values['nc_user_id'] = null;
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

            $values = $this->valuesWithoutId('domus_tenancies', $row);
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

            $values = $this->valuesWithoutId('domus_dist_keys', $row);
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

            $values = $this->valuesWithoutId('domus_dist_key_units', $row);
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

            $values = $this->valuesWithoutId('domus_bookings', $row);
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

            $values = $this->valuesWithoutId('domus_partner_rel', $row);
            $values['user_id'] = $uid;
            $values['relation_id'] = $relationId;
            $values['partner_id'] = $partnerId;
            $this->insertAndReturnId('domus_partner_rel', $values);
        }
    }

    /**
     * @param list<array<string,mixed>> $rows
     * @return array<int,int>
     * @throws Exception
     */
    private function importDocumentLinks(string $uid, array $rows, array $maps): array {
        $idMap = [];
        foreach ($rows as $row) {
            $entityType = (string)($row['entity_type'] ?? '');
            $entityId = $this->remapEntityId($entityType, $row['entity_id'] ?? null, $maps);
            if ($entityId === null) {
                continue;
            }

            $values = $this->valuesWithoutId('domus_docLinks', $row);
            $values['user_id'] = $uid;
            $values['entity_id'] = $entityId;
            $values['file_id'] = $maps['file'][(int)$row['file_id']]
                ?? throw new UserMigrationException($this->l10n->t('Missing imported Domus document'));
            $id = $this->insertAndReturnId('domus_docLinks', $values);
            if (isset($row['id'])) {
                $idMap[(int)$row['id']] = $id;
            }
        }
        return $idMap;
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

            $values = $this->valuesWithoutId('domus_booking_years', $row);
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

            $values = $this->valuesWithoutId('domus_action_logs', $row);
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
            $values = $this->valuesWithoutId('domus_workflow_runs', $row);
            $values['entity_id'] = $entityId;
            $values['template_id'] = $templateMap[$oldTemplateId]
                ?? throw new UserMigrationException($this->l10n->t('Missing imported Domus process template'));
            $values['created_by'] = $uid;
            $values['closed_by'] = $this->remapUserValue($values['closed_by'] ?? null, $uid);
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

            $values = $this->valuesWithoutId('domus_task_steps', $row);
            if (($values['default_due_days_offset'] ?? null) === null) {
                $values['default_due_days_offset'] = 0;
                $run = $this->fetchAllByColumn('domus_workflow_runs', 'id', $workflowRunId)[0] ?? null;
                foreach ($this->fetchAllByColumn('domus_task_tpl_steps', 'template_id', (int)($run['template_id'] ?? 0)) as $templateStep) {
                    if ((int)($templateStep['sort_order'] ?? 0) === (int)($row['sort_order'] ?? 0)) {
                        $values['default_due_days_offset'] = (int)($templateStep['default_due_days_offset'] ?? 0);
                        break;
                    }
                }
            }
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

            $values = $this->valuesWithoutId('domus_tasks', $row);
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

            $values = $this->valuesWithoutId($table, $row);
            $values['user_id'] = $uid;
            $idMap[(int)$row['id']] = $this->insertAndReturnId($table, $values);
        }

        return $idMap;
    }

    private function remapLinkedEntityValues(array &$values, array $maps): void {
        $linkedType = $values['linked_entity_type'] ?? null;
        $linkedId = $this->remapNullableEntityId((string)$linkedType, $values['linked_entity_id'] ?? null, $maps);
        if ($linkedType !== null && ($values['linked_entity_id'] ?? null) !== null && $linkedId === null) {
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
    private function importTemplates(array $rows, ?array $steps, string $uid): array {
        $map = [];
        foreach ($rows as $row) {
            if (!isset($row['id'], $row['key'])) {
                continue;
            }

            $existingId = $this->findIdByColumn('domus_task_templates', 'key', (string)$row['key'], 'user:' . $uid);
            if ($existingId !== null) {
                $map[(int)$row['id']] = $existingId;
                continue;
            }
            if ($steps === null) {
                throw new UserMigrationException($this->l10n->t('The archive is missing Domus process template steps. Export it again with the current Domus version.'));
            }
            $values = $this->valuesWithoutId('domus_task_templates', $row);
            $values['scope_key'] = 'user:' . $uid;
            $values['system_template_id'] = $this->findIdByColumn('domus_task_templates', 'key', (string)$row['key'], 'system');
            $templateId = $this->insertAndReturnId('domus_task_templates', $values);
            $map[(int)$row['id']] = $templateId;
            foreach ($steps as $step) {
                if ((int)($step['template_id'] ?? 0) !== (int)$row['id']) {
                    continue;
                }
                $values = $this->valuesWithoutId('domus_task_tpl_steps', $step);
                $values['template_id'] = $templateId;
                $this->insertAndReturnId('domus_task_tpl_steps', $values);
            }
        }

        return $map;
    }

    private function validateImportRows(array $payload): void {
        foreach (self::IMPORT_TABLES as $section => $table) {
            if (!array_key_exists($section, $payload)) {
                continue;
            }
            if (!is_array($payload[$section])) {
                throw new UserMigrationException($this->l10n->t('Invalid Domus migration rows: %s', [$section]));
            }
            foreach ($payload[$section] as $row) {
                if (!is_array($row)) {
                    throw new UserMigrationException($this->l10n->t('Invalid Domus migration row: %s', [$section]));
                }
                $this->validateRow($table, $row);
            }
        }
    }

    private function validateRow(string $table, array $row): void {
        foreach ($row as $column => $value) {
            if (!in_array($column, self::IMPORT_COLUMNS[$table], true)
                || (!is_scalar($value) && $value !== null)) {
                throw new UserMigrationException($this->l10n->t('Invalid Domus migration column: %s', [$table . '.' . $column]));
            }
        }
        if (($row['team_id'] ?? null) !== null
            || (array_key_exists('scope_key', $row) && $row['scope_key'] !== 'global')
            || ($row['source_catalogue_id'] ?? null) !== null) {
            throw new UserMigrationException($this->l10n->t('Team records cannot be imported through personal user migration.'));
        }
    }

    /** @return array<string,mixed> */
    private function valuesWithoutId(string $table, array $row): array {
        $this->validateRow($table, $row);
        $values = array_intersect_key($row, array_flip(self::IMPORT_COLUMNS[$table]));
        unset($values['id']);
        $values['team_id'] = null;
        if (in_array($table, ['domus_properties', 'domus_units'], true)) {
            // Images are not bundled in this archive. Source-instance file IDs
            // must never resolve to unrelated files on the destination.
            $values['image_file_id'] = null;
            $values['image_file_name'] = null;
        }
        if ($table === 'domus_task_templates') {
            $values['scope_key'] = 'global';
            $values['source_catalogue_id'] = null;
        }
        return $values;
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

    private function findIdByColumn(string $table, string $column, mixed $value, string $scope = 'global'): ?int {
        $qb = $this->db->getQueryBuilder();
        $qb->select('id')
            ->from($table)
            ->where($qb->expr()->eq($column, $qb->createNamedParameter($value)))
            ->setMaxResults(1);
        if ($table === 'domus_task_templates') {
            $qb->andWhere($qb->expr()->eq('scope_key', $qb->createNamedParameter($scope)));
        }

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

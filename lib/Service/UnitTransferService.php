<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\AccountMapper;
use OCA\Domus\Db\Booking;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\BookingYear;
use OCA\Domus\Db\BookingYearMapper;
use OCA\Domus\Db\Partner;
use OCA\Domus\Db\PartnerMapper;
use OCA\Domus\Db\PartnerRel;
use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\Task;
use OCA\Domus\Db\TaskMapper;
use OCA\Domus\Db\TaskStep;
use OCA\Domus\Db\TaskStepMapper;
use OCA\Domus\Db\TaskTemplate;
use OCA\Domus\Db\TaskTemplateMapper;
use OCA\Domus\Db\TaskTemplateStep;
use OCA\Domus\Db\TaskTemplateStepMapper;
use OCA\Domus\Db\Tenancy;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Db\WorkflowRun;
use OCA\Domus\Db\WorkflowRunMapper;
use OCP\IDBConnection;
use OCP\IL10N;

class UnitTransferService {
    public function __construct(
        private UnitMapper $unitMapper,
        private PropertyMapper $propertyMapper,
        private TenancyMapper $tenancyMapper,
        private BookingMapper $bookingMapper,
        private BookingYearMapper $bookingYearMapper,
        private PartnerMapper $partnerMapper,
        private PartnerRelMapper $partnerRelMapper,
        private TaskMapper $taskMapper,
        private WorkflowRunMapper $workflowRunMapper,
        private TaskStepMapper $taskStepMapper,
        private TaskTemplateMapper $taskTemplateMapper,
        private TaskTemplateStepMapper $taskTemplateStepMapper,
        private AccountMapper $accountMapper,
        private PermissionService $permissionService,
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    public function exportUnitDataset(int $unitId, string $userId): array {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        $tenancies = $this->tenancyMapper->findByUser($userId, $unitId);
        $bookings = $this->bookingMapper->findByUser($userId, ['unitId' => $unitId]);
        $bookingYears = $this->bookingYearMapper->findByUnit($unitId);
        $tasks = $this->taskMapper->findByUnit($unitId);

        $partnerRelations = $this->partnerRelMapper->findForUnit($unitId, $userId);
        foreach ($tenancies as $tenancy) {
            $partnerRelations = array_merge($partnerRelations, $this->partnerRelMapper->findForTenancy($tenancy->getId(), $userId));
        }
        $partnerIds = array_values(array_unique(array_map(
            fn(PartnerRel $relation) => (int)$relation->getPartnerId(),
            $partnerRelations
        )));
        $partners = $this->partnerMapper->findForUserByIds($partnerIds, $userId);

        $templateMap = [];
        $taskTemplates = [];
        $workflowRunsPayload = [];
        $workflowRuns = $this->workflowRunMapper->findByUnit($unitId);
        foreach ($workflowRuns as $run) {
            $steps = $this->taskStepMapper->findByRun($run->getId());
            $runData = $run->jsonSerialize();
            $runData['steps'] = array_map(fn(TaskStep $step) => $step->jsonSerialize(), $steps);

            $templateId = (int)$run->getTemplateId();
            if (!isset($templateMap[$templateId])) {
                $template = $this->taskTemplateMapper->findById($templateId);
                if ($template) {
                    $template->setSteps($this->taskTemplateStepMapper->findByTemplate($templateId));
                    $templateMap[$templateId] = $template;
                    $taskTemplates[] = $template;
                }
            }

            $template = $templateMap[$templateId] ?? null;
            if ($template) {
                $runData['templateKey'] = $template->getKey();
            }

            $workflowRunsPayload[] = $runData;
        }

        return [
            'version' => 1,
            'exportedAt' => time(),
            'unit' => $unit->jsonSerialize(),
            'tenancies' => array_map(fn(Tenancy $tenancy) => $tenancy->jsonSerialize(), $tenancies),
            'partners' => array_map(fn(Partner $partner) => $partner->jsonSerialize(), $partners),
            'partnerRelations' => array_map(fn(PartnerRel $relation) => $relation->jsonSerialize(), $partnerRelations),
            'bookings' => array_map(fn(Booking $booking) => $booking->jsonSerialize(), $bookings),
            'bookingYears' => array_map(fn(BookingYear $bookingYear) => $bookingYear->jsonSerialize(), $bookingYears),
            'tasks' => array_map(fn(Task $task) => $task->jsonSerialize(), $tasks),
            'workflowRuns' => $workflowRunsPayload,
            'taskTemplates' => array_map(fn(TaskTemplate $template) => $template->jsonSerialize(), $taskTemplates),
        ];
    }

    public function importUnitDataset(array $payload, string $userId, string $role, ?int $propertyId = null): array {
        if (!isset($payload['unit']) || !is_array($payload['unit'])) {
            throw new \InvalidArgumentException($this->l10n->t('Import data is missing.'));
        }

        $propertyId = $propertyId ?: null;
        if ($propertyId !== null && !$this->propertyMapper->findForUser($propertyId, $userId)) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }
        $this->permissionService->assertPropertyRequirement($role, $propertyId);

        $unitData = $payload['unit'];
        $label = trim((string)($unitData['label'] ?? ''));
        if ($label === '') {
            throw new \InvalidArgumentException($this->l10n->t('Label is required.'));
        }

        $bookings = $this->normalizeRecords($payload['bookings'] ?? []);
        $this->assertAccountsAvailable($bookings);

        $warnings = [];
        $now = time();

        $this->connection->beginTransaction();
        try {
            $unit = new Unit();
            $unit->setUserId($userId);
            $unit->setPropertyId($propertyId);
            $unit->setLabel($label);
            $unit->setUnitNumber($unitData['unitNumber'] ?? null);
            $unit->setLandRegister($unitData['landRegister'] ?? null);
            $unit->setLivingArea($unitData['livingArea'] ?? null);
            $unit->setUnitType($unitData['unitType'] ?? null);
            $unit->setBuyDate($unitData['buyDate'] ?? null);
            $unit->setTotalCosts($unitData['totalCosts'] ?? null);
            $unit->setTaxId($unitData['taxId'] ?? null);
            $unit->setIban($unitData['iban'] ?? null);
            $unit->setBic($unitData['bic'] ?? null);
            $unit->setNotes($unitData['notes'] ?? null);
            $unit->setCreatedAt($this->normalizeTimestamp($unitData['createdAt'] ?? null, $now));
            $unit->setUpdatedAt($this->normalizeTimestamp($unitData['updatedAt'] ?? null, $now));
            $unit = $this->unitMapper->insert($unit);

            $partnerMap = $this->importPartners($this->normalizeRecords($payload['partners'] ?? []), $userId, $now);
            $tenancyMap = $this->importTenancies($this->normalizeRecords($payload['tenancies'] ?? []), $unit, $userId, $role, $now, $warnings);
            $this->importPartnerRelations($this->normalizeRecords($payload['partnerRelations'] ?? []), $partnerMap, $tenancyMap, $unit->getId(), $userId, $warnings);
            $this->importBookingYears($this->normalizeRecords($payload['bookingYears'] ?? []), $unit->getId(), $now);
            $this->importBookings($bookings, $unit->getId(), $propertyId, $userId, $warnings, $now);
            $this->importTasks($this->normalizeRecords($payload['tasks'] ?? []), $unit->getId(), $userId, $now);

            $templateMap = $this->importTemplates($this->normalizeRecords($payload['taskTemplates'] ?? []), $now);
            $this->importWorkflowRuns($this->normalizeRecords($payload['workflowRuns'] ?? []), $templateMap, $unit->getId(), $userId, $warnings, $now);

            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }

        return [
            'unitId' => $unit->getId(),
            'warnings' => $warnings,
        ];
    }

    private function normalizeRecords(mixed $records): array {
        return is_array($records) ? $records : [];
    }

    private function assertAccountsAvailable(array $bookings): void {
        $missing = [];
        foreach ($bookings as $booking) {
            $account = $booking['account'] ?? null;
            if ($account === null || $account === '') {
                continue;
            }
            if (!$this->accountMapper->findByNumber((string)$account)) {
                $missing[] = (string)$account;
            }
        }
        $missing = array_values(array_unique($missing));
        if ($missing !== []) {
            throw new \InvalidArgumentException($this->l10n->t('Missing accounts for import: {accounts}', [
                'accounts' => implode(', ', $missing),
            ]));
        }
    }

    private function importPartners(array $partners, string $userId, int $now): array {
        $partnerMap = [];
        foreach ($partners as $partnerData) {
            $partnerType = $partnerData['partnerType'] ?? '';
            $this->permissionService->assertPartnerTypeAllowed((string)$partnerType);
            $name = trim((string)($partnerData['name'] ?? ''));
            if ($name === '') {
                throw new \InvalidArgumentException($this->l10n->t('Partner name is required.'));
            }
            $partner = new Partner();
            $partner->setUserId($userId);
            $partner->setPartnerType($partnerType);
            $partner->setName($name);
            $partner->setStreet($partnerData['street'] ?? null);
            $partner->setZip($partnerData['zip'] ?? null);
            $partner->setCity($partnerData['city'] ?? null);
            $partner->setCountry($partnerData['country'] ?? null);
            $partner->setEmail($partnerData['email'] ?? null);
            $partner->setPhone($partnerData['phone'] ?? null);
            $partner->setCustomerRef($partnerData['customerRef'] ?? null);
            $partner->setNotes($partnerData['notes'] ?? null);
            $partner->setNcUserId($partnerData['ncUserId'] ?? null);
            $partner->setCreatedAt($this->normalizeTimestamp($partnerData['createdAt'] ?? null, $now));
            $partner->setUpdatedAt($this->normalizeTimestamp($partnerData['updatedAt'] ?? null, $now));

            $inserted = $this->partnerMapper->insert($partner);
            if (isset($partnerData['id'])) {
                $partnerMap[(int)$partnerData['id']] = $inserted->getId();
            }
        }
        return $partnerMap;
    }

    private function importTenancies(array $tenancies, Unit $unit, string $userId, string $role, int $now, array &$warnings): array {
        $tenancyMap = [];
        foreach ($tenancies as $tenancyData) {
            $startDate = $tenancyData['startDate'] ?? null;
            if (!$startDate) {
                throw new \InvalidArgumentException($this->l10n->t('Start date is required.'));
            }

            $hasFinancials = !empty($tenancyData['baseRent']) || !empty($tenancyData['serviceCharge']) || !empty($tenancyData['deposit']);
            $financialPayload = [
                'baseRent' => $tenancyData['baseRent'] ?? null,
                'serviceCharge' => $tenancyData['serviceCharge'] ?? null,
                'deposit' => $tenancyData['deposit'] ?? null,
            ];
            if ($this->permissionService->isBuildingManagement($role) && $hasFinancials) {
                $this->addWarning($warnings, $this->l10n->t('Tenancy amounts were cleared for building management import.'));
                $financialPayload = [
                    'baseRent' => null,
                    'serviceCharge' => null,
                    'deposit' => null,
                ];
            }
            $financialPayload = $this->permissionService->guardTenancyFinancialFields($role, $financialPayload);

            $tenancy = new Tenancy();
            $tenancy->setUserId($userId);
            $tenancy->setUnitId($unit->getId());
            $tenancy->setStartDate($startDate);
            $tenancy->setEndDate($tenancyData['endDate'] ?? null);
            $tenancy->setBaseRent($financialPayload['baseRent'] ?? null);
            $tenancy->setServiceCharge($financialPayload['serviceCharge'] ?? null);
            $tenancy->setDeposit($financialPayload['deposit'] ?? null);
            $tenancy->setConditions($tenancyData['conditions'] ?? null);
            $tenancy->setCreatedAt($this->normalizeTimestamp($tenancyData['createdAt'] ?? null, $now));
            $tenancy->setUpdatedAt($this->normalizeTimestamp($tenancyData['updatedAt'] ?? null, $now));

            $inserted = $this->tenancyMapper->insert($tenancy);
            if (isset($tenancyData['id'])) {
                $tenancyMap[(int)$tenancyData['id']] = $inserted->getId();
            }
        }
        return $tenancyMap;
    }

    private function importPartnerRelations(array $relations, array $partnerMap, array $tenancyMap, int $unitId, string $userId, array &$warnings): void {
        foreach ($relations as $relationData) {
            $type = $relationData['type'] ?? null;
            if (!in_array($type, ['unit', 'tenancy'], true)) {
                continue;
            }
            $oldPartnerId = (int)($relationData['partnerId'] ?? 0);
            $partnerId = $partnerMap[$oldPartnerId] ?? null;
            if (!$partnerId) {
                $this->addWarning($warnings, $this->l10n->t('Some partner relations were skipped during import.'));
                continue;
            }
            $relationId = null;
            if ($type === 'unit') {
                $relationId = $unitId;
            } elseif ($type === 'tenancy') {
                $relationId = $tenancyMap[(int)($relationData['relationId'] ?? 0)] ?? null;
            }
            if (!$relationId) {
                $this->addWarning($warnings, $this->l10n->t('Some partner relations were skipped during import.'));
                continue;
            }

            $relation = new PartnerRel();
            $relation->setUserId($userId);
            $relation->setType($type);
            $relation->setRelationId($relationId);
            $relation->setPartnerId($partnerId);
            $this->partnerRelMapper->insert($relation);
        }
    }

    private function importBookingYears(array $bookingYears, int $unitId, int $now): void {
        foreach ($bookingYears as $bookingYearData) {
            if (!isset($bookingYearData['year'])) {
                continue;
            }
            $bookingYear = new BookingYear();
            $bookingYear->setPropertyId(null);
            $bookingYear->setUnitId($unitId);
            $bookingYear->setYear((int)$bookingYearData['year']);
            $bookingYear->setClosedAt($this->normalizeTimestamp($bookingYearData['closedAt'] ?? null, $now));
            $this->bookingYearMapper->insert($bookingYear);
        }
    }

    private function importBookings(array $bookings, int $unitId, ?int $propertyId, string $userId, array &$warnings, int $now): void {
        $hasDistributionKey = false;
        $hasSourceBooking = false;

        foreach ($bookings as $bookingData) {
            $booking = new Booking();
            $booking->setUserId($userId);
            $booking->setAccount((int)($bookingData['account'] ?? 0));
            $booking->setDate($bookingData['date'] ?? null);
            $booking->setDeliveryDate($bookingData['deliveryDate'] ?? ($bookingData['date'] ?? null));
            $booking->setAmount($bookingData['amount'] ?? null);
            $booking->setYear((int)($bookingData['year'] ?? ($bookingData['date'] ? substr((string)$bookingData['date'], 0, 4) : 0)));
            $booking->setPropertyId($propertyId ?: null);
            $booking->setUnitId($unitId);
            if (!empty($bookingData['distributionKeyId'])) {
                $hasDistributionKey = true;
            }
            $booking->setDistributionKeyId(null);
            if (!empty($bookingData['sourcePropertyBookingId'])) {
                $hasSourceBooking = true;
            }
            $booking->setSourcePropertyBookingId(null);
            $booking->setStatus($bookingData['status'] ?? 'draft');
            $booking->setPeriodFrom($bookingData['periodFrom'] ?? ($bookingData['date'] ?? null));
            $booking->setPeriodTo($bookingData['periodTo'] ?? ($bookingData['date'] ?? null));
            $booking->setDescription($bookingData['description'] ?? null);
            $booking->setCreatedAt($this->normalizeTimestamp($bookingData['createdAt'] ?? null, $now));
            $booking->setUpdatedAt($this->normalizeTimestamp($bookingData['updatedAt'] ?? null, $now));

            $this->bookingMapper->insert($booking);
        }

        if ($hasDistributionKey) {
            $this->addWarning($warnings, $this->l10n->t('Distribution keys were not imported. Assign them manually.'));
        }
        if ($hasSourceBooking) {
            $this->addWarning($warnings, $this->l10n->t('Linked source bookings were not imported.'));
        }
    }

    private function importTasks(array $tasks, int $unitId, string $userId, int $now): void {
        foreach ($tasks as $taskData) {
            $task = new Task();
            $task->setUnitId($unitId);
            $task->setTitle($taskData['title'] ?? '');
            $task->setDescription($taskData['description'] ?? null);
            $task->setStatus($taskData['status'] ?? 'open');
            $task->setDueDate($taskData['dueDate'] ?? null);
            $task->setClosedAt($this->normalizeNullableTimestamp($taskData['closedAt'] ?? null));
            $task->setClosedBy($this->normalizeUserReference($taskData['closedBy'] ?? null, $userId));
            $task->setCreatedBy($userId);
            $task->setCreatedAt($this->normalizeTimestamp($taskData['createdAt'] ?? null, $now));
            $task->setUpdatedAt($this->normalizeTimestamp($taskData['updatedAt'] ?? null, $now));
            $this->taskMapper->insert($task);
        }
    }

    private function importTemplates(array $templates, int $now): array {
        $templateMap = [];
        foreach ($templates as $templateData) {
            $key = trim((string)($templateData['key'] ?? ''));
            if ($key === '') {
                continue;
            }
            $existing = $this->taskTemplateMapper->findByKey($key);
            if ($existing) {
                if (isset($templateData['id'])) {
                    $templateMap[(int)$templateData['id']] = $existing->getId();
                }
                continue;
            }

            $template = new TaskTemplate();
            $template->setKey($key);
            $template->setName($templateData['name'] ?? $key);
            $template->setDescription($templateData['description'] ?? null);
            $template->setAppliesTo($templateData['appliesTo'] ?? 'unit');
            $template->setIsActive(!empty($templateData['isActive']) ? 1 : 0);
            $template->setCreatedAt($this->normalizeTimestamp($templateData['createdAt'] ?? null, $now));
            $template->setUpdatedAt($this->normalizeTimestamp($templateData['updatedAt'] ?? null, $now));
            $template = $this->taskTemplateMapper->insert($template);

            if (isset($templateData['id'])) {
                $templateMap[(int)$templateData['id']] = $template->getId();
            }

            $steps = is_array($templateData['steps'] ?? null) ? $templateData['steps'] : [];
            foreach ($steps as $stepData) {
                $step = new TaskTemplateStep();
                $step->setTemplateId($template->getId());
                $step->setSortOrder((int)($stepData['sortOrder'] ?? 0));
                $step->setTitle($stepData['title'] ?? '');
                $step->setDescription($stepData['description'] ?? null);
                $step->setActionType($stepData['actionType'] ?? null);
                $step->setActionUrl($stepData['actionUrl'] ?? null);
                $step->setDefaultDueDaysOffset((int)($stepData['defaultDueDaysOffset'] ?? 0));
                $step->setCreatedAt($this->normalizeTimestamp($stepData['createdAt'] ?? null, $now));
                $step->setUpdatedAt($this->normalizeTimestamp($stepData['updatedAt'] ?? null, $now));
                $this->taskTemplateStepMapper->insert($step);
            }
        }

        return $templateMap;
    }

    private function importWorkflowRuns(array $runs, array $templateMap, int $unitId, string $userId, array &$warnings, int $now): void {
        foreach ($runs as $runData) {
            $templateId = $runData['templateId'] ?? null;
            $mappedTemplateId = $templateId ? ($templateMap[(int)$templateId] ?? null) : null;
            if (!$mappedTemplateId && isset($runData['templateKey'])) {
                $template = $this->taskTemplateMapper->findByKey((string)$runData['templateKey']);
                $mappedTemplateId = $template?->getId();
            }
            if (!$mappedTemplateId) {
                $this->addWarning($warnings, $this->l10n->t('Some workflow runs were skipped because templates are missing.'));
                continue;
            }

            $run = new WorkflowRun();
            $run->setUnitId($unitId);
            $run->setTemplateId($mappedTemplateId);
            $run->setName($runData['name'] ?? '');
            $run->setYear(isset($runData['year']) ? (int)$runData['year'] : null);
            $run->setStatus($runData['status'] ?? 'open');
            $run->setStartedAt($this->normalizeTimestamp($runData['startedAt'] ?? null, $now));
            $run->setClosedAt($this->normalizeNullableTimestamp($runData['closedAt'] ?? null));
            $run->setCreatedBy($userId);
            $run->setCreatedAt($this->normalizeTimestamp($runData['createdAt'] ?? null, $now));
            $run->setUpdatedAt($this->normalizeTimestamp($runData['updatedAt'] ?? null, $now));
            $run = $this->workflowRunMapper->insert($run);

            $steps = is_array($runData['steps'] ?? null) ? $runData['steps'] : [];
            foreach ($steps as $stepData) {
                $step = new TaskStep();
                $step->setWorkflowRunId($run->getId());
                $step->setUnitId($unitId);
                $step->setSortOrder((int)($stepData['sortOrder'] ?? 0));
                $step->setTitle($stepData['title'] ?? '');
                $step->setDescription($stepData['description'] ?? null);
                $step->setStatus($stepData['status'] ?? 'new');
                $step->setDueDate($stepData['dueDate'] ?? null);
                $step->setOpenedAt($this->normalizeNullableTimestamp($stepData['openedAt'] ?? null));
                $step->setClosedAt($this->normalizeNullableTimestamp($stepData['closedAt'] ?? null));
                $step->setClosedBy($this->normalizeUserReference($stepData['closedBy'] ?? null, $userId));
                $step->setActionType($stepData['actionType'] ?? null);
                $step->setActionUrl($stepData['actionUrl'] ?? null);
                $step->setCreatedAt($this->normalizeTimestamp($stepData['createdAt'] ?? null, $now));
                $step->setUpdatedAt($this->normalizeTimestamp($stepData['updatedAt'] ?? null, $now));
                $this->taskStepMapper->insert($step);
            }
        }
    }

    private function normalizeTimestamp(mixed $value, int $fallback): int {
        if ($value === null || $value === '') {
            return $fallback;
        }
        if (is_numeric($value)) {
            return (int)$value;
        }
        return $fallback;
    }

    private function normalizeNullableTimestamp(mixed $value): ?int {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_numeric($value)) {
            return (int)$value;
        }
        return null;
    }

    private function normalizeUserReference(mixed $value, string $fallback): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return $fallback;
    }

    private function addWarning(array &$warnings, string $message): void {
        if (!in_array($message, $warnings, true)) {
            $warnings[] = $message;
        }
    }
}

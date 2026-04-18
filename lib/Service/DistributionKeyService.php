<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCA\Domus\Db\DistributionKey;
use OCA\Domus\Db\DistributionKeyMapper;
use OCA\Domus\Db\DistributionKeyUnitMapper;
use OCA\Domus\Db\DistributionKeyUnit;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IDBConnection;
use OCP\IL10N;

class DistributionKeyService {
    private const ALLOWED_TYPES = ['area', 'mea', 'unit', 'persons', 'consumption', 'mixed', 'manual'];
    private const SPECIAL_SINGLE_ENTRY_TYPES = ['area', 'unit'];

    public function __construct(
        private DistributionKeyMapper $distributionKeyMapper,
        private DistributionKeyUnitMapper $distributionKeyUnitMapper,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private PermissionService $permissionService,
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    public function listForProperty(string $userId, int $propertyId, string $role, ?int $unitId = null): array {
        $property = $this->propertyMapper->findForUser($propertyId, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }

        $this->ensureDefaultKeys($propertyId, $userId);

        $unit = null;
        if ($unitId !== null) {
            $unit = $this->unitMapper->findForUser($unitId, $userId);
            if (!$unit || (int)$unit->getPropertyId() !== $propertyId) {
                throw new \RuntimeException($this->l10n->t('Unit not found for this property.'));
            }
        }

        $keys = $this->distributionKeyMapper->findByProperty($propertyId, $userId);
        $result = [];

        foreach ($keys as $key) {
            $data = $key->jsonSerialize();
            if ($unit) {
                $unitValue = $this->distributionKeyUnitMapper->findLatestForUnitAndKey($unit->getId(), $key->getId(), $userId);
                $data['unitValue'] = $unitValue ? $unitValue->jsonSerialize() : null;
            }
            $result[] = $data;
        }

        return $result;
    }

    public function createDistributionKey(int $propertyId, array $data, string $userId, string $role): DistributionKey {
        if (!$this->permissionService->isBuildingManagement($role)) {
            throw new \InvalidArgumentException($this->l10n->t('Only building management can create distributions.'));
        }

        $this->permissionService->assertPropertyRequirement($role, $propertyId);
        $property = $this->propertyMapper->findForUser($propertyId, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }

        $type = strtolower(trim((string)($data['type'] ?? '')));
        if (!in_array($type, self::ALLOWED_TYPES, true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid distribution type.'));
        }

        $name = trim((string)($data['name'] ?? ''));
        if ($name === '') {
            throw new \InvalidArgumentException($this->l10n->t('Name is required.'));
        }

        $validFrom = trim((string)($data['validFrom'] ?? ''));
        $validTo = $data['validTo'] !== null ? trim((string)$data['validTo']) : null;
        $this->assertDateRange($validFrom, $validTo);

        $configJson = $this->normalizeConfigJson($data['configJson'] ?? null);

        $now = time();
        $key = new DistributionKey();
        $key->setUserId($userId);
        $key->setPropertyId($propertyId);
        $key->setType($type);
        $key->setName($name);
        $key->setConfigJson($configJson);
        $key->setValidFrom($validFrom);
        $key->setValidTo($validTo ?: null);
        $key->setCreatedAt($now);
        $key->setUpdatedAt($now);

        if ($this->isSpecialSingleEntryType($type)) {
            $keysToClose = $this->getSpecialKeysToClose($propertyId, $type, $validFrom, $userId);
            $this->assertNoSpecialTypeOverlap($propertyId, $type, $validFrom, $validTo ?: null, $userId);
            $this->connection->beginTransaction();
            try {
                foreach ($keysToClose as $keyToClose) {
                    $this->distributionKeyMapper->update($keyToClose);
                }
                $created = $this->distributionKeyMapper->insert($key);
                $this->connection->commit();
                return $created;
            } catch (\Throwable $e) {
                $this->connection->rollBack();
                throw $e;
            }
        }

        return $this->distributionKeyMapper->insert($key);
    }

    public function createUnitValue(int $unitId, array $data, string $userId, string $role): array {
        if (!$this->permissionService->isBuildingManagement($role)) {
            throw new \InvalidArgumentException($this->l10n->t('Only building management can create distributions.'));
        }

        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        $this->ensureDefaultKeys((int)$unit->getPropertyId(), $userId);

        $distributionKeyId = (int)($data['distributionKeyId'] ?? 0);
        if ($distributionKeyId <= 0) {
            throw new \InvalidArgumentException($this->l10n->t('Distribution key is required.'));
        }

        $key = $this->distributionKeyMapper->findForUser($distributionKeyId, $userId);
        if (!$key) {
            throw new \RuntimeException($this->l10n->t('Distribution key not found.'));
        }

        if ((int)$key->getPropertyId() !== (int)$unit->getPropertyId()) {
            throw new \InvalidArgumentException($this->l10n->t('Distribution key does not belong to the unit property.'));
        }

        $validFrom = trim((string)($data['validFrom'] ?? ''));
        $validTo = $data['validTo'] !== null ? trim((string)$data['validTo']) : null;
        $this->assertDateRange($validFrom, $validTo);

        if (!isset($data['value']) || $data['value'] === '') {
            throw new \InvalidArgumentException($this->l10n->t('Value is required.'));
        }

        $value = (float)$data['value'];
        if ($value <= 0) {
            throw new \InvalidArgumentException($this->l10n->t('Value must be greater than zero.'));
        }

        $now = time();
        $unitValue = new DistributionKeyUnit();
        $unitValue->setUserId($userId);
        $unitValue->setDistributionKeyId($distributionKeyId);
        $unitValue->setUnitId($unitId);
        $unitValue->setValue($value);
        $unitValue->setValidFrom($validFrom);
        $unitValue->setValidTo($validTo ?: null);
        $unitValue->setCreatedAt($now);
        $unitValue->setUpdatedAt($now);

        $created = $this->distributionKeyUnitMapper->insert($unitValue);
        $keyData = $key->jsonSerialize();
        $keyData['unitValue'] = $created->jsonSerialize();

        return $keyData;
    }

    public function updateDistributionKey(int $propertyId, int $distributionKeyId, array $data, string $userId, string $role): DistributionKey {
        if (!$this->permissionService->isBuildingManagement($role)) {
            throw new \InvalidArgumentException($this->l10n->t('Only building management can update distributions.'));
        }

        $distributionKey = $this->distributionKeyMapper->findForUser($distributionKeyId, $userId);
        if (!$distributionKey || (int)$distributionKey->getPropertyId() !== $propertyId) {
            throw new \RuntimeException($this->l10n->t('Distribution key not found.'));
        }

        $name = trim((string)($data['name'] ?? $distributionKey->getName() ?? ''));
        if ($name === '') {
            throw new \InvalidArgumentException($this->l10n->t('Name is required.'));
        }

        $validFrom = trim((string)($data['validFrom'] ?? ($distributionKey->getValidFrom() ?? '')));
        $validTo = array_key_exists('validTo', $data)
            ? ($data['validTo'] !== null ? trim((string)$data['validTo']) : null)
            : $distributionKey->getValidTo();
        $this->assertDateRange($validFrom, $validTo);

        $configJson = $this->normalizeConfigJson($data['configJson'] ?? $distributionKey->getConfigJson());
        $editMode = strtolower(trim((string)($data['editMode'] ?? 'update')));
        if (!in_array($editMode, ['update', 'createversion'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid distribution edit mode.'));
        }

        if ($editMode === 'createversion') {
            return $this->createDistributionKeyVersion($distributionKey, $name, $validFrom, $validTo ?: null, $configJson, $userId);
        }

        if ($this->isSpecialSingleEntryType((string)$distributionKey->getType())) {
            $this->assertNoSpecialTypeOverlap(
                $propertyId,
                (string)$distributionKey->getType(),
                $validFrom,
                $validTo ?: null,
                $userId,
                (int)$distributionKey->getId()
            );
        }

        $distributionKey->setName($name);
        $distributionKey->setValidFrom($validFrom);
        $distributionKey->setValidTo($validTo ?: null);
        $distributionKey->setConfigJson($configJson);
        $distributionKey->setUpdatedAt(time());

        return $this->distributionKeyMapper->update($distributionKey);
    }

    public function listForUnit(int $unitId, string $userId, string $role): array {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        return $this->listForProperty($userId, (int)$unit->getPropertyId(), $role, $unitId);
    }

    private function assertDateRange(string $validFrom, ?string $validTo): void {
        if (!$this->isValidDate($validFrom)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid start date.'));
        }
        if ($validTo !== null && $validTo !== '' && !$this->isValidDate($validTo)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid end date.'));
        }
        if ($validTo !== null && $validTo !== '' && $validFrom > $validTo) {
            throw new \InvalidArgumentException($this->l10n->t('Start date must not be after end date.'));
        }
    }

    private function isValidDate(?string $date): bool {
        return is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1;
    }

    private function normalizeConfigJson($rawConfig): ?string {
        if ($rawConfig === null) {
            return null;
        }
        $rawString = trim((string)$rawConfig);
        if ($rawString === '') {
            return null;
        }

        $normalized = str_replace([
            '“', '”', '„', '‟', '«', '»'
        ], '"', $rawString);

        $decoded = json_decode($normalized, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid distribution configuration.'));
        }

        return json_encode($decoded);
    }

    private function ensureDefaultKeys(int $propertyId, string $userId): void {
        $existing = $this->distributionKeyMapper->findByProperty($propertyId, $userId);
        $hasUnit = false;
        $hasArea = false;
        foreach ($existing as $key) {
            if (strtolower((string)$key->getType()) === 'unit') {
                $hasUnit = true;
            }
            if (strtolower((string)$key->getType()) === 'area') {
                $hasArea = true;
            }
        }

        $now = time();
        if (!$hasUnit) {
            $key = new DistributionKey();
            $key->setUserId($userId);
            $key->setPropertyId($propertyId);
            $key->setType('unit');
            $key->setName($this->l10n->t('Unit count'));
            $key->setValidFrom('1900-01-01');
            $key->setValidTo(null);
            $key->setCreatedAt($now);
            $key->setUpdatedAt($now);
            $this->distributionKeyMapper->insert($key);
        }

        if (!$hasArea) {
            $key = new DistributionKey();
            $key->setUserId($userId);
            $key->setPropertyId($propertyId);
            $key->setType('area');
            $key->setName($this->l10n->t('Living area'));
            $key->setValidFrom('1900-01-01');
            $key->setValidTo(null);
            $key->setCreatedAt($now);
            $key->setUpdatedAt($now);
            $this->distributionKeyMapper->insert($key);
        }
    }

    private function createDistributionKeyVersion(
        DistributionKey $distributionKey,
        string $name,
        string $validFrom,
        ?string $validTo,
        ?string $configJson,
        string $userId
    ): DistributionKey {
        $currentValidFrom = (string)$distributionKey->getValidFrom();
        $currentValidTo = $distributionKey->getValidTo();

        if ($validFrom <= $currentValidFrom) {
            throw new \InvalidArgumentException($this->l10n->t('The new distribution must start after the current entry.'));
        }
        if ($currentValidTo !== null && $currentValidTo !== '' && $validFrom > $currentValidTo) {
            throw new \InvalidArgumentException($this->l10n->t('The new distribution must start within the current validity period.'));
        }

        $newValidTo = $validTo ?: ($currentValidTo ?: null);
        $this->assertDateRange($validFrom, $newValidTo);

        $previousValidTo = $this->getPreviousDate($validFrom);
        if ($previousValidTo < $currentValidFrom) {
            throw new \InvalidArgumentException($this->l10n->t('The new distribution start date is too early.'));
        }

        $type = strtolower((string)$distributionKey->getType());
        if ($this->isSpecialSingleEntryType($type)) {
            $this->assertNoSpecialTypeOverlap(
                (int)$distributionKey->getPropertyId(),
                $type,
                $validFrom,
                $newValidTo,
                $userId,
                (int)$distributionKey->getId()
            );
        }

        $now = time();
        $newKey = new DistributionKey();
        $newKey->setUserId($userId);
        $newKey->setPropertyId((int)$distributionKey->getPropertyId());
        $newKey->setType((string)$distributionKey->getType());
        $newKey->setName($name);
        $newKey->setConfigJson($configJson);
        $newKey->setValidFrom($validFrom);
        $newKey->setValidTo($newValidTo);
        $newKey->setCreatedAt($now);
        $newKey->setUpdatedAt($now);

        $this->connection->beginTransaction();
        try {
            $distributionKey->setValidTo($previousValidTo);
            $distributionKey->setUpdatedAt($now);
            $this->distributionKeyMapper->update($distributionKey);
            $created = $this->distributionKeyMapper->insert($newKey);
            $this->connection->commit();
            return $created;
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }
    }

    private function isSpecialSingleEntryType(string $type): bool {
        return in_array(strtolower($type), self::SPECIAL_SINGLE_ENTRY_TYPES, true);
    }

    private function getSpecialKeysToClose(int $propertyId, string $type, string $validFrom, string $userId): array {
        $keys = $this->distributionKeyMapper->findByPropertyAndType($propertyId, $type, $userId);
        $previousValidTo = $this->getPreviousDate($validFrom);
        $now = time();
        $keysToClose = [];

        foreach ($keys as $key) {
            $existingValidFrom = (string)$key->getValidFrom();
            $existingValidTo = $key->getValidTo();
            if ($existingValidTo !== null || $existingValidFrom >= $validFrom) {
                continue;
            }
            if ($previousValidTo < $existingValidFrom) {
                continue;
            }

            $key->setValidTo($previousValidTo);
            $key->setUpdatedAt($now);
            $keysToClose[] = $key;
        }

        return $keysToClose;
    }

    private function assertNoSpecialTypeOverlap(
        int $propertyId,
        string $type,
        string $validFrom,
        ?string $validTo,
        string $userId,
        ?int $excludeId = null
    ): void {
        $keys = $this->distributionKeyMapper->findByPropertyAndType($propertyId, $type, $userId, $excludeId);

        foreach ($keys as $key) {
            $existingValidFrom = (string)$key->getValidFrom();
            $existingValidTo = $key->getValidTo();
            if (!$this->dateRangesOverlap($validFrom, $validTo, $existingValidFrom, $existingValidTo)) {
                continue;
            }
            if ($this->isClosableSpecialPredecessor($existingValidFrom, $existingValidTo, $validFrom)) {
                continue;
            }
            throw new \InvalidArgumentException($this->l10n->t('Unit and area distributions cannot overlap.'));
        }
    }

    private function dateRangesOverlap(string $startA, ?string $endA, string $startB, ?string $endB): bool {
        $normalizedEndA = $endA ?: '9999-12-31';
        $normalizedEndB = $endB ?: '9999-12-31';
        return $startA <= $normalizedEndB && $startB <= $normalizedEndA;
    }

    private function getPreviousDate(string $date): string {
        return (new \DateTimeImmutable($date))
            ->modify('-1 day')
            ->format('Y-m-d');
    }

    private function isClosableSpecialPredecessor(string $existingValidFrom, ?string $existingValidTo, string $newValidFrom): bool {
        if ($existingValidTo !== null || $existingValidFrom >= $newValidFrom) {
            return false;
        }

        return $this->getPreviousDate($newValidFrom) >= $existingValidFrom;
    }
}

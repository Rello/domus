<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\DistributionKey;
use OCA\Domus\Db\DistributionKeyMapper;
use OCA\Domus\Db\DistributionKeyUnitMapper;
use OCA\Domus\Db\DistributionKeyUnit;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class DistributionKeyService {
    private const ALLOWED_TYPES = ['area', 'mea', 'unit', 'persons', 'consumption', 'mixed', 'manual'];

    public function __construct(
        private DistributionKeyMapper $distributionKeyMapper,
        private DistributionKeyUnitMapper $distributionKeyUnitMapper,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private PermissionService $permissionService,
        private IL10N $l10n,
    ) {
    }

    public function listForProperty(string $userId, int $propertyId, string $role, ?int $unitId = null): array {
        $property = $this->propertyMapper->findForUser($propertyId, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }

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

        $configJson = $data['configJson'] ?? null;
        if ($configJson !== null && trim((string)$configJson) !== '') {
            $decoded = json_decode((string)$configJson, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new \InvalidArgumentException($this->l10n->t('Invalid distribution configuration.'));
            }
            $configJson = json_encode($decoded);
        } else {
            $configJson = null;
        }

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
}

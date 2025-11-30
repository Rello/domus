<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class UnitService {
    public function __construct(private UnitMapper $unitMapper, private IL10N $l10n) {
    }

    /** @return Unit[] */
    public function list(string $userId): array {
        return $this->unitMapper->findAllByUser($userId);
    }

    /** @return Unit[] */
    public function listByProperty(int $propertyId, string $userId): array {
        return $this->unitMapper->findByProperty($propertyId, $userId);
    }

    public function getById(int $id, string $userId): Unit {
        $unit = $this->unitMapper->findByIdForUser($id, $userId);
        if ($unit === null) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        return $unit;
    }

    public function create(array $data, string $userId): Unit {
        $this->assertRequired($data, ['propertyId', 'label']);
        $unit = new Unit();
        $unit->setUserId($userId);
        $unit->setPropertyId((int)$data['propertyId']);
        $unit->setLabel($data['label']);
        $unit->setUnitNumber($data['unitNumber'] ?? null);
        $unit->setLandRegister($data['landRegister'] ?? null);
        $unit->setLivingArea(isset($data['livingArea']) ? (float)$data['livingArea'] : null);
        $unit->setUsableArea(isset($data['usableArea']) ? (float)$data['usableArea'] : null);
        $unit->setUnitType($data['unitType'] ?? null);
        $unit->setNotes($data['notes'] ?? null);
        $unit->setCreatedAt(time());
        $unit->setUpdatedAt(time());
        return $this->unitMapper->insert($unit);
    }

    public function update(int $id, array $data, string $userId): Unit {
        $unit = $this->getById($id, $userId);
        foreach ($data as $key => $value) {
            $method = 'set' . ucfirst($key);
            if (method_exists($unit, $method)) {
                $unit->$method($value);
            }
        }
        $unit->setUpdatedAt(time());
        return $this->unitMapper->update($unit);
    }

    public function delete(int $id, string $userId): void {
        $unit = $this->getById($id, $userId);
        $this->unitMapper->delete($unit);
    }

    private function assertRequired(array $data, array $required): void {
        foreach ($required as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                throw new \InvalidArgumentException($this->l10n->t('%s is required.', [$field]));
            }
        }
    }
}

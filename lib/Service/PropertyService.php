<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Property;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;
use OCP\ILogger;

class PropertyService {
    public function __construct(
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private IL10N $l10n,
        private ILogger $logger
    ) {
    }

    /** @return Property[] */
    public function list(string $userId): array {
        return $this->propertyMapper->findAllByUser($userId);
    }

    public function getById(int $id, string $userId): Property {
        $result = $this->propertyMapper->findByIdForUser($id, $userId);
        if ($result === null) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }
        return $result;
    }

    public function create(array $data, string $userId): Property {
        $this->assertRequired($data, ['name', 'usageRole']);
        $property = new Property();
        $property->setUserId($userId);
        $property->setUsageRole($data['usageRole']);
        $property->setName($data['name']);
        $property->setStreet($data['street'] ?? null);
        $property->setZip($data['zip'] ?? null);
        $property->setCity($data['city'] ?? null);
        $property->setCountry($data['country'] ?? null);
        $property->setType($data['type'] ?? null);
        $property->setDescription($data['description'] ?? null);
        $property->setCreatedAt(time());
        $property->setUpdatedAt(time());
        return $this->propertyMapper->insert($property);
    }

    public function update(int $id, array $data, string $userId): Property {
        $property = $this->getById($id, $userId);
        foreach ($data as $key => $value) {
            $method = 'set' . ucfirst($key);
            if (method_exists($property, $method)) {
                $property->$method($value);
            }
        }
        $property->setUpdatedAt(time());
        return $this->propertyMapper->update($property);
    }

    public function delete(int $id, string $userId): void {
        $property = $this->getById($id, $userId);
        $unitCount = $this->unitMapper->countByProperty($id, $userId);
        if ($unitCount > 0) {
            throw new \RuntimeException($this->l10n->t('Property cannot be deleted while units exist.'));
        }
        $this->propertyMapper->delete($property);
    }

    private function assertRequired(array $data, array $required): void {
        foreach ($required as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                throw new \InvalidArgumentException($this->l10n->t('%s is required.', [$field]));
            }
        }
    }
}

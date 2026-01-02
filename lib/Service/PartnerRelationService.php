<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Partner;
use OCA\Domus\Db\PartnerMapper;
use OCA\Domus\Db\PartnerRel;
use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IDBConnection;
use OCP\IL10N;

class PartnerRelationService {
    public function __construct(
        private PartnerRelMapper $partnerRelMapper,
        private PartnerMapper $partnerMapper,
        private PartnerService $partnerService,
        private UnitMapper $unitMapper,
        private PropertyMapper $propertyMapper,
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    public function listPartnersForUnit(int $unitId, string $userId): array {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        return $this->loadPartnersForRelation('unit', $unitId, $userId);
    }

    public function listPartnersForProperty(int $propertyId, string $userId): array {
        $property = $this->propertyMapper->findForUser($propertyId, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }
        return $this->loadPartnersForRelation('property', $propertyId, $userId);
    }

    public function createRelation(string $entityType, int $entityId, array $data, string $userId, string $role): Partner {
        if (!in_array($entityType, ['unit', 'property'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid relation type.'));
        }
        if ($entityType === 'unit') {
            $unit = $this->unitMapper->findForUser($entityId, $userId);
            if (!$unit) {
                throw new \RuntimeException($this->l10n->t('Unit not found.'));
            }
        } else {
            $property = $this->propertyMapper->findForUser($entityId, $userId);
            if (!$property) {
                throw new \RuntimeException($this->l10n->t('Property not found.'));
            }
        }

        $partnerId = $data['partnerId'] ?? null;

        $this->connection->beginTransaction();
        try {
            if ($partnerId !== null) {
                $partner = $this->partnerMapper->findForUser((int)$partnerId, $userId);
                if (!$partner) {
                    throw new \RuntimeException($this->l10n->t('Partner not found.'));
                }
            } else {
                $partner = $this->partnerService->createPartner($data, $userId, $role);
            }

            if ($this->partnerRelMapper->relationExists($entityType, $entityId, $partner->getId(), $userId)) {
                throw new \InvalidArgumentException($this->l10n->t('Partner is already linked.'));
            }

            $relation = new PartnerRel();
            $relation->setUserId($userId);
            $relation->setType($entityType);
            $relation->setRelationId($entityId);
            $relation->setPartnerId($partner->getId());
            $this->partnerRelMapper->insert($relation);

            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }

        return $partner;
    }

    private function loadPartnersForRelation(string $type, int $relationId, string $userId): array {
        $relations = match ($type) {
            'unit' => $this->partnerRelMapper->findForUnit($relationId, $userId),
            'property' => $this->partnerRelMapper->findForProperty($relationId, $userId),
            default => [],
        };

        $partnerIds = array_values(array_unique(array_map(fn($relation) => $relation->getPartnerId(), $relations)));
        if ($partnerIds === []) {
            return [];
        }

        $partnersById = [];
        foreach ($this->partnerMapper->findForUserByIds($partnerIds, $userId) as $partner) {
            $partnersById[$partner->getId()] = $partner;
        }

        $partners = [];
        foreach ($partnerIds as $partnerId) {
            if (isset($partnersById[$partnerId])) {
                $partners[] = $partnersById[$partnerId];
            }
        }

        return $partners;
    }
}

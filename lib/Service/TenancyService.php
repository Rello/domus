<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Tenancy;
use OCA\Domus\Db\TenancyMapper;
use OCP\IL10N;

class TenancyService {
    public function __construct(private TenancyMapper $tenancyMapper, private IL10N $l10n) {
    }

    /** @return Tenancy[] */
    public function list(string $userId): array {
        return $this->tenancyMapper->findAllByUser($userId);
    }

    /** @return Tenancy[] */
    public function listByUnit(int $unitId, string $userId): array {
        return $this->tenancyMapper->findByUnit($unitId, $userId);
    }

    /** @return Tenancy[] */
    public function listByPartner(int $partnerId, string $userId): array {
        return $this->tenancyMapper->findByPartner($partnerId, $userId);
    }

    public function getById(int $id, string $userId): Tenancy {
        $tenancy = $this->tenancyMapper->findByIdForUser($id, $userId);
        if ($tenancy === null) {
            throw new \RuntimeException($this->l10n->t('Tenancy not found.'));
        }
        $this->applyStatus($tenancy);
        return $tenancy;
    }

    public function create(array $data, string $userId): Tenancy {
        $this->assertRequired($data, ['unitId', 'startDate', 'baseRent']);
        $tenancy = new Tenancy();
        $tenancy->setUserId($userId);
        $tenancy->setUnitId((int)$data['unitId']);
        $tenancy->setPartnerId(isset($data['partnerId']) ? (int)$data['partnerId'] : null);
        $tenancy->setStartDate($data['startDate']);
        $tenancy->setEndDate($data['endDate'] ?? null);
        $tenancy->setBaseRent((float)$data['baseRent']);
        $tenancy->setServiceCharge(isset($data['serviceCharge']) ? (float)$data['serviceCharge'] : null);
        $tenancy->setServiceChargeAsPrepayment((bool)($data['serviceChargeAsPrepayment'] ?? false));
        $tenancy->setDeposit(isset($data['deposit']) ? (float)$data['deposit'] : null);
        $tenancy->setConditions($data['conditions'] ?? null);
        $tenancy->setCreatedAt(time());
        $tenancy->setUpdatedAt(time());
        $tenancy->setStatus($this->calculateStatus($tenancy));
        return $this->tenancyMapper->insert($tenancy);
    }

    public function update(int $id, array $data, string $userId): Tenancy {
        $tenancy = $this->getById($id, $userId);
        foreach ($data as $key => $value) {
            $method = 'set' . ucfirst($key);
            if (method_exists($tenancy, $method)) {
                $tenancy->$method($value);
            }
        }
        $tenancy->setStatus($this->calculateStatus($tenancy));
        $tenancy->setUpdatedAt(time());
        return $this->tenancyMapper->update($tenancy);
    }

    public function delete(int $id, string $userId): void {
        $tenancy = $this->getById($id, $userId);
        $this->tenancyMapper->delete($tenancy);
    }

    private function calculateStatus(Tenancy $tenancy): string {
        $now = strtotime('today');
        $start = strtotime($tenancy->getStartDate());
        $end = $tenancy->getEndDate() ? strtotime($tenancy->getEndDate()) : null;
        if ($end !== null && $end < $now) {
            return 'ended';
        }
        if ($start > $now) {
            return 'upcoming';
        }
        return 'active';
    }

    private function applyStatus(Tenancy $tenancy): void {
        $tenancy->setStatus($this->calculateStatus($tenancy));
    }

    private function assertRequired(array $data, array $required): void {
        foreach ($required as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                throw new \InvalidArgumentException($this->l10n->t('%s is required.', [$field]));
            }
        }
    }
}

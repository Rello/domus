<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Partner;
use OCA\Domus\Db\PartnerMapper;
use OCP\IL10N;

class PartnerService {
    public function __construct(private PartnerMapper $partnerMapper, private IL10N $l10n) {
    }

    /** @return Partner[] */
    public function list(string $userId): array {
        $qb = $this->partnerMapper->getQueryBuilder();
        $qb->select('*')->from('domus_partners')->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->partnerMapper->findEntities($qb);
    }

    public function getById(int $id, string $userId): Partner {
        $qb = $this->partnerMapper->getQueryBuilder();
        $qb->select('*')->from('domus_partners')
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        $partner = $this->partnerMapper->findEntity($qb);
        if ($partner === null) {
            throw new \RuntimeException($this->l10n->t('Partner not found.'));
        }
        return $partner;
    }

    public function create(array $data, string $userId): Partner {
        $this->assertRequired($data, ['name', 'partnerType']);
        $partner = new Partner();
        $partner->setUserId($userId);
        $partner->setPartnerType($data['partnerType']);
        $partner->setName($data['name']);
        $partner->setStreet($data['street'] ?? null);
        $partner->setZip($data['zip'] ?? null);
        $partner->setCity($data['city'] ?? null);
        $partner->setCountry($data['country'] ?? null);
        $partner->setEmail($data['email'] ?? null);
        $partner->setPhone($data['phone'] ?? null);
        $partner->setCustomerRef($data['customerRef'] ?? null);
        $partner->setNotes($data['notes'] ?? null);
        $partner->setNcUserId($data['ncUserId'] ?? null);
        $partner->setCreatedAt(time());
        $partner->setUpdatedAt(time());
        return $this->partnerMapper->insert($partner);
    }

    public function update(int $id, array $data, string $userId): Partner {
        $partner = $this->getById($id, $userId);
        foreach ($data as $key => $value) {
            $method = 'set' . ucfirst($key);
            if (method_exists($partner, $method)) {
                $partner->$method($value);
            }
        }
        $partner->setUpdatedAt(time());
        return $this->partnerMapper->update($partner);
    }

    public function delete(int $id, string $userId): void {
        $partner = $this->getById($id, $userId);
        $this->partnerMapper->delete($partner);
    }

    private function assertRequired(array $data, array $required): void {
        foreach ($required as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                throw new \InvalidArgumentException($this->l10n->t('%s is required.', [$field]));
            }
        }
    }
}

<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Partner;
use OCA\Domus\Db\PartnerMapper;
use OCA\Domus\Db\PartnerRelMapper;
use OCP\IL10N;

class PartnerService {
    public function __construct(
        private PartnerMapper $partnerMapper,
        private PartnerRelMapper $partnerRelMapper,
        private IL10N $l10n,
    ) {
    }

    public function listPartners(string $userId, ?string $type = null): array {
        return $this->partnerMapper->findByUser($userId, $type);
    }

    public function getPartnerForUser(int $id, string $userId): Partner {
        $partner = $this->partnerMapper->findForUser($id, $userId);
        if (!$partner) {
            throw new \RuntimeException($this->l10n->t('Partner not found.'));
        }
        return $partner;
    }

    public function createPartner(array $data, string $userId): Partner {
        if (!in_array($data['partnerType'] ?? '', ['tenant', 'owner'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid partner type.'));
        }
        if (!isset($data['name']) || trim((string)$data['name']) === '') {
            throw new \InvalidArgumentException($this->l10n->t('Partner name is required.'));
        }
        $now = time();
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
        $partner->setCreatedAt($now);
        $partner->setUpdatedAt($now);
        return $this->partnerMapper->insert($partner);
    }

    public function updatePartner(int $id, array $data, string $userId): Partner {
        $partner = $this->getPartnerForUser($id, $userId);
        if (isset($data['partnerType']) && !in_array($data['partnerType'], ['tenant', 'owner'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid partner type.'));
        }
        $fields = ['partnerType', 'name', 'street', 'zip', 'city', 'country', 'email', 'phone', 'customerRef', 'notes', 'ncUserId'];
        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $setter = 'set' . ucfirst($field);
                $partner->$setter($data[$field] !== '' ? $data[$field] : null);
            }
        }
        if (trim((string)$partner->getName()) === '') {
            throw new \InvalidArgumentException($this->l10n->t('Partner name is required.'));
        }
        $partner->setUpdatedAt(time());
        return $this->partnerMapper->update($partner);
    }

    public function deletePartner(int $id, string $userId): void {
        $partner = $this->getPartnerForUser($id, $userId);
        $relations = $this->partnerRelMapper->findForTenancy($partner->getId(), $userId);
        if (count($relations) > 0) {
            throw new \RuntimeException($this->l10n->t('Partner is linked and cannot be deleted.'));
        }
        $this->partnerMapper->delete($partner);
    }
}

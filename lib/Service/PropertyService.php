<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\DocumentLinkMapper;
use OCA\Domus\Db\PartnerRelMapper;
use OCA\Domus\Db\Property;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

class PropertyService {
    public function __construct(
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private BookingMapper $bookingMapper,
        private DocumentLinkMapper $documentLinkMapper,
        private PartnerRelMapper $partnerRelMapper,
        private TenancyMapper $tenancyMapper,
        private DocumentPathService $documentPathService,
        private IL10N $l10n,
        private LoggerInterface $logger,
    ) {
    }

    public function listPropertiesForUser(string $userId): array {
        $properties = $this->propertyMapper->findByUser($userId);
        foreach ($properties as $property) {
            $this->enrichProperty($property);
        }
        return $properties;
    }

    public function getPropertyForUser(int $id, string $userId): Property {
        $property = $this->propertyMapper->findForUser($id, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }
        $this->enrichProperty($property);
        return $property;
    }

    public function createProperty(array $data, string $userId): Property {
        if (!isset($data['name']) || trim((string)$data['name']) === '') {
            throw new \InvalidArgumentException($this->l10n->t('Property name cannot be empty.'));
        }
        if (!in_array($data['usageRole'] ?? '', ['manager', 'landlord'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid usage role.'));
        }
        $now = time();
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
        $property->setDocumentPath($this->documentPathService->buildPropertyPath($property->getName()));
        $property->setCreatedAt($now);
        $property->setUpdatedAt($now);

        return $this->propertyMapper->insert($property);
    }

    public function updateProperty(int $id, array $data, string $userId): Property {
        $property = $this->getPropertyForUser($id, $userId);
        if (isset($data['name']) && trim((string)$data['name']) === '') {
            throw new \InvalidArgumentException($this->l10n->t('Property name cannot be empty.'));
        }
        $fields = ['name', 'street', 'zip', 'city', 'country', 'type', 'description'];
        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $setter = 'set' . ucfirst($field);
                $property->$setter($data[$field] ?: null);
            }
        }
        if (isset($data['usageRole'])) {
            if (!in_array($data['usageRole'], ['manager', 'landlord'], true)) {
                throw new \InvalidArgumentException($this->l10n->t('Invalid usage role.'));
            }
            $property->setUsageRole($data['usageRole']);
        }
        $property->setUpdatedAt(time());

        return $this->propertyMapper->update($property);
    }

    public function deleteProperty(int $id, string $userId): void {
        $property = $this->getPropertyForUser($id, $userId);
        $unitCount = $this->unitMapper->countByProperty($id, $userId);
        if ($unitCount > 0) {
            throw new \RuntimeException($this->l10n->t('Cannot delete property with existing units.'));
        }
        $this->partnerRelMapper->deleteForRelation('property', $property->getId(), $userId);
        $this->propertyMapper->delete($property);
    }

    private function enrichProperty(Property $property): void {
        try {
            $units = $this->unitMapper->findByUser($property->getUserId(), $property->getId());
            $property->setUnits($units);
            $property->setUnitCount(count($units));

            $bookings = $this->bookingMapper->findByUser($property->getUserId(), ['propertyId' => $property->getId()]);
            $bookingIds = array_values(array_filter(array_map(fn($booking) => $booking->getId(), $bookings)));
            if ($bookingIds !== []) {
                $documentedIds = $this->documentLinkMapper->findEntityIdsWithDocuments($property->getUserId(), 'booking', $bookingIds);
                $documentedLookup = array_fill_keys($documentedIds, true);
                foreach ($bookings as $booking) {
                    $booking->setHasDocuments(isset($documentedLookup[$booking->getId()]));
                }
            }
            $property->setBookings($bookings);
            $annualResult = 0.0;
            foreach ($bookings as $booking) {
                $amount = (float)$booking->getAmount();
                $annualResult += $amount;
            }
            $property->setAnnualResult(number_format($annualResult, 2, '.', ''));
            $property->setAnnualRentSum($this->calculateRentSum($property));
        } catch (\Throwable $e) {
            $this->logger->warning('Failed enriching property', ['message' => $e->getMessage()]);
        }
    }

    private function calculateRentSum(Property $property): ?string {
        try {
            $tenancies = $this->tenancyMapper->findByUser($property->getUserId());
            $sum = 0.0;
            foreach ($tenancies as $tenancy) {
                $sum += (float)$tenancy->getBaseRent();
            }
            return number_format($sum * 12, 2, '.', '');
        } catch (\Throwable $e) {
            $this->logger->warning('Failed calculating rent sum', ['message' => $e->getMessage()]);
            return null;
        }
    }
}

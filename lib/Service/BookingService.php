<?php

namespace OCA\Domus\Service;
use OCA\Domus\Db\Booking;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\DocumentLinkMapper;
use OCA\Domus\Db\DistributionKeyMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class BookingService {
    public function __construct(
        private BookingMapper $bookingMapper,
        private DocumentLinkMapper $documentLinkMapper,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private DistributionKeyMapper $distributionKeyMapper,
        private AccountService $accountService,
        private IL10N $l10n,
    ) {
    }

    public function listBookings(string $userId, array $filter = []): array {
        $bookings = $this->bookingMapper->findByUser($userId, $filter);
        $bookingIds = array_values(array_filter(array_map(fn(Booking $booking) => $booking->getId(), $bookings)));
        if ($bookingIds === []) {
            return $bookings;
        }

        $documentedIds = $this->documentLinkMapper->findEntityIdsWithDocuments($userId, 'booking', $bookingIds);
        $documentedLookup = array_fill_keys($documentedIds, true);
        foreach ($bookings as $booking) {
            $booking->setHasDocuments(isset($documentedLookup[$booking->getId()]));
        }

        return $bookings;
    }

    public function getBookingForUser(int $id, string $userId): Booking {
        $booking = $this->bookingMapper->findForUser($id, $userId);
        if (!$booking) {
            throw new \RuntimeException($this->l10n->t('Booking not found.'));
        }
        return $booking;
    }

    public function createBooking(array $data, string $userId): Booking {
        $data['deliveryDate'] = $data['deliveryDate'] ?? $data['date'] ?? null;
        $this->assertBookingInput($data, $userId);
        $now = time();
        $booking = new Booking();
        $booking->setUserId($userId);
        $booking->setAccount((int)$data['account']);
        $booking->setDate($data['date']);
        $booking->setDeliveryDate($data['deliveryDate']);
        $booking->setAmount($data['amount']);
        $booking->setYear((int)substr($data['date'], 0, 4));
        $booking->setPropertyId($data['propertyId'] ?? null);
        $booking->setUnitId($data['unitId'] ?? null);
        $booking->setDistributionKeyId($data['distributionKeyId'] ?? null);
        $booking->setStatus('draft');
        $booking->setPeriodFrom($data['periodFrom'] ?? $data['date']);
        $booking->setPeriodTo($data['periodTo'] ?? $data['date']);
        $booking->setDescription($data['description'] ?? null);
        $booking->setCreatedAt($now);
        $booking->setUpdatedAt($now);
        return $this->bookingMapper->insert($booking);
    }

    public function updateBooking(int $id, array $data, string $userId): Booking {
        $booking = $this->getBookingForUser($id, $userId);
        if ($booking->getStatus() !== null && $booking->getStatus() !== 'draft') {
            throw new \RuntimeException($this->l10n->t('Only draft bookings can be updated.'));
        }
        $merged = array_merge($booking->jsonSerialize(), $data);
        if ((empty($merged['deliveryDate']) || !isset($merged['deliveryDate'])) && !empty($merged['date'])) {
            $merged['deliveryDate'] = $merged['date'];
        }
        $this->assertBookingInput($merged, $userId);

        $setters = [
            'account' => 'setAccount',
            'date' => 'setDate',
            'deliveryDate' => 'setDeliveryDate',
            'amount' => 'setAmount',
            'propertyId' => 'setPropertyId',
            'unitId' => 'setUnitId',
            'distributionKeyId' => 'setDistributionKeyId',
            'periodFrom' => 'setPeriodFrom',
            'periodTo' => 'setPeriodTo',
            'description' => 'setDescription',
        ];

        foreach ($setters as $field => $setter) {
            if (array_key_exists($field, $data)) {
                $value = $field === 'account' ? (int)$data[$field] : $data[$field];
                $booking->$setter($value);
            }
        }
        if (isset($data['date'])) {
            $booking->setYear((int)substr($booking->getDate(), 0, 4));
        }
        if (!isset($data['deliveryDate']) && $booking->getDeliveryDate() === null) {
            $booking->setDeliveryDate($booking->getDate());
        }
        $booking->setUpdatedAt(time());
        return $this->bookingMapper->update($booking);
    }

    public function deleteBooking(int $id, string $userId): void {
        $booking = $this->getBookingForUser($id, $userId);
        $this->bookingMapper->delete($booking);
    }

    private function assertBookingInput(array $data, string $userId): void {
        if (!isset($data['date']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$data['date'])) {
            throw new \InvalidArgumentException($this->l10n->t('Invoice date is required.'));
        }
        if (!isset($data['deliveryDate']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$data['deliveryDate'])) {
            throw new \InvalidArgumentException($this->l10n->t('Delivery date is required.'));
        }
        if (!isset($data['amount']) || (float)$data['amount'] < 0) {
            throw new \InvalidArgumentException($this->l10n->t('Amount must be at least 0.'));
        }
        if (!isset($data['account'])) {
            throw new \InvalidArgumentException($this->l10n->t('Account is required.'));
        }
        $this->accountService->assertAccountNumber((string)$data['account']);
        $this->accountService->assertAccountActive((string)$data['account']);
        if (!isset($data['propertyId']) && !isset($data['unitId'])) {
            throw new \InvalidArgumentException($this->l10n->t('At least one relation is required.'));
        }
        if (isset($data['propertyId']) && !$this->propertyMapper->findForUser((int)$data['propertyId'], $userId)) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }
        if (isset($data['unitId']) && !$this->unitMapper->findForUser((int)$data['unitId'], $userId)) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        $periodFrom = $data['periodFrom'] ?? $data['date'];
        $periodTo = $data['periodTo'] ?? $data['date'];
        foreach (['periodFrom' => $periodFrom, 'periodTo' => $periodTo] as $label => $value) {
            if ($value !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$value)) {
                throw new \InvalidArgumentException($this->l10n->t('Invalid period definition.'));
            }
        }
        if ($periodFrom !== null && $periodTo !== null && $periodFrom > $periodTo) {
            throw new \InvalidArgumentException($this->l10n->t('Period start must be before period end.'));
        }
        if (isset($data['distributionKeyId'])) {
            if (!isset($data['propertyId'])) {
                throw new \InvalidArgumentException($this->l10n->t('Distribution keys require a property.'));
            }
            $distributionKey = $this->distributionKeyMapper->findForUser((int)$data['distributionKeyId'], $userId);
            if (!$distributionKey) {
                throw new \RuntimeException($this->l10n->t('Distribution key not found.'));
            }
            if ((int)$distributionKey->getPropertyId() !== (int)$data['propertyId']) {
                throw new \InvalidArgumentException($this->l10n->t('Distribution key does not belong to the property.'));
            }
            $isKeyValid = $distributionKey->getValidFrom() <= $periodTo && ($distributionKey->getValidTo() === null || $distributionKey->getValidTo() >= $periodFrom);
            if (!$isKeyValid) {
                throw new \InvalidArgumentException($this->l10n->t('Distribution key is not valid for the selected period.'));
            }
        }
    }

    public function sumByAccountGrouped(string $userId, ?int $year, string $groupBy, ?int $groupId = null): array {
        return $this->bookingMapper->sumByAccountGrouped($userId, $year, $groupBy, $groupId);
    }

    /**
     * @param string[] $accounts
     */
    public function sumByAccountPerYear(string $userId, array $accounts): array {
        return $this->bookingMapper->sumByAccountPerYear($userId, $accounts);
    }
}

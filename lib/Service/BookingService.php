<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Booking;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class BookingService {
    public function __construct(
        private BookingMapper $bookingMapper,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private TenancyMapper $tenancyMapper,
        private IL10N $l10n,
    ) {
    }

    public function listBookings(string $userId, array $filter = []): array {
        return $this->bookingMapper->findByUser($userId, $filter);
    }

    public function getBookingForUser(int $id, string $userId): Booking {
        $booking = $this->bookingMapper->findForUser($id, $userId);
        if (!$booking) {
            throw new \RuntimeException($this->l10n->t('Booking not found.'));
        }
        return $booking;
    }

    public function createBooking(array $data, string $userId): Booking {
        $this->assertBookingInput($data, $userId);
        $now = time();
        $booking = new Booking();
        $booking->setUserId($userId);
        $booking->setBookingType($data['bookingType']);
        $booking->setCategory($data['category']);
        $booking->setDate($data['date']);
        $booking->setAmount($data['amount']);
        $booking->setYear((int)substr($data['date'], 0, 4));
        $booking->setPropertyId($data['propertyId'] ?? null);
        $booking->setUnitId($data['unitId'] ?? null);
        $booking->setTenancyId($data['tenancyId'] ?? null);
        $booking->setDescription($data['description'] ?? null);
        $booking->setCreatedAt($now);
        $booking->setUpdatedAt($now);
        return $this->bookingMapper->insert($booking);
    }

    public function updateBooking(int $id, array $data, string $userId): Booking {
        $booking = $this->getBookingForUser($id, $userId);
        $merged = array_merge($booking->jsonSerialize(), $data);
        $this->assertBookingInput($merged, $userId);
        foreach (['bookingType', 'category', 'date', 'amount', 'propertyId', 'unitId', 'tenancyId', 'description'] as $field) {
            if (array_key_exists($field, $data)) {
                $setter = 'set' . ucfirst($field);
                $booking->$setter($data[$field]);
            }
        }
        if (isset($data['date'])) {
            $booking->setYear((int)substr($booking->getDate(), 0, 4));
        }
        $booking->setUpdatedAt(time());
        return $this->bookingMapper->update($booking);
    }

    public function deleteBooking(int $id, string $userId): void {
        $booking = $this->getBookingForUser($id, $userId);
        $this->bookingMapper->delete($booking);
    }

    private function assertBookingInput(array $data, string $userId): void {
        if (!in_array($data['bookingType'] ?? '', ['income', 'expense'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid booking type.'));
        }
        if (!isset($data['date']) || !preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', (string)$data['date'])) {
            throw new \InvalidArgumentException($this->l10n->t('Date is required.'));
        }
        if (!isset($data['amount']) || (float)$data['amount'] < 0) {
            throw new \InvalidArgumentException($this->l10n->t('Amount must be at least 0.'));
        }
        if (!isset($data['propertyId']) && !isset($data['unitId']) && !isset($data['tenancyId'])) {
            throw new \InvalidArgumentException($this->l10n->t('At least one relation is required.'));
        }
        if (isset($data['propertyId']) && !$this->propertyMapper->findForUser((int)$data['propertyId'], $userId)) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }
        if (isset($data['unitId']) && !$this->unitMapper->findForUser((int)$data['unitId'], $userId)) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        if (isset($data['tenancyId']) && !$this->tenancyMapper->findForUser((int)$data['tenancyId'], $userId)) {
            throw new \RuntimeException($this->l10n->t('Tenancy not found.'));
        }
    }
}

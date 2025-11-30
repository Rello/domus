<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Booking;
use OCA\Domus\Db\BookingMapper;
use OCP\IL10N;

class BookingService {
    public function __construct(private BookingMapper $bookingMapper, private IL10N $l10n) {
    }

    /** @return Booking[] */
    public function list(string $userId): array {
        $qb = $this->bookingMapper->getQueryBuilder();
        $qb->select('*')->from('domus_bookings')->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        return $this->bookingMapper->findEntities($qb);
    }

    public function getById(int $id, string $userId): Booking {
        $qb = $this->bookingMapper->getQueryBuilder();
        $qb->select('*')->from('domus_bookings')
            ->where($qb->expr()->eq('id', $qb->createNamedParameter($id)))
            ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));
        $booking = $this->bookingMapper->findEntity($qb);
        if ($booking === null) {
            throw new \RuntimeException($this->l10n->t('Booking not found.'));
        }
        return $booking;
    }

    public function create(array $data, string $userId): Booking {
        $this->assertRequired($data, ['bookingType', 'category', 'amount', 'date']);
        $booking = new Booking();
        $booking->setUserId($userId);
        $booking->setPropertyId(isset($data['propertyId']) ? (int)$data['propertyId'] : null);
        $booking->setUnitId(isset($data['unitId']) ? (int)$data['unitId'] : null);
        $booking->setTenancyId(isset($data['tenancyId']) ? (int)$data['tenancyId'] : null);
        $booking->setBookingType($data['bookingType']);
        $booking->setCategory($data['category']);
        $booking->setAmount((float)$data['amount']);
        $booking->setDate($data['date']);
        $booking->setDescription($data['description'] ?? null);
        $booking->setCreatedAt(time());
        $booking->setUpdatedAt(time());
        return $this->bookingMapper->insert($booking);
    }

    public function update(int $id, array $data, string $userId): Booking {
        $booking = $this->getById($id, $userId);
        foreach ($data as $key => $value) {
            $method = 'set' . ucfirst($key);
            if (method_exists($booking, $method)) {
                $booking->$method($value);
            }
        }
        $booking->setUpdatedAt(time());
        return $this->bookingMapper->update($booking);
    }

    public function delete(int $id, string $userId): void {
        $booking = $this->getById($id, $userId);
        $this->bookingMapper->delete($booking);
    }

    private function assertRequired(array $data, array $required): void {
        foreach ($required as $field) {
            if (!isset($data[$field]) || $data[$field] === '') {
                throw new \InvalidArgumentException($this->l10n->t('%s is required.', [$field]));
            }
        }
    }
}

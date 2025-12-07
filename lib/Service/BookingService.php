<?php

namespace OCA\Domus\Service;

use OCA\Domus\Accounting\Accounts;
use OCA\Domus\Db\Booking;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class BookingService {
    private array $exampleRule = [
        ['op' => 'add', 'args' => ['1000', '1001']],
        ['op' => 'div', 'args' => ['prev', '1000']],
    ];

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
        $booking->setAccount((int)$data['account']);
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

        $setters = [
            'account' => 'setAccount',
            'date' => 'setDate',
            'amount' => 'setAmount',
            'propertyId' => 'setPropertyId',
            'unitId' => 'setUnitId',
            'tenancyId' => 'setTenancyId',
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
        $booking->setUpdatedAt(time());
        return $this->bookingMapper->update($booking);
    }

    public function deleteBooking(int $id, string $userId): void {
        $booking = $this->getBookingForUser($id, $userId);
        $this->bookingMapper->delete($booking);
    }

    private function assertBookingInput(array $data, string $userId): void {
        if (!isset($data['date']) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$data['date'])) {
            throw new \InvalidArgumentException($this->l10n->t('Date is required.'));
        }
        if (!isset($data['amount']) || (float)$data['amount'] < 0) {
            throw new \InvalidArgumentException($this->l10n->t('Amount must be at least 0.'));
        }
        if (!isset($data['account'])) {
            throw new \InvalidArgumentException($this->l10n->t('Account is required.'));
        }
        if (!Accounts::exists((string)$data['account'])) {
            throw new \InvalidArgumentException($this->l10n->t('Account is invalid.'));
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

    public function loadAccountSums(string $userId, ?int $propertyId = null, ?int $unitId = null, int $year): array {
        $rows = $this->bookingMapper->sumByAccount($userId, $year, $propertyId, $unitId);
        $sums = [];
        foreach ($rows as $row) {
            if (!isset($row['account'])) {
                continue;
            }
            $account = (string)$row['account'];
            $sums[$account] = (float)($row['total'] ?? 0.0);
        }
        return $sums;
    }

    public function calculateExampleRule(string $userId, int $year, string $groupBy = 'property'): array {
        $grouping = $groupBy === 'unit' ? 'unit' : 'property';
        $groupColumn = $grouping === 'unit' ? 'unit_id' : 'property_id';
        $rows = $this->bookingMapper->sumByAccountGrouped($userId, $year, $grouping);
        $groupedSums = [];
        foreach ($rows as $row) {
            if (!isset($row[$groupColumn], $row['account'])) {
                continue;
            }
            $groupId = (int)$row[$groupColumn];
            $account = (string)$row['account'];
            $groupedSums[$groupId][$account] = (float)($row['total'] ?? 0.0);
        }

        $groupKey = $grouping === 'unit' ? 'unitId' : 'propertyId';
        $results = [];
        foreach ($groupedSums as $groupId => $sums) {
            $results[] = [
                'year' => $year,
                $groupKey => $groupId,
                'value' => $this->evalRule($sums, $this->exampleRule),
            ];
        }
        return $results;
    }

    public function evalRule(array $sums, array $rule): float {
        $prev = 0.0;

        foreach ($rule as $step) {
            $op = $step['op'] ?? '';
            $args = $step['args'] ?? [];
            $values = array_map(function ($arg) use (&$prev, $sums) {
                if ($arg === 'prev') {
                    return $prev;
                }
                return $this->get($sums, (string)$arg);
            }, $args);

            switch ($op) {
                case 'add':
                    $prev = $this->addValues(...$values);
                    break;
                case 'div':
                    $prev = $this->divValues($values[0] ?? 0.0, $values[1] ?? 0.0);
                    break;
                default:
                    throw new \InvalidArgumentException($this->l10n->t('Unsupported operation.'));
            }
        }

        return $prev;
    }

    public function get(array $sums, string $nr): float {
        return (float)($sums[$nr] ?? 0.0);
    }

    public function addValues(float ...$values): float {
        return array_sum($values);
    }

    public function divValues(float $a, float $b): float {
        if ($b == 0.0) {
            throw new \DivisionByZeroError($this->l10n->t('Division by zero.'));
        }
        return $a / $b;
    }
}

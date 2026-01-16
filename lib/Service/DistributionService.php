<?php

namespace OCA\Domus\Service;
use OCA\Domus\Db\Booking;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\DistributionKey;
use OCA\Domus\Db\DistributionKeyMapper;
use OCA\Domus\Db\DistributionKeyUnitMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\DB\Exception as DbException;
use OCP\IDBConnection;
use OCP\IL10N;

class DistributionService {
    public function __construct(
        private BookingMapper $bookingMapper,
        private DistributionKeyMapper $distributionKeyMapper,
        private DistributionKeyUnitMapper $distributionKeyUnitMapper,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private AccountService $accountService,
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    /**
     * @throws DbException
     */
    public function distribute(int $bookingId, string $userId): array {
        $context = $this->buildDistributionContext($bookingId, $userId);
        $booking = $context['booking'];

        if ($booking->getStatus() !== 'draft') {
            throw new \RuntimeException($this->l10n->t('Only draft bookings can be distributed.'));
        }

        $preview = $this->buildPreview($context);
        $now = time();

        $this->connection->beginTransaction();
        try {
            foreach ($preview['shares'] as $share) {
                $unitBooking = new Booking();
                $unitBooking->setUserId($userId);
                $unitBooking->setAccount($booking->getAccount());
                $unitBooking->setDate($booking->getDate());
                $unitBooking->setDeliveryDate($booking->getDeliveryDate() ?? $booking->getDate());
                $unitBooking->setAmount((string)$share['amount']);
                $unitBooking->setYear((int)$booking->getYear());
                $unitBooking->setPropertyId($booking->getPropertyId());
                $unitBooking->setUnitId($share['unitId']);
                $unitBooking->setDescription($booking->getDescription());
                $unitBooking->setDistributionKeyId($booking->getDistributionKeyId());
                $unitBooking->setStatus('locked');
                $unitBooking->setPeriodFrom($context['period']['from']);
                $unitBooking->setPeriodTo($context['period']['to']);
                $unitBooking->setSourcePropertyBookingId($booking->getId());
                $unitBooking->setCreatedAt($now);
                $unitBooking->setUpdatedAt($now);
                $this->bookingMapper->insert($unitBooking);
            }

            $booking->setStatus('distributed');
            $booking->setUpdatedAt($now);
            $this->bookingMapper->update($booking);

            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }

        $context['booking'] = $booking;

        return $this->buildPreview($context);
    }

    /**
     * @throws DbException
     */
    public function buildReport(int $propertyId, int $unitId, int $year, string $userId): array {
        $property = $this->propertyMapper->findForUser($propertyId, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }

        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
        if ((int)$unit->getPropertyId() !== (int)$propertyId) {
            throw new \InvalidArgumentException($this->l10n->t('Unit does not belong to the selected property.'));
        }

        $bookings = $this->bookingMapper->findByUser($userId, ['year' => $year, 'propertyId' => $propertyId]);
        $units = $this->unitMapper->findByUser($userId, $propertyId);
        if (empty($units)) {
            throw new \RuntimeException($this->l10n->t('No units found for this property.'));
        }

        $distributionKeys = $this->distributionKeyMapper->findByProperty($propertyId, $userId);
        $distributionMap = [];
        foreach ($distributionKeys as $distributionKey) {
            $distributionMap[$distributionKey->getId()] = $distributionKey;
        }

        $topAccountMap = $this->accountService->getTopAccountNumberMap();
        $rows = [];
        foreach ($bookings as $booking) {
            $distributionKeyId = $booking->getDistributionKeyId();
            if ($booking->getUnitId() !== null) {
                if ((int)$booking->getUnitId() !== $unitId || $distributionKeyId !== null) {
                    continue;
                }
                $account = $this->accountService->resolveTopAccountNumber((string)$booking->getAccount(), $topAccountMap);
                if (!isset($rows[$account])) {
                    $rows[$account] = [
                        'bookingId' => $booking->getId(),
                        'account' => $account,
                        'accountLabel' => $this->accountService->label($account, $this->l10n),
                        'date' => $booking->getDate(),
                        'distributionKeyId' => null,
                        'distributionKeyName' => $this->l10n->t('Unit allocation'),
                        'distributionKeyType' => 'unit-allocation',
                        'shareValue' => 1,
                        'shareBase' => 1,
                        'weight' => 1,
                        'total' => 0.0,
                        'amount' => 0.0,
                    ];
                }

                $rows[$account]['total'] += (float)$booking->getAmount();
                $rows[$account]['amount'] += (float)$booking->getAmount();
                continue;
            }

            if ($distributionKeyId === null) {
                continue;
            }
            $distributionKey = $distributionMap[$distributionKeyId] ?? null;
            if (!$distributionKey) {
                continue;
            }
            $period = $this->getBookingPeriod($booking);
            $this->assertKeyInPeriod($distributionKey, $period);
            $unitValues = $this->collectUnitValues($distributionKey, $period, $userId, $units);
            $shareDetails = $this->calculateShareDetails($distributionKey, $units, $unitValues);
            $shareValue = $shareDetails['shares'][$unitId] ?? null;
            $shareBase = $shareDetails['base'] ?? null;
            if ($shareValue === null || $shareBase === null || (float)$shareBase <= 0) {
                throw new \RuntimeException($this->l10n->t('Selected unit is not part of the distribution.'));
            }
            $weight = (float)$shareValue / (float)$shareBase;
            $shareAmount = round((float)$booking->getAmount() * $weight, 2);

            $account = $this->accountService->resolveTopAccountNumber((string)$booking->getAccount(), $topAccountMap);
            if (!isset($rows[$account])) {
                $rows[$account] = [
                    'bookingId' => $booking->getId(),
                    'account' => $account,
                    'accountLabel' => $this->accountService->label($account, $this->l10n),
                    'date' => $booking->getDate(),
                    'distributionKeyId' => $distributionKey->getId(),
                    'distributionKeyName' => $distributionKey->getName(),
                    'distributionKeyType' => $distributionKey->getType(),
                    'shareValue' => $shareValue,
                    'shareBase' => $shareBase,
                    'weight' => $weight,
                    'total' => 0.0,
                    'amount' => 0.0,
                ];
            }

            $rows[$account]['total'] += (float)$booking->getAmount();
            $rows[$account]['amount'] += $shareAmount;
        }

        $rows = array_values($rows);
        usort($rows, fn($a, $b) => strcmp((string)($a['date'] ?? ''), (string)($b['date'] ?? '')));

        return $rows;
    }

    /**
     * @throws DbException
     */
    public function reverse(int $bookingId, string $userId): void {
        $booking = $this->bookingMapper->findForUser($bookingId, $userId);
        if (!$booking) {
            throw new \RuntimeException($this->l10n->t('Booking not found.'));
        }
        if ($booking->getStatus() !== 'distributed') {
            throw new \RuntimeException($this->l10n->t('Only distributed bookings can be reversed.'));
        }

        $unitBookings = $this->bookingMapper->findBySourceProperty($bookingId, $userId);
        if (empty($unitBookings)) {
            throw new \RuntimeException($this->l10n->t('No unit bookings found for reversal.'));
        }

        $now = time();
        $this->connection->beginTransaction();
        try {
            foreach ($unitBookings as $unitBooking) {
                $reversal = new Booking();
                $reversal->setUserId($userId);
                $reversal->setAccount($unitBooking->getAccount());
                $reversal->setDate($unitBooking->getDate());
                $reversal->setDeliveryDate($unitBooking->getDeliveryDate() ?? $unitBooking->getDate());
                $reversal->setAmount((string)(-1 * (float)$unitBooking->getAmount()));
                $reversal->setYear((int)$unitBooking->getYear());
                $reversal->setPropertyId($unitBooking->getPropertyId());
                $reversal->setUnitId($unitBooking->getUnitId());
                $reversal->setDescription($unitBooking->getDescription());
                $reversal->setDistributionKeyId($unitBooking->getDistributionKeyId());
                $reversal->setStatus('locked');
                $reversal->setPeriodFrom($unitBooking->getPeriodFrom());
                $reversal->setPeriodTo($unitBooking->getPeriodTo());
                $reversal->setSourcePropertyBookingId($booking->getId());
                $reversal->setCreatedAt($now);
                $reversal->setUpdatedAt($now);
                $this->bookingMapper->insert($reversal);
            }

            $booking->setStatus('locked');
            $booking->setUpdatedAt($now);
            $this->bookingMapper->update($booking);

            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }
    }

    /**
     * @throws DbException
     */
    private function buildDistributionContext(int $bookingId, string $userId): array {
        $booking = $this->bookingMapper->findForUser($bookingId, $userId);
        if (!$booking) {
            throw new \RuntimeException($this->l10n->t('Booking not found.'));
        }
        if ($booking->getPropertyId() === null) {
            throw new \RuntimeException($this->l10n->t('Distribution is only available for property bookings.'));
        }

        $property = $this->propertyMapper->findForUser((int)$booking->getPropertyId(), $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }

        $distributionKeyId = $booking->getDistributionKeyId();
        if ($distributionKeyId === null) {
            throw new \RuntimeException($this->l10n->t('No distribution key selected.'));
        }
        $distributionKey = $this->distributionKeyMapper->findForUser((int)$distributionKeyId, $userId);
        if (!$distributionKey || (int)$distributionKey->getPropertyId() !== (int)$booking->getPropertyId()) {
            throw new \RuntimeException($this->l10n->t('Distribution key not found for this property.'));
        }

        $period = $this->getBookingPeriod($booking);
        $this->assertKeyInPeriod($distributionKey, $period);

        $units = $this->unitMapper->findByUser($userId, (int)$booking->getPropertyId());
        if (empty($units)) {
            throw new \RuntimeException($this->l10n->t('No units found for this property.'));
        }

        $unitValues = $this->collectUnitValues($distributionKey, $period, $userId, $units);
        $weights = $this->calculateWeights($distributionKey, $units, $unitValues);

        return [
            'booking' => $booking,
            'distributionKey' => $distributionKey,
            'units' => $units,
            'period' => $period,
            'weights' => $weights,
        ];
    }

    private function buildPreview(array $context): array {
        $booking = $context['booking'];
        $distributionKey = $context['distributionKey'];
        $units = $context['units'];
        $period = $context['period'];
        $weights = $context['weights'];

        $amount = (float)$booking->getAmount();
        $shares = $this->allocateShares($units, $weights, $amount);

        return [
            'bookingId' => $booking->getId(),
            'status' => $booking->getStatus(),
            'distributionKey' => [
                'id' => $distributionKey->getId(),
                'type' => $distributionKey->getType(),
                'name' => $distributionKey->getName(),
            ],
            'period' => $period,
            'total' => $amount,
            'shares' => array_values($shares),
        ];
    }

    private function allocateShares(array $units, array $weights, float $amount): array {
        $result = [];
        $runningTotal = 0.0;
        $unitCount = count($units);

        foreach ($units as $index => $unit) {
            $unitId = $unit->getId();
            if (!array_key_exists($unitId, $weights)) {
                throw new \RuntimeException($this->l10n->t('Missing distribution weight for unit %s.', [$unit->getLabel()]));
            }
            $weight = $weights[$unitId];
            if ($index === $unitCount - 1) {
                $shareAmount = round($amount - $runningTotal, 2);
            } else {
                $shareAmount = round($amount * $weight, 2);
                $runningTotal += $shareAmount;
            }

            $result[$unitId] = [
                'unitId' => $unitId,
                'unitLabel' => $unit->getLabel(),
                'amount' => $shareAmount,
                'weight' => $weight,
            ];
        }

        return $result;
    }

    /**
     * @throws DbException
     */
    private function collectUnitValues(DistributionKey $distributionKey, array $period, string $userId, array $units): array {
        $values = [];
        $entries = $this->distributionKeyUnitMapper->findValidForKey((int)$distributionKey->getId(), $userId, $period['from'], $period['to']);
        foreach ($entries as $entry) {
            $unitId = $entry->getUnitId();
            $current = $values[$unitId] ?? null;
            if ($current === null || $entry->getValidFrom() > $current['validFrom']) {
                $values[$unitId] = [
                    'value' => (float)$entry->getValue(),
                    'validFrom' => $entry->getValidFrom(),
                ];
            }
        }

        $type = strtolower($distributionKey->getType());

        if ($type === 'unit') {
            foreach ($units as $unit) {
                $unitId = $unit->getId();
                if (!array_key_exists($unitId, $values)) {
                    $values[$unitId] = ['value' => 1];
                }
            }
        }

        if ($type === 'area') {
            foreach ($units as $unit) {
                $unitId = $unit->getId();
                if (array_key_exists($unitId, $values)) {
                    continue;
                }
                $livingArea = $unit->getLivingArea();
                if ($livingArea === null || $livingArea === '') {
                    throw new \RuntimeException($this->l10n->t('Living area is missing for unit %s.', [$unit->getLabel()]));
                }
                $values[$unitId] = ['value' => (float)$livingArea];
            }
        }

        return array_map(fn($entry) => $entry['value'], $values);
    }

    private function calculateWeights(DistributionKey $distributionKey, array $units, array $unitValues): array {
        return $this->calculateWeightsByType($distributionKey->getType(), $units, $unitValues, $distributionKey);
    }

    private function calculateWeightsByType(string $type, array $units, array $unitValues, ?DistributionKey $distributionKey = null): array {
        $type = strtolower($type);
        if ($type === 'mixed') {
            if ($distributionKey === null) {
                throw new \RuntimeException($this->l10n->t('Mixed distribution requires configuration.'));
            }
            return $this->calculateMixedWeights($distributionKey, $units, $unitValues);
        }

        if (in_array($type, ['area', 'mea', 'unit'], true)) {
            if ($distributionKey === null) {
                throw new \RuntimeException($this->l10n->t('Distribution configuration is missing.'));
            }
            return $this->calculateBaseWeights($distributionKey, $units, $unitValues);
        }

        if (in_array($type, ['persons', 'consumption', 'manual'], true)) {
            return $this->calculateProportionalWeights($units, $unitValues);
        }

        throw new \RuntimeException($this->l10n->t('Unsupported distribution type.'));
    }

    private function calculateShareDetails(DistributionKey $distributionKey, array $units, array $unitValues): array {
        $type = strtolower($distributionKey->getType());
        if ($type === 'mixed') {
            return $this->calculateMixedShareDetails($distributionKey, $units, $unitValues);
        }
        if (in_array($type, ['area', 'mea', 'unit'], true)) {
            $shares = $this->calculateRawValuesByType($type, $units, $unitValues);
            $base = $this->getDistributionBase($distributionKey);
            return ['shares' => $shares, 'base' => $base];
        }
        if (in_array($type, ['persons', 'consumption', 'manual'], true)) {
            $shares = $this->calculateRawValuesByType($type, $units, $unitValues);
            $base = array_sum($shares);
            if ($base <= 0) {
                throw new \RuntimeException($this->l10n->t('Distribution values must be greater than zero.'));
            }
            return ['shares' => $shares, 'base' => $base];
        }

        throw new \RuntimeException($this->l10n->t('Unsupported distribution type.'));
    }

    private function calculateMixedShareDetails(DistributionKey $distributionKey, array $units, array $unitValues): array {
        $config = $distributionKey->getConfigJson();
        $parts = [];
        if ($config !== null) {
            $decoded = json_decode((string)$config, true);
            if (is_array($decoded)) {
                $parts = $decoded;
            }
        }

        if (empty($parts)) {
            throw new \RuntimeException($this->l10n->t('Mixed distribution requires configuration.'));
        }

        $aggregated = [];
        foreach ($parts as $part) {
            if (!is_array($part) || !isset($part['type'], $part['weight'])) {
                continue;
            }
            $partWeight = (float)$part['weight'];
            if ($partWeight <= 0) {
                continue;
            }
            if ($part['type'] === 'mixed') {
                throw new \RuntimeException($this->l10n->t('Nested mixed distribution is not supported.'));
            }

            $rawValues = $this->calculateRawValuesByType($part['type'], $units, $unitValues);
            foreach ($units as $unit) {
                $unitId = $unit->getId();
                $partValue = $rawValues[$unitId] ?? 0;
                $aggregated[$unitId] = ($aggregated[$unitId] ?? 0) + ($partValue * $partWeight);
            }
        }

        if (empty($aggregated)) {
            throw new \RuntimeException($this->l10n->t('Mixed distribution configuration is invalid.'));
        }

        $base = array_sum($aggregated);
        if ($base <= 0) {
            throw new \RuntimeException($this->l10n->t('Distribution values must be greater than zero.'));
        }

        return ['shares' => $aggregated, 'base' => $base];
    }

    private function calculateRawValuesByType(string $type, array $units, array $unitValues): array {
        $type = strtolower($type);
        if ($type === 'unit') {
            $values = [];
            foreach ($units as $unit) {
                $values[$unit->getId()] = 1;
            }
            return $values;
        }

        if ($type === 'area') {
            $values = [];
            foreach ($units as $unit) {
                $unitId = $unit->getId();
                $livingArea = $unit->getLivingArea();
                if ($livingArea === null || $livingArea === '') {
                    throw new \RuntimeException($this->l10n->t('Living area is missing for unit %s.', [$unit->getLabel()]));
                }
                $values[$unitId] = (float)$livingArea;
            }
            return $values;
        }

        if (in_array($type, ['mea', 'persons', 'consumption', 'manual'], true)) {
            $values = [];
            foreach ($units as $unit) {
                $unitId = $unit->getId();
                if (!array_key_exists($unitId, $unitValues)) {
                    throw new \RuntimeException($this->l10n->t('Missing distribution value for unit %s.', [$unit->getLabel()]));
                }
                $values[$unitId] = (float)$unitValues[$unitId];
            }
            return $values;
        }

        throw new \RuntimeException($this->l10n->t('Unsupported distribution type.'));
    }

    private function calculateMixedWeights(DistributionKey $distributionKey, array $units, array $unitValues): array {
        $config = $distributionKey->getConfigJson();
        $parts = [];
        if ($config !== null) {
            $decoded = json_decode((string)$config, true);
            if (is_array($decoded)) {
                $parts = $decoded;
            }
        }

        if (empty($parts)) {
            throw new \RuntimeException($this->l10n->t('Mixed distribution requires configuration.'));
        }

        $aggregated = [];
        foreach ($parts as $part) {
            if (!is_array($part) || !isset($part['type'], $part['weight'])) {
                continue;
            }
            $partWeight = (float)$part['weight'];
            if ($partWeight <= 0) {
                continue;
            }
            if ($part['type'] === 'mixed') {
                throw new \RuntimeException($this->l10n->t('Nested mixed distribution is not supported.'));
            }
            $partDistribution = $this->calculateWeightsByType($part['type'], $units, $unitValues);
            foreach ($units as $unit) {
                $unitId = $unit->getId();
                $partValue = $partDistribution[$unitId] ?? 0;
                $aggregated[$unitId] = ($aggregated[$unitId] ?? 0) + ($partValue * $partWeight);
            }
        }

        if (empty($aggregated)) {
            throw new \RuntimeException($this->l10n->t('Mixed distribution configuration is invalid.'));
        }

        $sum = array_sum($aggregated);
        if ($sum <= 0) {
            throw new \RuntimeException($this->l10n->t('Distribution values must be greater than zero.'));
        }

        foreach ($aggregated as $unitId => $value) {
            $aggregated[$unitId] = $value / $sum;
        }

        return $aggregated;
    }

    private function calculateProportionalWeights(array $units, array $unitValues): array {
        $weights = [];
        foreach ($units as $unit) {
            $unitId = $unit->getId();
            if (!array_key_exists($unitId, $unitValues)) {
                throw new \RuntimeException($this->l10n->t('Missing distribution value for unit %s.', [$unit->getLabel()]));
            }
            $weights[$unitId] = (float)$unitValues[$unitId];
        }

        $sum = array_sum($weights);
        if ($sum <= 0) {
            throw new \RuntimeException($this->l10n->t('Distribution values must be greater than zero.'));
        }

        foreach ($weights as $unitId => $value) {
            $weights[$unitId] = $value / $sum;
        }

        return $weights;
    }

    private function calculateBaseWeights(DistributionKey $distributionKey, array $units, array $unitValues): array {
        $base = $this->getDistributionBase($distributionKey);
        $weights = [];
        foreach ($units as $unit) {
            $unitId = $unit->getId();
            if (!array_key_exists($unitId, $unitValues)) {
                throw new \RuntimeException($this->l10n->t('Missing distribution value for unit %s.', [$unit->getLabel()]));
            }
            $weights[$unitId] = (float)$unitValues[$unitId] / $base;
        }

        return $weights;
    }

    private function getDistributionBase(DistributionKey $distributionKey): float {
        $config = $distributionKey->getConfigJson();
        if ($config === null || trim((string)$config) === '') {
            throw new \RuntimeException($this->l10n->t('Distribution base is missing.'));
        }
        $decoded = json_decode((string)$config, true);
        $base = is_array($decoded) && isset($decoded['base']) ? (float)$decoded['base'] : 0.0;
        if ($base <= 0) {
            throw new \RuntimeException($this->l10n->t('Distribution base must be greater than zero.'));
        }

        return $base;
    }

    private function assertKeyInPeriod(DistributionKey $distributionKey, array $period): void {
        if ($distributionKey->getValidFrom() > $period['to']) {
            throw new \RuntimeException($this->l10n->t('Distribution key is not valid for the booking period.'));
        }
        if ($distributionKey->getValidTo() !== null && $distributionKey->getValidTo() < $period['from']) {
            throw new \RuntimeException($this->l10n->t('Distribution key is not valid for the booking period.'));
        }
    }

    private function getBookingPeriod(Booking $booking): array {
        $from = $booking->getPeriodFrom() ?? $booking->getDate();
        $to = $booking->getPeriodTo() ?? $from;

        if ($from > $to) {
            throw new \RuntimeException($this->l10n->t('Booking period is invalid.'));
        }

        return ['from' => $from, 'to' => $to];
    }
}

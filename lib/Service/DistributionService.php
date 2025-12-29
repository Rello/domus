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
        private IDBConnection $connection,
        private IL10N $l10n,
    ) {
    }

    /**
     * @throws DbException
     */
    public function calculatePreview(int $bookingId, string $userId): array {
        $context = $this->buildDistributionContext($bookingId, $userId, true);

        return $this->buildPreview($context);
    }

    /**
     * @throws DbException
     */
    public function distribute(int $bookingId, string $userId): array {
        $context = $this->buildDistributionContext($bookingId, $userId, false);
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
    private function buildDistributionContext(int $bookingId, string $userId, bool $enforceDraft): array {
        $booking = $this->bookingMapper->findForUser($bookingId, $userId);
        if (!$booking) {
            throw new \RuntimeException($this->l10n->t('Booking not found.'));
        }
        if ($booking->getPropertyId() === null) {
            throw new \RuntimeException($this->l10n->t('Distribution is only available for property bookings.'));
        }
        if ($enforceDraft && $booking->getStatus() !== 'draft') {
            throw new \RuntimeException($this->l10n->t('Distribution preview is only available for draft bookings.'));
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

        if ($type === 'unit') {
            return $this->calculateUnitWeights($units);
        }

        if (in_array($type, ['area', 'mea', 'persons', 'consumption', 'manual'], true)) {
            return $this->calculateProportionalWeights($units, $unitValues);
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

    private function calculateUnitWeights(array $units): array {
        $count = count($units);
        if ($count === 0) {
            throw new \RuntimeException($this->l10n->t('No units available for distribution.'));
        }
        $weight = 1 / $count;
        $weights = [];
        foreach ($units as $unit) {
            $weights[$unit->getId()] = $weight;
        }
        return $weights;
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

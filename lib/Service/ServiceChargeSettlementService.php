<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\PartnerMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class ServiceChargeSettlementService {
    private const HOUSE_FEE_ACCOUNT = '2000';
    private const PROPERTY_TAX_ACCOUNT = '2005';

    public function __construct(
        private TenancyService $tenancyService,
        private BookingMapper $bookingMapper,
        private PartnerMapper $partnerMapper,
        private UnitMapper $unitMapper,
        private DocumentService $documentService,
        private IL10N $l10n,
    ) {
    }

    public function listForUnit(string $userId, int $unitId, int $year): array {
        $tenancies = $this->tenancyService->listTenancies($userId, $unitId);
        $entries = [];
        $unitCharges = $this->sumBookingsForUnit($userId, $unitId, $year);

        foreach ($tenancies as $tenancy) {
            $months = $this->calculateMonthsWithinYear($tenancy->getStartDate(), $tenancy->getEndDate(), $year);
            if ($months <= 0) {
                continue;
            }

            $chargeShare = $months / 12;

            $partnerId = $tenancy->getPartnerIds()[0] ?? null;
            if ($partnerId === null) {
                continue;
            }

            $key = (string)$partnerId;
            if (!isset($entries[$key])) {
                $entries[$key] = [
                    'groupId' => 'partner-' . $partnerId,
                    'partnerId' => $partnerId,
                    'partnerName' => $tenancy->getPartnerName() ?: $this->l10n->t('Unknown partner'),
                    'tenancyIds' => [],
                    'serviceCharge' => 0.0,
                    'houseFee' => 0.0,
                    'propertyTax' => 0.0,
                    'saldo' => 0.0,
                ];
            }

            $serviceCharge = $months * (float)($tenancy->getServiceCharge() ?? 0.0);
            $entries[$key]['tenancyIds'][] = $tenancy->getId();
            $entries[$key]['serviceCharge'] += $serviceCharge;
            $entries[$key]['houseFee'] += $unitCharges['houseFee'] * $chargeShare;
            $entries[$key]['propertyTax'] += $unitCharges['propertyTax'] * $chargeShare;
            $entries[$key]['saldo'] = $entries[$key]['serviceCharge'] - $entries[$key]['houseFee'] - $entries[$key]['propertyTax'];
        }

        return array_values($entries);
    }

    public function createReport(string $userId, int $unitId, int $year, int $partnerId): array {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        $entries = $this->listForUnit($userId, $unitId, $year);
        $entry = null;
        foreach ($entries as $candidate) {
            if ((int)$candidate['partnerId'] === $partnerId) {
                $entry = $candidate;
                break;
            }
        }

        if ($entry === null) {
            throw new \InvalidArgumentException($this->l10n->t('No settlement data found for the selected partner.'));
        }

        $partner = $this->partnerMapper->findForUser($partnerId, $userId);
        if (!$partner) {
            throw new \RuntimeException($this->l10n->t('Partner not found.'));
        }

        $content = $this->buildReportMarkdown($partner->getName(), $partner->getStreet(), $partner->getZip(), $partner->getCity(), $partner->getCountry(), $year, $entry);

        $targets = [
            ['entityType' => 'unit', 'entityId' => $unitId],
            ['entityType' => 'partner', 'entityId' => $partnerId],
        ];
        foreach ($entry['tenancyIds'] as $tenancyId) {
            $targets[] = ['entityType' => 'tenancy', 'entityId' => $tenancyId];
        }

        $fileName = sprintf('%s_%s_%d.md',
            $unit->getLabel() ?: (string)$unit->getUnitNumber(),
            $partner->getName(),
            $year
        );

        $creation = $this->documentService->createContentForTargets(
            $userId,
            $targets,
            $fileName,
            $content,
            $year,
            $this->l10n->t('Nebenkostenabrechnung %d', [$year]),
            $this->l10n->t('Nebenkostenabrechnung')
        );

        $links = $creation['links'];

        return [
            'entry' => $entry,
            'documents' => $links,
        ];
    }

    private function calculateMonthsWithinYear(?string $startDate, ?string $endDate, int $year): int {
        $startOfYear = new \DateTimeImmutable(sprintf('%d-01-01', $year));
        $endOfYear = new \DateTimeImmutable(sprintf('%d-12-31', $year));

        try {
            $start = $startDate ? new \DateTimeImmutable($startDate) : null;
        } catch (\Throwable) {
            return 0;
        }

        try {
            $end = $endDate ? new \DateTimeImmutable($endDate) : null;
        } catch (\Throwable) {
            $end = null;
        }

        if ($start === null) {
            return 0;
        }

        $periodStart = $start > $startOfYear ? $start : $startOfYear;
        $periodEnd = ($end ?? $endOfYear) < $endOfYear ? ($end ?? $endOfYear) : $endOfYear;

        if ($periodEnd < $periodStart) {
            return 0;
        }

        return ($periodEnd->format('Y') - $periodStart->format('Y')) * 12
            + ($periodEnd->format('n') - $periodStart->format('n')) + 1;
    }

    private function sumBookingsForUnit(string $userId, int $unitId, int $year): array {
        $bookings = $this->bookingMapper->findByUser($userId, ['unitId' => $unitId, 'year' => $year]);
        $houseFee = 0.0;
        $propertyTax = 0.0;

        foreach ($bookings as $booking) {
            $account = (string)$booking->getAccount();
            if ($account === self::HOUSE_FEE_ACCOUNT) {
                $houseFee += (float)$booking->getAmount();
            }
            if ($account === self::PROPERTY_TAX_ACCOUNT) {
                $propertyTax += (float)$booking->getAmount();
            }
        }

        return ['houseFee' => $houseFee, 'propertyTax' => $propertyTax];
    }

    private function buildReportMarkdown(string $partnerName, ?string $street, ?string $zip, ?string $city, ?string $country, int $year, array $entry): string {
        $lines = [
            sprintf('# %s %d', $this->l10n->t('Nebenkostenabrechnung'), $year),
            '',
            sprintf('## %s', $partnerName),
        ];

        $addressParts = array_filter([$street, trim(($zip ? $zip . ' ' : '') . ($city ?? '')), $country]);
        if (!empty($addressParts)) {
            $lines[] = implode("\n", $addressParts);
        }

        $lines[] = '';
        $lines[] = '| ' . $this->l10n->t('Position') . ' | ' . $this->l10n->t('Amount') . ' |';
        $lines[] = '| --- | ---: |';
        $lines[] = sprintf('| %s (1001) | %.2f € |', $this->l10n->t('Nebenkosten'), $entry['serviceCharge']);
        $lines[] = sprintf('| %s (2000) | %.2f € |', $this->l10n->t('Hausgeld'), $entry['houseFee']);
        $lines[] = sprintf('| %s (2005) | %.2f € |', $this->l10n->t('Grundsteuer'), $entry['propertyTax']);
        $lines[] = sprintf('| %s | %.2f € |', $this->l10n->t('Saldo'), $entry['saldo']);

        return implode("\n", $lines) . "\n";
    }

}

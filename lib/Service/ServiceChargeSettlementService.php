<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCA\Domus\Accounting\Accounts;
use OCA\Domus\Accounting\TenancyPeriod;
use OCA\Domus\Exception\ResourceNotFoundException;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\PartnerMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\IL10N;

class ServiceChargeSettlementService {
    public function __construct(
        private TenancyService $tenancyService,
        private BookingMapper $bookingMapper,
        private PartnerMapper $partnerMapper,
        private UnitMapper $unitMapper,
        private DocumentService $documentService,
        private AccountService $accountService,
        private IL10N $l10n,
    ) {
    }

    public function listForUnit(string $userId, int $unitId, int $year): array {
        $tenancies = $this->tenancyService->listTenancies($userId, $unitId);
        $entries = [];
        $unitCharges = $this->sumBookingsForUnit($userId, $unitId, $year);

        foreach ($tenancies as $tenancy) {
            $months = TenancyPeriod::monthsWithinYear($tenancy->getStartDate(), $tenancy->getEndDate(), $year);
            if ($months <= 0) {
                continue;
            }

            $chargeShare = $months / 12;
            $monthsWithinYear = min($months, 12);

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
                    'periods' => [],
                    'months' => 0,
                    'serviceCharge' => 0.0,
                    'houseFee' => 0.0,
                    'houseFeeItems' => array_map(static fn(array $item) => array_replace($item, ['amount' => 0.0]), $unitCharges['houseFeeItems']),
                    'propertyTax' => 0.0,
                    'saldo' => 0.0,
                ];
            }

            $serviceCharge = $months * (float)($tenancy->getServiceCharge() ?? 0.0);
            $entries[$key]['tenancyIds'][] = $tenancy->getId();
            $entries[$key]['periods'][] = [
                'startDate' => $tenancy->getStartDate(),
                'endDate' => $tenancy->getEndDate(),
            ];
            $entries[$key]['months'] = min(12, $entries[$key]['months'] + $monthsWithinYear);
            $entries[$key]['serviceCharge'] += $serviceCharge;
            $entries[$key]['houseFee'] += $unitCharges['houseFee'] * $chargeShare;
            foreach ($unitCharges['houseFeeItems'] as $index => $item) {
                $entries[$key]['houseFeeItems'][$index]['amount'] += $item['amount'] * $chargeShare;
            }
            $entries[$key]['propertyTax'] += $unitCharges['propertyTax'] * $chargeShare;
            $entries[$key]['saldo'] = $entries[$key]['serviceCharge'] - $entries[$key]['houseFee'] - $entries[$key]['propertyTax'];
        }

        return array_values($entries);
    }

    public function createReport(string $userId, int $unitId, int $year, int $partnerId): array {
        $unit = $this->unitMapper->findForUser($unitId, $userId);
        if (!$unit) {
            throw new ResourceNotFoundException($this->l10n->t('Unit not found.'));
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
            throw new ResourceNotFoundException($this->l10n->t('Partner not found.'));
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
            $this->l10n->t('Utility Bill Statement %d', [$year]),
            null,
            $this->l10n->t('Utility Bill Statement')
        );

        $links = $creation['links'];
        $reportPath = $this->toViewerPath($userId, (string)($creation['filePath'] ?? ''));

        return [
            'entry' => $entry,
            'documents' => $links,
            'reportPath' => $reportPath,
        ];
    }

    private function sumBookingsForUnit(string $userId, int $unitId, int $year): array {
        $bookings = $this->bookingMapper->findByUser($userId, ['unitId' => $unitId, 'year' => $year]);
        $houseFee = 0.0;
        $houseFeeItems = [];
        $accountLabels = $this->accountService->listAccounts($this->l10n);
        $propertyTax = 0.0;
        $topAccountMap = $this->accountService->getTopAccountNumberMap();
        $houseFeeAccount = $this->accountService->resolveTopAccountNumber(Accounts::ALLOCABLE_MAINTENANCE, $topAccountMap);
        $propertyTaxAccount = $this->accountService->resolveTopAccountNumber(Accounts::PROPERTY_TAX, $topAccountMap);

        foreach ($bookings as $booking) {
            $bookingAccount = (string)$booking->getAccount();
            $account = $this->accountService->resolveTopAccountNumber($bookingAccount, $topAccountMap);
            if ($account === $houseFeeAccount) {
                $houseFee += (float)$booking->getAmount();
                if (!isset($houseFeeItems[$bookingAccount])) {
                    $houseFeeItems[$bookingAccount] = [
                        'account' => $bookingAccount,
                        'label' => $bookingAccount === Accounts::ALLOCABLE_MAINTENANCE
                            ? $this->l10n->t('Maintenance fee')
                            : ($accountLabels[$bookingAccount]['label'] ?? $bookingAccount),
                        'amount' => 0.0,
                    ];
                }
                $houseFeeItems[$bookingAccount]['amount'] += (float)$booking->getAmount();
            }
            if ($account === $propertyTaxAccount) {
                $propertyTax += (float)$booking->getAmount();
            }
        }

        ksort($houseFeeItems, SORT_NATURAL);
        return ['houseFee' => $houseFee, 'houseFeeItems' => array_values($houseFeeItems), 'propertyTax' => $propertyTax];
    }

    private function buildReportMarkdown(string $partnerName, ?string $street, ?string $zip, ?string $city, ?string $country, int $year, array $entry): string {

		$saldo = $entry['saldo'];

		$title = $saldo >= 0
			? $this->l10n->t('Credit')
			: $this->l10n->t('Pay back');

        $lines = [
            sprintf('# %s %d', $this->l10n->t('Utility Bill Statement'), $year),
            '',
            sprintf('## %s', $partnerName),
        ];

        $addressParts = array_filter([$street, trim(($zip ? $zip . ' ' : '') . ($city ?? '')), $country]);
        if (!empty($addressParts)) {
            $lines[] = implode("\n", $addressParts);
        }

        $lines[] = '';
        $lines[] = $this->l10n->t('Period: %s months', [number_format((float)($entry['months'] ?? 0), 2, '.', '')]);
        $lines[] = '';
        $lines[] = '| ' . $this->l10n->t('Position') . ' | ' . $this->l10n->t('Amount') . ' |';
        $lines[] = '| --- | ---: |';
        $lines[] = sprintf('| %s | %.2f € |', $this->l10n->t('Prepayment'), $entry['serviceCharge']);

        $houseFeeItems = $entry['houseFeeItems'] ?: [[
            'label' => $this->l10n->t('Maintenance fee'), 'amount' => $entry['houseFee'],
        ]];
        $propertyTaxLabel = $this->l10n->t('Property tax');

        if (($entry['months'] ?? 0) < 12) {
            $anteilig = $this->l10n->t('proportional');
            $propertyTaxLabel .= ' (' . $anteilig . ')';
        }

        foreach ($houseFeeItems as $item) {
            $label = str_replace(["\r", "\n", '|'], [' ', ' ', '\|'], $item['label']);
            if (($entry['months'] ?? 0) < 12) {
                $label .= ' (' . $anteilig . ')';
            }
            $lines[] = sprintf('| - %s | %.2f € |', $label, $item['amount']);
        }
        $lines[] = sprintf('| - %s | %.2f € |', $propertyTaxLabel, $entry['propertyTax']);
		$lines[] = sprintf('| **%s** | **%.2f €** |', $title, abs($saldo));

        return implode("\n", $lines) . "\n";
    }

    private function toViewerPath(string $userId, string $filePath): string {
        if ($filePath === '') {
            return '';
        }
        $userPrefix = '/' . trim($userId, '/') . '/files';
        if (str_starts_with($filePath, $userPrefix)) {
            $relative = substr($filePath, strlen($userPrefix));
            return $relative !== '' ? $relative : '/';
        }
        return $filePath;
    }

}

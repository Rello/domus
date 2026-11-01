<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\UnitMapper;
use OCA\Domus\Exception\ResourceNotFoundException;
use OCP\IL10N;

class RentIncreaseReportService {
    public function __construct(
        private TenancyService $tenancies,
        private UnitMapper $units,
        private DocumentTemplateService $templates,
        private DocumentService $documents,
        private IL10N $l10n,
        private StatisticsService $statistics,
    ) {}

    public function createReport(string $userId, int $id, array $calculation, string $documentDate, string $consentDeadline, string $effectiveDate, int $rentIndexYear): array {
        $tenancy = $this->tenancies->getTenancyForUser($id, $userId);
        $unit = $this->units->findForUser($tenancy->getUnitId(), $userId);
        if (!$unit) throw new ResourceNotFoundException($this->l10n->t('Unit not found.'));
        $invalid = $this->l10n->t('Invalid rent increase calculation.');
        if ($tenancy->getStatus() !== 'active') throw new \InvalidArgumentException($invalid);
        foreach ([$documentDate, $consentDeadline, $effectiveDate] as $date) InputValidation::assertDate($date, $this->l10n->t('Enter valid document, consent and effective dates.'));
        if ($consentDeadline < $documentDate || $effectiveDate <= $documentDate || $rentIndexYear < 1 || $rentIndexYear > 9999) {
            throw new \InvalidArgumentException($this->l10n->t('The consent deadline must not precede the document date, and the effective date must follow the document date.'));
        }
        $values = [];
        foreach (['index', 'adjustment', 'spread', 'limit', 'price', 'serviceCharge', 'currentBaseRent', 'livingArea'] as $key) {
            $value = $calculation[$key] ?? null;
            if ((!is_string($value) && !is_int($value) && !is_float($value)) || !is_numeric($value) || !is_finite((float)$value)) throw new \InvalidArgumentException($invalid);
            $values[$key] = (float)$value;
        }
        InputValidation::assertMoney($calculation['price'], $invalid);
        InputValidation::assertMoney($calculation['serviceCharge'], $invalid);
        $oldRent = (float)$tenancy->getBaseRent();
        $area = (float)$unit->getLivingArea();
        if ($oldRent <= 0 || $area <= 0 || abs($oldRent - $values['currentBaseRent']) > 0.000001 || abs($area - $values['livingArea']) > 0.000001) {
            throw new \InvalidArgumentException($this->l10n->t('The tenancy or living area changed. Reopen the calculator.'));
        }
        if ($values['index'] <= 0 || $values['adjustment'] <= -100 || $values['spread'] < 0 || $values['spread'] > 100 || $values['limit'] < 0) throw new \InvalidArgumentException($invalid);
        $mean = $values['index'] * (1 + $values['adjustment'] / 100);
        $lower = $mean * (1 - $values['spread'] / 100);
        $upper = $mean * (1 + $values['spread'] / 100);
        $cap = $oldRent / $area * (1 + $values['limit'] / 100);
        $maximum = floor((min($upper, $cap) + 1e-9) * 100) / 100;
        $minimum = min($maximum, ceil((max($lower, $oldRent / $area) - 1e-9) * 100) / 100);
        if ($minimum === $maximum) $minimum = ceil(($oldRent / $area - 1e-9) * 100) / 100;
        $newRent = round($values['price'] * $area, 2);
        $total = round($newRent + $values['serviceCharge'], 2);
        if (!is_finite($lower) || !is_finite($upper) || !is_finite($cap) || !is_finite($total) || $maximum <= $oldRent / $area || $values['price'] < $minimum || $values['price'] > $maximum) throw new \InvalidArgumentException($invalid);
        $number = static fn(float $value): string => number_format($value, 2, ',', '.');
        $date = static fn(string $value): string => InputValidation::date($value)?->format('d.m.Y') ?? '';
        $partners = $tenancy->getPartners();
        $recipient = $partners[0] ?? null;
        $names = array_filter(array_map(static fn($partner) => $partner->getName(), $partners));
        $actualServiceCharge = '';
        $costYear = (int)date('Y') - 1;
        $statistics = $this->statistics->unitStatsAllYears($tenancy->getUnitId(), $userId);
        foreach ($statistics['cost']['rows'] ?? [] as $row) {
            $annual = $row['allocableCosts'] ?? null;
            if ((int)($row['year'] ?? 0) === $costYear && is_numeric($annual) && is_finite((float)$annual) && (float)$annual >= 0) {
                $actualServiceCharge = $number((float)$annual / 12);
                break;
            }
        }
        $templateValues = [
            'documentDate' => $date($documentDate), 'recipientName' => implode(', ', $names),
            'recipientStreet' => $recipient?->getStreet() ?: $unit->getStreet(),
            'recipientPostalCode' => $recipient?->getZip() ?: $unit->getZip(),
            'recipientCity' => $recipient?->getCity() ?: $unit->getCity(),
            'unitStreet' => $unit->getStreet(), 'unitPostalCode' => $unit->getZip(), 'unitCity' => $unit->getCity(),
            'tenancyStartDate' => $date($tenancy->getStartDate()), 'lastRentAdjustmentDate' => $date($tenancy->getStartDate()),
            'rentIndexYear' => (string)$rentIndexYear, 'rentIndexSpread' => rtrim(rtrim($number($values['spread']), '0'), ','), 'rentIndexLower' => $number($lower), 'rentIndexUpper' => $number($upper),
            'currentBaseRent' => $number($oldRent), 'livingArea' => $number($area), 'currentBaseRentPerSquareMeter' => $number($oldRent / $area),
            'newBaseRent' => $number($newRent), 'newBaseRentPerSquareMeter' => $number($values['price']), 'increasePercent' => $number(($newRent / $oldRent - 1) * 100),
            'currentServiceCharge' => $number((float)$tenancy->getServiceCharge()), 'actualServiceCharge' => $actualServiceCharge,
            'newServiceCharge' => $number($values['serviceCharge']), 'newTotalRent' => $number($total),
            'increaseLimit' => number_format($values['limit'], 2, ',', '.'),
            'consentDeadline' => $date($consentDeadline), 'effectiveDate' => $date($effectiveDate),
        ];
        $content = $this->templates->render($userId, $templateValues, 'rentIncrease');
        $creation = $this->documents->createContentForTargets($userId, [
            ['entityType' => 'unit', 'entityId' => $tenancy->getUnitId()],
            ['entityType' => 'tenancy', 'entityId' => $id],
        ], "Mieterhoehung_{$id}_{$documentDate}.docx", $content, (int)substr($documentDate, 0, 4),
            $this->l10n->t('Rent increase letter'), null, $this->l10n->t('Rent increase letter'));
        return $creation['links'];
    }
}

<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\Report;
use OCA\Domus\Db\ReportMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\Files\IRootFolder;
use OCP\IL10N;

class ReportService {
    public function __construct(
        private ReportMapper $reportMapper,
        private PropertyMapper $propertyMapper,
        private TenancyMapper $tenancyMapper,
        private UnitMapper $unitMapper,
        private BookingMapper $bookingMapper,
        private IRootFolder $rootFolder,
        private IL10N $l10n,
    ) {
    }

    public function listReports(string $userId, ?int $propertyId = null, ?int $year = null, ?int $tenancyId = null): array {
        $reports = $this->reportMapper->findByUser($userId, $propertyId, $year, $tenancyId);
        $propertyCache = [];
        foreach ($reports as $report) {
            $report->setDownloadUrl($this->getDownloadUrl($report, $userId));
            $pid = $report->getPropertyId();
            if ($pid) {
                if (!array_key_exists($pid, $propertyCache)) {
                    $property = $this->propertyMapper->findForUser($pid, $userId);
                    $propertyCache[$pid] = $property ? $property->getName() : null;
                }
                $report->setPropertyName($propertyCache[$pid]);
            }
        }
        return $reports;
    }

    public function getReportForUser(int $id, string $userId): Report {
        $report = $this->reportMapper->findForUser($id, $userId);
        if (!$report) {
            throw new \RuntimeException($this->l10n->t('Report not found.'));
        }
        $report->setDownloadUrl($this->getDownloadUrl($report, $userId));
        return $report;
    }

    public function generatePropertyReport(int $propertyId, int $year, string $userId): Report {
        $property = $this->propertyMapper->findForUser($propertyId, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }
        $bookings = $this->bookingMapper->findByUser($userId, ['propertyId' => $propertyId, 'year' => $year]);
        [$income, $expense] = $this->splitIncomeExpense($bookings);
        $content = $this->buildMarkdown($property->getName(), $year, $income, $expense);
        $filePath = $this->storeReportFile($userId, $property->getName(), $year, $content);

        $report = new Report();
        $report->setUserId($userId);
        $report->setYear($year);
        $report->setPropertyId($propertyId);
        $report->setFilePath($filePath);
        $report->setCreatedAt(time());
        $saved = $this->reportMapper->insert($report);
        $saved->setDownloadUrl($this->getDownloadUrl($saved, $userId));
        return $saved;
    }

    public function generateTenancyReport(int $tenancyId, int $year, string $userId): Report {
        $tenancy = $this->tenancyMapper->findForUser($tenancyId, $userId);
        if (!$tenancy) {
            throw new \RuntimeException($this->l10n->t('Tenancy not found.'));
        }

        $bookings = $this->bookingMapper->findByUser($userId, ['tenancyId' => $tenancyId, 'year' => $year]);
        [$income, $expense] = $this->splitIncomeExpense($bookings);

        $unitLabel = null;
        if ($tenancy->getUnitId()) {
            $unit = $this->unitMapper->findForUser($tenancy->getUnitId(), $userId);
            $unitLabel = $unit?->getLabel();
        }
        $tenancyName = $unitLabel ? $this->l10n->t('Tenancy for %s', [$unitLabel]) : $this->l10n->t('Tenancy #%d', [$tenancyId]);

        $content = $this->buildMarkdown($tenancyName, $year, $income, $expense);
        $filePath = $this->storeReportFile($userId, $tenancyName, $year, $content, 'Tenancies');

        $report = new Report();
        $report->setUserId($userId);
        $report->setYear($year);
        $report->setTenancyId($tenancyId);
        $report->setUnitId($tenancy->getUnitId());
        $report->setFilePath($filePath);
        $report->setCreatedAt(time());
        $saved = $this->reportMapper->insert($report);
        $saved->setDownloadUrl($this->getDownloadUrl($saved, $userId));
        return $saved;
    }

    public function getDownloadUrl(Report $report, string $userId): string {
        return '/apps/files/?dir=' . rawurlencode(dirname($report->getFilePath())) . '&fileid=' . $report->getId();
    }

    private function buildMarkdown(string $entityName, int $year, float $income, float $expense): string {
        $result = $income - $expense;
        return "# Abrechnung {$year} - {$entityName}\n\n" .
            "* Einnahmen: " . number_format($income, 2, '.', '') . "\n" .
            "* Ausgaben: " . number_format($expense, 2, '.', '') . "\n" .
            "* Ergebnis: " . number_format($result, 2, '.', '') . "\n";
    }

    private function storeReportFile(string $userId, string $entityName, int $year, string $content, ?string $folder = null): string {
        $userFolder = $this->rootFolder->getUserFolder($userId);
        $folderPath = 'DomusApp/Abrechnungen/' . $year . '/';
        if ($folder) {
            $folderPath .= $folder . '/';
        }
        $folderPath .= $entityName;
        $folder = $userFolder->newFolder($folderPath, true);
        $fileName = time() . '-Abrechnung.md';
        $file = $folder->newFile($fileName, $content);
        return $file->getPath();
    }

    private function splitIncomeExpense(array $bookings): array {
        $income = 0.0;
        $expense = 0.0;

        foreach ($bookings as $booking) {
            $amount = (float)$booking->getAmount();
            if ($amount >= 0) {
                $income += $amount;
            } else {
                $expense += abs($amount);
            }
        }

        return [$income, $expense];
    }
}

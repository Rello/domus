<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\Report;
use OCA\Domus\Db\ReportMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\Files\IRootFolder;
use OCP\IL10N;

class ReportService {
    public function __construct(
        private ReportMapper $reportMapper,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private BookingMapper $bookingMapper,
        private IRootFolder $rootFolder,
        private IL10N $l10n,
    ) {
    }

    public function listReports(string $userId, ?int $propertyId = null, ?int $year = null): array {
        $reports = $this->reportMapper->findByUser($userId, $propertyId, $year);
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
        $income = 0.0;
        $expense = 0.0;
        foreach ($bookings as $booking) {
            $amount = (float)$booking->getAmount();
            if ($booking->getBookingType() === 'income') {
                $income += $amount;
            } else {
                $expense += $amount;
            }
        }
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

    public function getDownloadUrl(Report $report, string $userId): string {
        return '/apps/files/?dir=' . rawurlencode(dirname($report->getFilePath())) . '&fileid=' . $report->getId();
    }

    private function buildMarkdown(string $propertyName, int $year, float $income, float $expense): string {
        $result = $income - $expense;
        return "# Abrechnung {$year} - {$propertyName}\n\n" .
            "* Einnahmen: " . number_format($income, 2, '.', '') . "\n" .
            "* Ausgaben: " . number_format($expense, 2, '.', '') . "\n" .
            "* Ergebnis: " . number_format($result, 2, '.', '') . "\n";
    }

    private function storeReportFile(string $userId, string $propertyName, int $year, string $content): string {
        $userFolder = $this->rootFolder->getUserFolder($userId);
        $folderPath = 'DomusApp/Abrechnungen/' . $year . '/' . $propertyName;
        $folder = $userFolder->newFolder($folderPath, true);
        $fileName = time() . '-Abrechnung.md';
        $file = $folder->newFile($fileName, $content);
        return $file->getPath();
    }
}

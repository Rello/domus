<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Report;
use OCA\Domus\Db\ReportMapper;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

class ReportService {
    public function __construct(private ReportMapper $reportMapper, private IL10N $l10n, private LoggerInterface $logger) {
    }

    /** @return Report[] */
    public function list(string $userId): array {
        return $this->reportMapper->findAllByUser($userId);
    }

    public function getById(int $id, string $userId): Report {
        $report = $this->reportMapper->findByIdForUser($id, $userId);
        if ($report === null) {
            throw new \RuntimeException($this->l10n->t('Report not found.'));
        }
        return $report;
    }

    /** @return Report[] */
    public function listForPropertyYear(int $propertyId, int $year, string $userId): array {
        return $this->reportMapper->findByPropertyYear($propertyId, $year, $userId);
    }

    public function createForPropertyYear(int $propertyId, int $year, string $userId): Report {
        $report = new Report();
        $report->setUserId($userId);
        $report->setPropertyId($propertyId);
        $report->setYear($year);
        $report->setStatus('created');
        $report->setCreatedAt(time());
        $report->setUpdatedAt(time());
        return $this->reportMapper->insert($report);
    }

    public function delete(int $id, string $userId): void {
        $report = $this->getById($id, $userId);
        $this->reportMapper->delete($report);
    }
}

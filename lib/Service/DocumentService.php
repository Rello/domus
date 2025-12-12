<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\DocumentLink;
use OCA\Domus\Db\DocumentLinkMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IL10N;
use OCP\IURLGenerator;
use Psr\Log\LoggerInterface;

class DocumentService {
    private const ENTITY_TYPES = ['property', 'unit', 'partner', 'tenancy', 'booking', 'report'];

    public function __construct(
        private DocumentLinkMapper $documentLinkMapper,
        private IRootFolder $rootFolder,
        private IL10N $l10n,
        private IURLGenerator $urlGenerator,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private TenancyMapper $tenancyMapper,
        private BookingMapper $bookingMapper,
        private LoggerInterface $logger,
    ) {
    }

    public function listForEntity(string $userId, string $entityType, int $entityId): array {
        $this->assertEntityType($entityType);
        $links = $this->documentLinkMapper->findForEntity($userId, $entityType, $entityId);
        foreach ($links as $link) {
            $this->hydrateLink($link);
        }
        return $links;
    }

    public function linkFile(string $userId, string $entityType, int $entityId, string $filePath, ?int $year = null): DocumentLink {
        $this->assertEntityType($entityType);
        $normalizedPath = $this->normalizePath($filePath);
        $userFolder = $this->rootFolder->getUserFolder($userId);
        if (!$userFolder->nodeExists($normalizedPath)) {
            throw new \RuntimeException($this->l10n->t('File not found.'));
        }

        $node = $userFolder->get($normalizedPath);
        if (!$node instanceof File) {
            throw new \InvalidArgumentException($this->l10n->t('Selected item is not a file.'));
        }

        return $this->persistLink($userId, $entityType, $entityId, $node, null);
    }

    public function uploadAndLink(string $userId, string $entityType, int $entityId, array $uploadedFile, ?int $year = null, ?string $title = null): DocumentLink {
        $this->assertEntityType($entityType);
        if (!isset($uploadedFile['tmp_name']) || !is_readable($uploadedFile['tmp_name'])) {
            throw new \InvalidArgumentException($this->l10n->t('No file uploaded.'));
        }

        $targetFolder = $this->ensureTargetFolder($userId, $entityType, $entityId, $year);
        $originalName = $uploadedFile['name'] ?? 'document';
        $fileName = $this->buildFinalFileName($originalName);
        $uniqueName = $this->getUniqueFileName($targetFolder, $fileName);
        $stream = fopen($uploadedFile['tmp_name'], 'rb');
        if ($stream === false) {
            throw new \RuntimeException($this->l10n->t('Failed to read uploaded file.'));
        }

        try {
            $file = $targetFolder->newFile($uniqueName, $stream);
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }

        if (!$file instanceof File) {
            throw new \RuntimeException($this->l10n->t('Unable to create file.'));
        }

        return $this->persistLink($userId, $entityType, $entityId, $file, $title);
    }

    /**
     * Attach a single upload or existing file to multiple targets without re-uploading.
     *
     * @param array $targets List of ['entityType' => string, 'entityId' => int]
     * @return DocumentLink[]
     */
    public function attachToTargets(string $userId, array $targets, ?array $uploadedFile, ?string $filePath, ?int $year = null, ?string $title = null): array {
        $normalizedTargets = $this->normalizeTargets($targets);

        if (empty($normalizedTargets)) {
            throw new \InvalidArgumentException($this->l10n->t('At least one valid target is required.'));
        }

        $links = [];

        if ($uploadedFile && isset($uploadedFile['tmp_name'])) {
            $primary = array_shift($normalizedTargets);
            $primaryLink = $this->uploadAndLink($userId, $primary['entityType'], $primary['entityId'], $uploadedFile, $year, $title);
            $links[] = $primaryLink;

            $file = $this->getFileById($primaryLink->getFileId());
            foreach ($normalizedTargets as $target) {
                $links[] = $this->persistLink($userId, $target['entityType'], $target['entityId'], $file, $title);
            }

            return $links;
        }

        if ($filePath) {
            $file = $this->getFileFromPath($userId, $filePath);
            foreach ($normalizedTargets as $target) {
                $links[] = $this->persistLink($userId, $target['entityType'], $target['entityId'], $file, $title);
            }
            return $links;
        }

        throw new \InvalidArgumentException($this->l10n->t('A file upload or existing path is required.'));
    }

    public function unlink(string $userId, int $id): void {
        $link = $this->documentLinkMapper->findForUser($id, $userId);
        if (!$link) {
            throw new \RuntimeException($this->l10n->t('Document link not found.'));
        }
        $this->documentLinkMapper->delete($link);
    }

    private function persistLink(string $userId, string $entityType, int $entityId, File $file, ?string $title = null): DocumentLink {
        $link = new DocumentLink();
        $link->setUserId($userId);
        $link->setEntityType($entityType);
        $link->setEntityId($entityId);
        $link->setFileId($file->getId());
        $link->setFileName($this->buildDisplayTitle($file->getName(), $title));
        $link->setCreatedAt(time());

        $created = $this->documentLinkMapper->insert($link);
        $this->hydrateLink($created);

        return $created;
    }

    private function normalizeTargets(array $targets): array {
        $normalized = [];
        foreach ($targets as $target) {
            $entityType = $target['entityType'] ?? null;
            $entityId = isset($target['entityId']) ? (int)$target['entityId'] : null;
            if (!$entityType || $entityId === null) {
                continue;
            }
            $this->assertEntityType($entityType);
            $key = $entityType . ':' . $entityId;
            if (isset($normalized[$key])) {
                continue;
            }
            $normalized[$key] = ['entityType' => $entityType, 'entityId' => $entityId];
        }

        return array_values($normalized);
    }

    private function getFileById(int $fileId): File {
        $node = $this->rootFolder->getById($fileId)[0] ?? null;
        if (!$node instanceof File) {
            throw new \RuntimeException($this->l10n->t('Unable to locate stored file.'));
        }
        return $node;
    }

    private function getFileFromPath(string $userId, string $filePath): File {
        $normalizedPath = $this->normalizePath($filePath);
        $userFolder = $this->rootFolder->getUserFolder($userId);
        if (!$userFolder->nodeExists($normalizedPath)) {
            throw new \RuntimeException($this->l10n->t('File not found.'));
        }

        $node = $userFolder->get($normalizedPath);
        if (!$node instanceof File) {
            throw new \InvalidArgumentException($this->l10n->t('Selected item is not a file.'));
        }

        return $node;
    }

    private function hydrateLink(DocumentLink $link): void {
        $fileId = $link->getFileId();
        if ($fileId !== null) {
            $link->setFileUrl($this->urlGenerator->getAbsoluteURL('/f/' . $fileId));
            if (!$link->getFileName()) {
                try {
                    $node = $this->rootFolder->getById($fileId)[0] ?? null;
                    if ($node instanceof File) {
                        $link->setFileName($node->getName());
                    }
                } catch (\Throwable $e) {
                    $this->logger->warning('Failed to fetch file name for document link', ['fileId' => $fileId, 'message' => $e->getMessage()]);
                }
            }
        }
    }

    private function ensureTargetFolder(string $userId, string $entityType, int $entityId, ?int $year = null): Folder {
        $context = $this->resolveStorageContext($userId, $entityType, $entityId, $year);
        $userFolder = $this->rootFolder->getUserFolder($userId);

        $propertyFolderName = $this->sanitizeSegment($context['propertyFolder']);
        $unitFolderName = $context['unitFolder'] ? $this->sanitizeSegment($context['unitFolder']) : null;

        $propertyFolder = $this->getOrCreateFolder($userFolder, $propertyFolderName);
        $unitFolder = $unitFolderName ? $this->getOrCreateFolder($propertyFolder, $unitFolderName) : $propertyFolder;
        $yearFolder = $this->getOrCreateFolder($unitFolder, (string)$context['year']);

        return $yearFolder;
    }

    private function resolveStorageContext(string $userId, string $entityType, int $entityId, ?int $year): array {
        $targetYear = $year ?? (int)date('Y');
        try {
            switch ($entityType) {
                case 'property':
                    $property = $this->propertyMapper->findForUser($entityId, $userId);
                    if (!$property) {
                        throw new \RuntimeException($this->l10n->t('Property not found.'));
                    }
                    return [
                        'propertyFolder' => $this->buildFolderName('Property', $property->getName(), $property->getId()),
                        'unitFolder' => 'Property',
                        'year' => $targetYear,
                    ];
                case 'unit':
                    $unit = $this->unitMapper->findForUser($entityId, $userId);
                    if (!$unit) {
                        throw new \RuntimeException($this->l10n->t('Unit not found.'));
                    }
                    $property = $this->propertyMapper->findForUser($unit->getPropertyId(), $userId);
                    if (!$property) {
                        throw new \RuntimeException($this->l10n->t('Property not found.'));
                    }
                    return [
                        'propertyFolder' => $this->buildFolderName('Property', $property->getName(), $property->getId()),
                        'unitFolder' => $this->buildFolderName('Unit', $unit->getLabel() ?: (string)$unit->getUnitNumber(), $unit->getId()),
                        'year' => $targetYear,
                    ];
                case 'tenancy':
                    $tenancy = $this->tenancyMapper->findForUser($entityId, $userId);
                    if (!$tenancy) {
                        throw new \RuntimeException($this->l10n->t('Tenancy not found.'));
                    }
                    $unit = $this->unitMapper->findForUser($tenancy->getUnitId(), $userId);
                    if (!$unit) {
                        throw new \RuntimeException($this->l10n->t('Unit not found.'));
                    }
                    $property = $this->propertyMapper->findForUser($unit->getPropertyId(), $userId);
                    if (!$property) {
                        throw new \RuntimeException($this->l10n->t('Property not found.'));
                    }
                    $tenancyYear = $targetYear;
                    if ($year === null && $tenancy->getStartDate()) {
                        $tenancyYear = (int)date('Y', strtotime((string)$tenancy->getStartDate()));
                    }
                    return [
                        'propertyFolder' => $this->buildFolderName('Property', $property->getName(), $property->getId()),
                        'unitFolder' => $this->buildFolderName('Unit', $unit->getLabel() ?: (string)$unit->getUnitNumber(), $unit->getId()),
                        'year' => $tenancyYear,
                    ];
                case 'booking':
                    $booking = $this->bookingMapper->findForUser($entityId, $userId);
                    if (!$booking) {
                        throw new \RuntimeException($this->l10n->t('Booking not found.'));
                    }
                    $property = $booking->getPropertyId() ? $this->propertyMapper->findForUser($booking->getPropertyId(), $userId) : null;
                    $unitFolder = null;
                    $propertyFolder = $this->l10n->t('General');
                    if ($property) {
                        $propertyFolder = $this->buildFolderName('Property', $property->getName(), $property->getId());
                    }
                    if ($booking->getUnitId()) {
                        $unit = $this->unitMapper->findForUser($booking->getUnitId(), $userId);
                        if ($unit) {
                            $unitFolder = $this->buildFolderName('Unit', $unit->getLabel() ?: (string)$unit->getUnitNumber(), $unit->getId());
                        }
                    }
                    return [
                        'propertyFolder' => $propertyFolder,
                        'unitFolder' => $unitFolder,
                        'year' => $booking->getYear() ?: $targetYear,
                    ];
                default:
                    return [
                        'propertyFolder' => $this->l10n->t('General'),
                        'unitFolder' => ucfirst($entityType),
                        'year' => $targetYear,
                    ];
            }
        } catch (\Throwable $e) {
            throw $e;
        }
    }

    private function buildFolderName(string $prefix, ?string $name, int $id): string {
        $safeName = $this->sanitizeSegment($name ?: strtolower($prefix));
        return sprintf('%s_%d_%s', $prefix, $id, $safeName);
    }

    private function getOrCreateFolder(Folder $baseFolder, string $name): Folder {
        if ($baseFolder->nodeExists($name)) {
            $node = $baseFolder->get($name);
            if ($node instanceof Folder) {
                return $node;
            }
            throw new \RuntimeException($this->l10n->t('A file with the required folder name already exists.'));
        }

        try {
            return $baseFolder->newFolder($name);
        } catch (NotFoundException $e) {
            throw new \RuntimeException($this->l10n->t('Unable to create folder structure.'));
        }
    }

    private function getUniqueFileName(Folder $folder, string $fileName): string {
        if (!$folder->nodeExists($fileName)) {
            return $fileName;
        }

        $pathInfo = pathinfo($fileName);
        $base = $pathInfo['filename'];
        $ext = isset($pathInfo['extension']) ? '.' . $pathInfo['extension'] : '';
        $counter = 1;
        do {
            $candidate = sprintf('%s (%d)%s', $base, $counter, $ext);
            $counter++;
        } while ($folder->nodeExists($candidate));

        return $candidate;
    }

    private function sanitizeSegment(string $segment): string {
        $clean = str_replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], '-', $segment);
        $clean = trim((string)$clean, " \t\n\r\0\x0B-");
        return $clean === '' ? 'document' : $clean;
    }

    private function sanitizeFileName(string $fileName): string {
        return $this->sanitizeSegment($fileName);
    }

    private function buildFinalFileName(string $originalName): string {
        return $this->sanitizeFileName($originalName);
    }

    private function buildDisplayTitle(string $fileName, ?string $title = null): string {
        $cleanTitle = $title !== null ? trim($title) : '';
        if ($cleanTitle === '') {
            $pathInfo = pathinfo($fileName);
            $base = $pathInfo['filename'] ?? $fileName;
            return $base !== '' ? $base : $fileName;
        }

        return $cleanTitle;
    }

    private function normalizePath(string $path): string {
        $trimmed = ltrim($path, '/');
        if (str_contains($trimmed, '../')) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid file path.'));
        }
        return $trimmed;
    }

    private function assertEntityType(string $entityType): void {
        if (!in_array($entityType, self::ENTITY_TYPES, true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid entity type.'));
        }
    }
}

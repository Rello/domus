<?php

namespace OCA\Domus\Service;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Db\DocumentLink;
use OCA\Domus\Db\DocumentLinkMapper;
use OCA\Domus\Db\PartnerMapper;
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
        private PartnerMapper $partnerMapper,
        private AccountService $accountService,
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

    public function getDocumentDetails(string $userId, int $id): array {
        $link = $this->documentLinkMapper->findForUser($id, $userId);
        if (!$link) {
            throw new \RuntimeException($this->l10n->t('Document link not found.'));
        }

        $this->hydrateLink($link);
        $fileId = $link->getFileId();
        $linkedEntities = [];

        if ($fileId !== null) {
            $allLinks = $this->documentLinkMapper->findByFileId($userId, $fileId);
            foreach ($allLinks as $item) {
                $this->hydrateLink($item);
                $linkedEntities[] = $this->mapLinkedEntity($userId, $item);
            }
        }

        return [
            'document' => $link,
            'linkedEntities' => $linkedEntities,
        ];
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

    public function uploadAndLink(string $userId, string $entityType, int $entityId, array $uploadedFile, ?int $year = null, ?string $title = null, ?string $typeFolder = null): DocumentLink {
        $this->assertEntityType($entityType);
        if (!isset($uploadedFile['tmp_name']) || !is_readable($uploadedFile['tmp_name'])) {
            throw new \InvalidArgumentException($this->l10n->t('No file uploaded.'));
        }

        $targetFolder = $this->ensureTargetFolder($userId, $entityType, $entityId, $year, $typeFolder);
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
    public function attachToTargets(string $userId, array $targets, ?array $uploadedFile, ?string $filePath, ?int $year = null, ?string $title = null, ?string $typeFolder = null): array {
        $normalizedTargets = $this->normalizeTargets($targets);

        if (empty($normalizedTargets)) {
            throw new \InvalidArgumentException($this->l10n->t('At least one valid target is required.'));
        }

        $links = [];

        if ($uploadedFile && isset($uploadedFile['tmp_name'])) {
            $primary = array_shift($normalizedTargets);
            $primaryLink = $this->uploadAndLink($userId, $primary['entityType'], $primary['entityId'], $uploadedFile, $year, $title, $typeFolder);
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

    private function mapLinkedEntity(string $userId, DocumentLink $link): array {
        $data = [
            'id' => $link->getId(),
            'entityType' => $link->getEntityType(),
            'entityId' => $link->getEntityId(),
            'label' => $this->resolveEntityLabel($userId, $link),
        ];

        if ($link->getEntityType() === 'booking') {
            $booking = $this->bookingMapper->findForUser($link->getEntityId(), $userId);
            if ($booking) {
                $data['booking'] = [
                    'date' => $booking->getDate(),
                    'account' => $booking->getAccount(),
                    'accountLabel' => $this->accountService->label((string)$booking->getAccount(), $this->l10n),
                    'amount' => $booking->getAmount(),
                ];
            }
        }

        return $data;
    }

    private function resolveEntityLabel(string $userId, DocumentLink $link): string {
        try {
            return match ($link->getEntityType()) {
                'property' => $this->resolvePropertyLabel($userId, $link->getEntityId()),
                'unit' => $this->resolveUnitLabel($userId, $link->getEntityId()),
                'partner' => $this->resolvePartnerLabel($userId, $link->getEntityId()),
                'tenancy' => $this->resolveTenancyLabel($userId, $link->getEntityId()),
                'booking' => $this->resolveBookingLabel($userId, $link->getEntityId()),
                default => sprintf('%s #%d', ucfirst((string)$link->getEntityType()), $link->getEntityId()),
            };
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to resolve document link label', [
                'entityType' => $link->getEntityType(),
                'entityId' => $link->getEntityId(),
                'message' => $e->getMessage(),
            ]);
            return sprintf('%s #%d', ucfirst((string)$link->getEntityType()), $link->getEntityId());
        }
    }

    private function resolvePropertyLabel(string $userId, int $entityId): string {
        $property = $this->propertyMapper->findForUser($entityId, $userId);
        return $property?->getName() ?: $this->l10n->t('Property #%s', [$entityId]);
    }

    private function resolveUnitLabel(string $userId, int $entityId): string {
        $unit = $this->unitMapper->findForUser($entityId, $userId);
        if (!$unit) {
            return $this->l10n->t('Unit #%s', [$entityId]);
        }

        $unitLabel = $unit->getLabel() ?: (string)$unit->getUnitNumber();
        $propertyName = null;
        if ($unit->getPropertyId()) {
            $property = $this->propertyMapper->findForUser($unit->getPropertyId(), $userId);
            $propertyName = $property?->getName();
        }

        $parts = array_filter([$unitLabel, $propertyName]);
        return $parts ? implode(' — ', $parts) : $this->l10n->t('Unit #%s', [$entityId]);
    }

    private function resolvePartnerLabel(string $userId, int $entityId): string {
        $partner = $this->partnerMapper->findForUser($entityId, $userId);
        return $partner?->getName() ?: $this->l10n->t('Partner #%s', [$entityId]);
    }

    private function resolveTenancyLabel(string $userId, int $entityId): string {
        $tenancy = $this->tenancyMapper->findForUser($entityId, $userId);
        if (!$tenancy) {
            return $this->l10n->t('Tenancy #%s', [$entityId]);
        }

        $partnerNames = array_map(static fn($partner) => $partner['name'] ?? null, $tenancy->getPartners());
        $partnerNames = array_filter($partnerNames);
        $unitLabel = $tenancy->getUnitLabel();
        $parts = array_filter([$unitLabel, implode(', ', $partnerNames)]);

        return $parts ? implode(' — ', $parts) : $this->l10n->t('Tenancy #%s', [$entityId]);
    }

    private function resolveBookingLabel(string $userId, int $entityId): string {
        $booking = $this->bookingMapper->findForUser($entityId, $userId);
        if (!$booking) {
            return $this->l10n->t('Booking #%s', [$entityId]);
        }

        $parts = [];

        $date = $booking->getDate();
        if ($date) {
            try {
                $dateObj = new \DateTimeImmutable($date);
                $parts[] = $dateObj->format('Y-m-d');
            } catch (\Exception $e) {
                $parts[] = $date;
            }
        }

        $account = $booking->getAccount();
        $accountLabel = $this->accountService->label((string)$account, $this->l10n);
        if ($account !== null) {
            $accountPart = (string)$account;
            if ($accountLabel) {
                $accountPart .= ' — ' . $accountLabel;
            }
            $parts[] = $accountPart;
        }

        $amount = $booking->getAmount();
        if ($amount !== null && $amount !== '') {
            $parts[] = '€ ' . number_format((float)$amount, 2, ',', '.');
        }

        if (!$parts) {
            $parts = array_filter([$booking->getDescription(), $booking->getYear()]);
        }

        return $parts ? implode(' — ', $parts) : $this->l10n->t('Booking #%s', [$entityId]);
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

    public function createContentForTargets(string $userId, array $targets, string $fileName, string $content, ?int $year = null, ?string $title = null, ?string $typeFolder = null): array {
        $normalizedTargets = $this->normalizeTargets($targets);

        if (empty($normalizedTargets)) {
            throw new \InvalidArgumentException($this->l10n->t('At least one valid target is required.'));
        }

        $primary = array_shift($normalizedTargets);
        $targetFolder = $this->ensureTargetFolder($userId, $primary['entityType'], $primary['entityId'], $year, $typeFolder);

        $finalName = $this->getUniqueFileName($targetFolder, $this->buildFinalFileName($fileName));
        $file = $targetFolder->newFile($finalName, $content);

        if (!$file instanceof File) {
            throw new \RuntimeException($this->l10n->t('Unable to create file.'));
        }

        $links = [];
        $links[] = $this->persistLink($userId, $primary['entityType'], $primary['entityId'], $file, $title);

        foreach ($normalizedTargets as $target) {
            $links[] = $this->persistLink($userId, $target['entityType'], $target['entityId'], $file, $title);
        }

        return [
            'links' => $links,
            'filePath' => $file->getPath(),
        ];
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

    private function ensureTargetFolder(string $userId, string $entityType, int $entityId, ?int $year = null, ?string $typeFolder = null): Folder {
        $context = $this->resolveStorageContext($userId, $entityType, $entityId, $year);
        $userFolder = $this->rootFolder->getUserFolder($userId);

        $baseFolder = $this->getOrCreateFolder($userFolder, 'DomusApp');
        $propertyFolder = $this->getOrCreateFolder($baseFolder, $this->sanitizeSegment($context['propertyFolder']));
        $unitFolder = $this->getOrCreateFolder($propertyFolder, $this->sanitizeSegment($context['unitFolder']));
        $yearFolder = $this->getOrCreateFolder($unitFolder, (string)$context['year']);
        $typeSegment = $this->resolveTypeFolder($entityType, $typeFolder);

        return $this->getOrCreateFolder($yearFolder, $typeSegment);
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
                        'propertyFolder' => $property->getName() ?: $this->l10n->t('Property'),
                        'unitFolder' => $this->l10n->t('General'),
                        'year' => $targetYear,
                    ];
                case 'unit':
                    $unit = $this->unitMapper->findForUser($entityId, $userId);
                    if (!$unit) {
                        throw new \RuntimeException($this->l10n->t('Unit not found.'));
                    }
                    $property = null;
                    if ($unit->getPropertyId() !== null) {
                        $property = $this->propertyMapper->findForUser($unit->getPropertyId(), $userId);
                        if (!$property) {
                            throw new \RuntimeException($this->l10n->t('Property not found.'));
                        }
                    }
                    return [
                        'propertyFolder' => $property?->getName() ?: $this->l10n->t('General'),
                        'unitFolder' => $unit->getLabel() ?: (string)$unit->getUnitNumber(),
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
                    $property = null;
                    if ($unit->getPropertyId() !== null) {
                        $property = $this->propertyMapper->findForUser($unit->getPropertyId(), $userId);
                        if (!$property) {
                            throw new \RuntimeException($this->l10n->t('Property not found.'));
                        }
                    }
                    $tenancyYear = $targetYear;
                    if ($year === null && $tenancy->getStartDate()) {
                        $tenancyYear = (int)date('Y', strtotime((string)$tenancy->getStartDate()));
                    }
                    return [
                        'propertyFolder' => $property?->getName() ?: $this->l10n->t('General'),
                        'unitFolder' => $unit->getLabel() ?: (string)$unit->getUnitNumber(),
                        'year' => $tenancyYear,
                    ];
                case 'booking':
                    $booking = $this->bookingMapper->findForUser($entityId, $userId);
                    if (!$booking) {
                        throw new \RuntimeException($this->l10n->t('Booking not found.'));
                    }
                    $property = $booking->getPropertyId() ? $this->propertyMapper->findForUser($booking->getPropertyId(), $userId) : null;
                    $propertyFolder = $property?->getName() ?: $this->l10n->t('General');
                    $unitFolder = $this->l10n->t('General');
                    if ($booking->getUnitId()) {
                        $unit = $this->unitMapper->findForUser($booking->getUnitId(), $userId);
                        if ($unit) {
                            $unitFolder = $unit->getLabel() ?: (string)$unit->getUnitNumber();
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

    private function resolveTypeFolder(string $entityType, ?string $typeFolder): string {
        $label = $typeFolder ?: ucfirst($entityType);
        return $this->sanitizeSegment($label);
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

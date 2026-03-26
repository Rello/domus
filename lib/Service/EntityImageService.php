<?php

namespace OCA\Domus\Service;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Db\Property;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\Unit;
use OCA\Domus\Db\UnitMapper;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IL10N;
use OCP\IURLGenerator;
use Psr\Log\LoggerInterface;

class EntityImageService {
    private const MEDIA_FOLDER = 'media';
    private const PROPERTY_FILE_BASENAME = 'property-cover';
    private const UNIT_FILE_BASENAME = 'unit-cover';
    private const ALLOWED_EXTENSIONS = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        'svg' => 'image/svg+xml',
    ];

    public function __construct(
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private IRootFolder $rootFolder,
        private IURLGenerator $urlGenerator,
        private IL10N $l10n,
        private LoggerInterface $logger,
    ) {
    }

    public function enrichProperty(Property $property): void {
        $property->setImageUrl($this->buildStoredImageUrl($property->getImageFileId()));
        $property->setResolvedImageUrl($property->getImageUrl() ?: $this->getDefaultImageUrl('property'));
    }

    public function enrichUnit(Unit $unit, ?Property $property = null, bool $resolvePropertyImage = true): void {
        $unit->setImageUrl($this->buildStoredImageUrl($unit->getImageFileId()));

        $resolved = $unit->getImageUrl();
        if (!$resolved && $resolvePropertyImage && $unit->getPropertyId()) {
            $property = $property ?: $this->loadPropertyForUnit($unit);
            if ($property) {
                $this->enrichProperty($property);
                $resolved = $property->getResolvedImageUrl();
            }
        }

        $unit->setResolvedImageUrl($resolved ?: $this->getDefaultImageUrl('unit'));
    }

    public function uploadPropertyImage(int $id, array $uploadedFile, string $userId): Property {
        $property = $this->propertyMapper->findForUser($id, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }

        $file = $this->storeUploadedImage($userId, $property->getDocumentPath(), self::PROPERTY_FILE_BASENAME, $uploadedFile, $property->getImageFileId());
        $property->setImageFileId($file->getId());
        $property->setImageFileName($file->getName());
        $property->setUpdatedAt(time());
        $property = $this->propertyMapper->update($property);
        $this->enrichProperty($property);

        return $property;
    }

    public function removePropertyImage(int $id, string $userId): Property {
        $property = $this->propertyMapper->findForUser($id, $userId);
        if (!$property) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }

        $this->deleteStoredImage($property->getImageFileId());
        $property->setImageFileId(null);
        $property->setImageFileName(null);
        $property->setUpdatedAt(time());
        $property = $this->propertyMapper->update($property);
        $this->enrichProperty($property);

        return $property;
    }

    public function uploadUnitImage(int $id, array $uploadedFile, string $userId): Unit {
        $unit = $this->unitMapper->findForUser($id, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        $file = $this->storeUploadedImage($userId, $unit->getDocumentPath(), self::UNIT_FILE_BASENAME, $uploadedFile, $unit->getImageFileId());
        $unit->setImageFileId($file->getId());
        $unit->setImageFileName($file->getName());
        $unit->setUpdatedAt(time());
        $unit = $this->unitMapper->update($unit);
        $this->enrichUnit($unit);

        return $unit;
    }

    public function removeUnitImage(int $id, string $userId): Unit {
        $unit = $this->unitMapper->findForUser($id, $userId);
        if (!$unit) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }

        $this->deleteStoredImage($unit->getImageFileId());
        $unit->setImageFileId(null);
        $unit->setImageFileName(null);
        $unit->setUpdatedAt(time());
        $unit = $this->unitMapper->update($unit);
        $this->enrichUnit($unit);

        return $unit;
    }

    public function getDefaultImageUrl(string $entityType): string {
        $fileName = $entityType === 'property' ? 'property-default-cover.svg' : 'unit-default-cover.svg';
        return $this->urlGenerator->getAbsoluteURL($this->urlGenerator->imagePath(Application::APP_ID, $fileName));
    }

    private function loadPropertyForUnit(Unit $unit): ?Property {
        $propertyId = $unit->getPropertyId();
        $userId = $unit->getUserId();
        if (!$propertyId || !$userId) {
            return null;
        }

        $property = $this->propertyMapper->findForUser((int)$propertyId, (string)$userId);
        if ($property) {
            $this->enrichProperty($property);
        }

        return $property;
    }

    private function buildStoredImageUrl(?int $fileId): ?string {
        if (!$fileId) {
            return null;
        }

        return $this->urlGenerator->getAbsoluteURL('/core/preview?fileId=' . $fileId . '&x=1200&y=800&a=1');
    }

    private function storeUploadedImage(string $userId, ?string $basePath, string $baseName, array $uploadedFile, ?int $previousFileId): File {
        if (!isset($uploadedFile['tmp_name']) || !is_readable($uploadedFile['tmp_name'])) {
            throw new \InvalidArgumentException($this->l10n->t('Image file is required.'));
        }

        $extension = $this->detectImageExtension($uploadedFile);
        $targetFolder = $this->ensureMediaFolder($userId, $basePath);
        $targetName = $baseName . '.' . $extension;
        $this->deleteSiblingFiles($targetFolder, $baseName, $targetName);
        $this->deleteStoredImage($previousFileId);

        $stream = fopen($uploadedFile['tmp_name'], 'rb');
        if ($stream === false) {
            throw new \RuntimeException($this->l10n->t('Failed to read uploaded image.'));
        }

        try {
            $file = $targetFolder->newFile($targetName, $stream);
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }

        if (!$file instanceof File) {
            throw new \RuntimeException($this->l10n->t('Unable to create image file.'));
        }

        return $file;
    }

    private function detectImageExtension(array $uploadedFile): string {
        $originalName = strtolower((string)($uploadedFile['name'] ?? ''));
        $extension = pathinfo($originalName, PATHINFO_EXTENSION);
        if ($extension && isset(self::ALLOWED_EXTENSIONS[$extension])) {
            return $extension;
        }

        $mimeType = null;
        if (function_exists('mime_content_type') && isset($uploadedFile['tmp_name'])) {
            $mimeType = @mime_content_type($uploadedFile['tmp_name']) ?: null;
        }
        if (!$mimeType && isset($uploadedFile['type'])) {
            $mimeType = (string)$uploadedFile['type'];
        }

        if ($mimeType) {
            foreach (self::ALLOWED_EXTENSIONS as $candidateExtension => $candidateMimeType) {
                if (strcasecmp($mimeType, $candidateMimeType) === 0) {
                    return $candidateExtension;
                }
            }
        }

        throw new \InvalidArgumentException($this->l10n->t('Only image uploads are allowed.'));
    }

    private function ensureMediaFolder(string $userId, ?string $basePath): Folder {
        $normalizedPath = trim((string)$basePath, '/');
        if ($normalizedPath === '') {
            throw new \RuntimeException($this->l10n->t('Document location is required.'));
        }

        $userFolder = $this->rootFolder->getUserFolder($userId);
        $folder = $this->getOrCreateFolderFromPath($userFolder, $normalizedPath);

        return $this->getOrCreateFolder($folder, self::MEDIA_FOLDER);
    }

    private function getOrCreateFolderFromPath(Folder $userFolder, string $basePath): Folder {
        $segments = array_values(array_filter(explode('/', $basePath), static fn(string $segment) => $segment !== ''));
        $current = $userFolder;
        foreach ($segments as $segment) {
            $current = $this->getOrCreateFolder($current, $segment);
        }

        return $current;
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

    private function deleteSiblingFiles(Folder $folder, string $baseName, string $exceptName): void {
        foreach ($folder->getDirectoryListing() as $node) {
            if (!$node instanceof File) {
                continue;
            }
            $name = $node->getName();
            if ($name === $exceptName) {
                $node->delete();
                continue;
            }
            if (str_starts_with($name, $baseName . '.')) {
                $node->delete();
            }
        }
    }

    private function deleteStoredImage(?int $fileId): void {
        if (!$fileId) {
            return;
        }

        try {
            $node = $this->rootFolder->getById($fileId)[0] ?? null;
            if ($node instanceof File) {
                $node->delete();
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to delete entity image', [
                'fileId' => $fileId,
                'message' => $e->getMessage(),
            ]);
        }
    }
}

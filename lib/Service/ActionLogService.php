<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\ActionLog;
use OCA\Domus\Db\ActionLogMapper;
use OCA\Domus\Db\DocumentLinkMapper;
use OCA\Domus\Db\PartnerMapper;
use OCA\Domus\Db\PropertyMapper;
use OCA\Domus\Db\TenancyMapper;
use OCA\Domus\Db\UnitMapper;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCP\IURLGenerator;
use Psr\Log\LoggerInterface;

class ActionLogService {
    private const OWNER_ENTITY_TYPES = ['property', 'unit'];
    private const LINKED_ENTITY_TYPES = ['property', 'unit', 'partner'];
    private const TYPE_ALIASES = [
        'call',
        'email',
        'note',
        'event',
        'document',
        'yearStatus',
    ];

    public function __construct(
        private ActionLogMapper $actionLogMapper,
        private PropertyMapper $propertyMapper,
        private UnitMapper $unitMapper,
        private PartnerMapper $partnerMapper,
        private TenancyMapper $tenancyMapper,
        private BookingService $bookingService,
        private DocumentLinkMapper $documentLinkMapper,
        private PermissionService $permissionService,
        private IRootFolder $rootFolder,
        private IURLGenerator $urlGenerator,
        private IL10N $l10n,
        private LoggerInterface $logger,
    ) {
    }

    public function createManualEntry(string $userId, string $entityType, int $entityId, array $payload): ActionLog {
        return $this->createEntry($userId, $entityType, $entityId, $payload, 'manual', $userId);
    }

    public function logSystemEntry(string $userId, string $entityType, int $entityId, array $payload, ?string $createdBy = null): ActionLog {
        return $this->createEntry($userId, $entityType, $entityId, $payload, 'system', $createdBy ?: $userId);
    }

    public function listForEntity(string $userId, string $entityType, int $entityId, ?int $limit = null, int $offset = 0): array {
        $this->assertOwnerEntity($userId, $entityType, $entityId);
        $entries = $this->actionLogMapper->findByEntity($userId, $entityType, $entityId, $limit, $offset);

        return array_map(fn(ActionLog $entry) => $this->hydrateEntry($userId, $entry), $entries);
    }

    public function getEntry(string $userId, int $id): ActionLog {
        $entry = $this->actionLogMapper->findForUser($id, $userId);
        if (!$entry) {
            throw new \RuntimeException($this->l10n->t('Action log entry not found.'));
        }

        return $this->hydrateEntry($userId, $entry);
    }

    public function updateEntry(string $userId, int $id, array $payload): ActionLog {
        $entry = $this->actionLogMapper->findForUser($id, $userId);
        if (!$entry) {
            throw new \RuntimeException($this->l10n->t('Action log entry not found.'));
        }

        if ($entry->getSource() !== 'manual') {
            throw new \RuntimeException($this->l10n->t('Only manual action log entries can be edited.'));
        }

        $entityType = (string)$entry->getEntityType();
        $entityId = (int)$entry->getEntityId();
        $this->assertOwnerEntity($userId, $entityType, $entityId);

        $type = trim((string)($payload['type'] ?? ''));
        $title = trim((string)($payload['title'] ?? ''));
        $data = trim((string)($payload['data'] ?? ''));
        $linkedEntityType = $payload['linkedEntityType'] ?? null;
        $linkedEntityId = $payload['linkedEntityId'] ?? null;
        $linkedLabel = isset($payload['linkedLabel']) ? trim((string)$payload['linkedLabel']) : null;

        if ($type === '') {
            throw new \InvalidArgumentException($this->l10n->t('Type is required.'));
        }
        if ($title === '') {
            throw new \InvalidArgumentException($this->l10n->t('Title is required.'));
        }

        $linkedMeta = $this->normalizeLinkedEntity($userId, $linkedEntityType, $linkedEntityId, $linkedLabel);

        $entry->setType($this->normalizeType($type));
        $entry->setTitle($title);
        $entry->setData($data !== '' ? $data : null);
        $entry->setLinkedEntityType($linkedMeta['type']);
        $entry->setLinkedEntityId($linkedMeta['id']);
        $entry->setLinkedLabel($linkedMeta['label']);
        $entry->setUpdatedAt(time());

        return $this->hydrateEntry($userId, $this->actionLogMapper->update($entry));
    }

    public function deleteEntry(string $userId, int $id): void {
        $entry = $this->actionLogMapper->findForUser($id, $userId);
        if (!$entry) {
            throw new \RuntimeException($this->l10n->t('Action log entry not found.'));
        }

        if ($entry->getSource() !== 'manual') {
            throw new \RuntimeException($this->l10n->t('Only manual action log entries can be deleted.'));
        }

        $entityType = (string)$entry->getEntityType();
        $entityId = (int)$entry->getEntityId();
        $this->assertOwnerEntity($userId, $entityType, $entityId);

        $this->actionLogMapper->delete($entry);
    }

    private function createEntry(string $userId, string $entityType, int $entityId, array $payload, string $source, string $createdBy): ActionLog {
        $this->assertOwnerEntity($userId, $entityType, $entityId);

        $type = trim((string)($payload['type'] ?? ''));
        $title = trim((string)($payload['title'] ?? ''));
        $data = trim((string)($payload['data'] ?? ''));
        $linkedEntityType = $payload['linkedEntityType'] ?? null;
        $linkedEntityId = $payload['linkedEntityId'] ?? null;
        $linkedLabel = isset($payload['linkedLabel']) ? trim((string)$payload['linkedLabel']) : null;

        if ($type === '') {
            throw new \InvalidArgumentException($this->l10n->t('Type is required.'));
        }
        if ($title === '') {
            throw new \InvalidArgumentException($this->l10n->t('Title is required.'));
        }

        $normalizedType = $this->normalizeType($type);
        $linkedMeta = $this->normalizeLinkedEntity($userId, $linkedEntityType, $linkedEntityId, $linkedLabel);
        $now = time();

        $entry = new ActionLog();
        $entry->setUserId($userId);
        $entry->setEntityType($entityType);
        $entry->setEntityId($entityId);
        $entry->setType($normalizedType);
        $entry->setTitle($title);
        $entry->setData($data !== '' ? $data : null);
        $entry->setSource($source);
        $entry->setLinkedEntityType($linkedMeta['type']);
        $entry->setLinkedEntityId($linkedMeta['id']);
        $entry->setLinkedLabel($linkedMeta['label']);
        $entry->setCreatedBy($createdBy);
        $entry->setCreatedAt($now);
        $entry->setUpdatedAt($now);

        return $this->hydrateEntry($userId, $this->actionLogMapper->insert($entry));
    }

    private function normalizeType(string $type): string {
        $trimmedType = trim($type);
        if ($trimmedType === '') {
            return '';
        }

        foreach (self::TYPE_ALIASES as $alias) {
            if (strcasecmp($trimmedType, $alias) === 0) {
                return $alias;
            }
        }

        return $trimmedType;
    }

    private function normalizeLinkedEntity(string $userId, mixed $linkedEntityType, mixed $linkedEntityId, ?string $linkedLabel): array {
        $type = $linkedEntityType !== null ? trim((string)$linkedEntityType) : null;
        $id = $linkedEntityId !== null && $linkedEntityId !== '' ? (int)$linkedEntityId : null;
        $label = $linkedLabel !== null && $linkedLabel !== '' ? $linkedLabel : null;

        if ($type === null && $id === null && $label === null) {
            return ['type' => null, 'id' => null, 'label' => null];
        }

        if ($type === null || $type === '' || $id === null || $id <= 0) {
            throw new \InvalidArgumentException($this->l10n->t('Linked object type and ID are required.'));
        }

        if (!in_array($type, self::LINKED_ENTITY_TYPES, true)) {
            throw new \InvalidArgumentException($this->l10n->t('Unsupported linked object type.'));
        }

        $resolved = $this->resolveLinkedEntity($userId, $type, $id, false);
        if ($resolved === null && $label === null) {
            throw new \InvalidArgumentException($this->l10n->t('Linked object not found.'));
        }

        return [
            'type' => $type,
            'id' => $id,
            'label' => $label ?: ($resolved['label'] ?? null),
        ];
    }

    private function assertOwnerEntity(string $userId, string $entityType, int $entityId): void {
        if ($entityId <= 0 || !in_array($entityType, self::OWNER_ENTITY_TYPES, true)) {
            throw new \RuntimeException($this->l10n->t('Unsupported action log owner.'));
        }

        if ($entityType === 'property' && !$this->propertyMapper->findForUser($entityId, $userId)) {
            throw new \RuntimeException($this->l10n->t('Property not found.'));
        }

        if ($entityType === 'unit' && !$this->unitMapper->findForUser($entityId, $userId)) {
            throw new \RuntimeException($this->l10n->t('Unit not found.'));
        }
    }

    private function hydrateEntry(string $userId, ActionLog $entry): ActionLog {
        $entityLabel = $this->resolveOwnerLabel($userId, (string)$entry->getEntityType(), (int)$entry->getEntityId());
        $entry->setEntityLabel($entityLabel);
        $entry->setEntityRoute((string)$entry->getEntityType());
        $entry->setLinkedEntity($this->resolveLinkedEntity(
            $userId,
            $entry->getLinkedEntityType(),
            $entry->getLinkedEntityId(),
            true,
            $entry->getLinkedLabel()
        ));

        return $entry;
    }

    private function resolveOwnerLabel(string $userId, string $entityType, int $entityId): string {
        if ($entityType === 'property') {
            $property = $this->propertyMapper->findForUser($entityId, $userId);
            return $property?->getName() ?: $this->l10n->t('Property #%s', [$entityId]);
        }

        if ($entityType === 'unit') {
            $unit = $this->unitMapper->findForUser($entityId, $userId);
            return $unit?->getLabel() ?: $this->l10n->t('Unit #%s', [$entityId]);
        }

        return sprintf('%s #%d', ucfirst($entityType), $entityId);
    }

    private function resolveLinkedEntity(string $userId, ?string $type, ?int $id, bool $allowFallbackLabel = true, ?string $fallbackLabel = null): ?array {
        if ($type === null || $type === '' || $id === null || $id <= 0) {
            return null;
        }

        try {
            return match ($type) {
                'document' => $this->resolveDocumentLink($userId, $id, $fallbackLabel),
                'property' => $this->resolvePropertyLink($userId, $id, $fallbackLabel),
                'unit' => $this->resolveUnitLink($userId, $id, $fallbackLabel),
                'partner' => $this->resolvePartnerLink($userId, $id, $fallbackLabel),
                'tenancy' => $this->resolveTenancyLink($userId, $id, $fallbackLabel),
                'booking' => $this->resolveBookingLink($userId, $id, $fallbackLabel),
                default => null,
            };
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to resolve linked action log object', [
                'type' => $type,
                'id' => $id,
                'message' => $e->getMessage(),
            ]);
        }

        if (!$allowFallbackLabel && $fallbackLabel === null) {
            return null;
        }

        return [
            'type' => $type,
            'id' => $id,
            'label' => $fallbackLabel ?: sprintf('%s #%d', ucfirst($type), $id),
            'navigate' => null,
            'href' => null,
        ];
    }

    private function resolveDocumentLink(string $userId, int $id, ?string $fallbackLabel): ?array {
        $document = $this->documentLinkMapper->findForUser($id, $userId);
        if (!$document) {
            if ($fallbackLabel === null) {
                return null;
            }

            return [
                'type' => 'document',
                'id' => $id,
                'label' => $fallbackLabel,
                'navigate' => null,
                'href' => null,
            ];
        }

        $fileId = $document->getFileId();
        $href = $fileId !== null ? $this->urlGenerator->getAbsoluteURL('/f/' . $fileId) : null;
        $label = $document->getFileName() ?: ($fallbackLabel ?: $this->l10n->t('Document #%s', [$id]));

        if (!$document->getFileName() && $fileId !== null) {
            try {
                $node = $this->rootFolder->getById($fileId)[0] ?? null;
                if ($node instanceof File) {
                    $label = $node->getName();
                }
            } catch (\Throwable $e) {
                $this->logger->warning('Failed to resolve action log document file name', [
                    'documentId' => $id,
                    'fileId' => $fileId,
                    'message' => $e->getMessage(),
                ]);
            }
        }

        return [
            'type' => 'document',
            'id' => $id,
            'label' => $label,
            'navigate' => null,
            'href' => $href,
        ];
    }

    private function resolvePropertyLink(string $userId, int $id, ?string $fallbackLabel): ?array {
        $property = $this->propertyMapper->findForUser($id, $userId);
        if (!$property) {
            return $fallbackLabel === null ? null : [
                'type' => 'property',
                'id' => $id,
                'label' => $fallbackLabel,
                'navigate' => null,
                'href' => null,
            ];
        }

        return [
            'type' => 'property',
            'id' => $id,
            'label' => $property->getName() ?: ($fallbackLabel ?: $this->l10n->t('Property #%s', [$id])),
            'navigate' => 'propertyDetail',
            'href' => null,
        ];
    }

    private function resolveUnitLink(string $userId, int $id, ?string $fallbackLabel): ?array {
        $unit = $this->unitMapper->findForUser($id, $userId);
        if (!$unit) {
            return $fallbackLabel === null ? null : [
                'type' => 'unit',
                'id' => $id,
                'label' => $fallbackLabel,
                'navigate' => null,
                'href' => null,
            ];
        }

        return [
            'type' => 'unit',
            'id' => $id,
            'label' => $unit->getLabel() ?: ($fallbackLabel ?: $this->l10n->t('Unit #%s', [$id])),
            'navigate' => 'unitDetail',
            'href' => null,
        ];
    }

    private function resolvePartnerLink(string $userId, int $id, ?string $fallbackLabel): ?array {
        $partner = $this->partnerMapper->findForUser($id, $userId);
        if (!$partner) {
            return $fallbackLabel === null ? null : [
                'type' => 'partner',
                'id' => $id,
                'label' => $fallbackLabel,
                'navigate' => null,
                'href' => null,
            ];
        }

        return [
            'type' => 'partner',
            'id' => $id,
            'label' => $partner->getName() ?: ($fallbackLabel ?: $this->l10n->t('Partner #%s', [$id])),
            'navigate' => null,
            'href' => null,
        ];
    }

    private function resolveTenancyLink(string $userId, int $id, ?string $fallbackLabel): ?array {
        $tenancy = $this->tenancyMapper->findForUser($id, $userId);
        if (!$tenancy) {
            return $fallbackLabel === null ? null : [
                'type' => 'tenancy',
                'id' => $id,
                'label' => $fallbackLabel,
                'navigate' => null,
                'href' => null,
            ];
        }

        $partners = array_map(static fn($partner) => method_exists($partner, 'getName') ? $partner->getName() : null, $tenancy->getPartners());
        $partners = array_filter($partners);
        $parts = array_filter([$tenancy->getUnitLabel(), implode(', ', $partners)]);

        return [
            'type' => 'tenancy',
            'id' => $id,
            'label' => $parts ? implode(' — ', $parts) : ($fallbackLabel ?: $this->l10n->t('Tenancy #%s', [$id])),
            'navigate' => null,
            'href' => null,
        ];
    }

    private function resolveBookingLink(string $userId, int $id, ?string $fallbackLabel): ?array {
        try {
            $booking = $this->bookingService->getBookingForUser($id, $userId);
        } catch (\Throwable $e) {
            $booking = null;
        }

        if (!$booking) {
            return $fallbackLabel === null ? null : [
                'type' => 'booking',
                'id' => $id,
                'label' => $fallbackLabel,
                'navigate' => null,
                'href' => null,
            ];
        }

        $parts = [];
        if ($booking->getDate()) {
            $parts[] = $booking->getDate();
        }
        if ($booking->getDescription()) {
            $parts[] = $booking->getDescription();
        }

        return [
            'type' => 'booking',
            'id' => $id,
            'label' => $parts ? implode(' — ', $parts) : ($fallbackLabel ?: $this->l10n->t('Booking #%s', [$id])),
            'navigate' => null,
            'href' => null,
        ];
    }
}

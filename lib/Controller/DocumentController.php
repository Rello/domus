<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\DocumentService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class DocumentController extends BaseController {
    public function __construct(
        IRequest $request,
        IL10N $l10n,
        IUserSession $userSession,
        private DocumentService $documentService
    ) {
        parent::__construct($request, $l10n, $userSession);
    }

    #[NoAdminRequired]
    public function index(string $entityType, int $entityId): DataResponse {
        return new DataResponse($this->documentService->list($entityType, $entityId, $this->getCurrentUserId()));
    }

    #[NoAdminRequired]
    public function create(string $entityType, int $entityId, string $filePath, ?string $content = null): DataResponse {
        try {
            $document = $this->documentService->create($entityType, $entityId, $filePath, $this->getCurrentUserId(), $content);
            return new DataResponse($document, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->documentService->delete($id, $this->getCurrentUserId());
            return new DataResponse(['status' => 'success']);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }
}

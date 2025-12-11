<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\DocumentService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class DocumentController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private DocumentService $documentService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(string $entityType, int $entityId): DataResponse {
        try {
            return new DataResponse($this->documentService->listForEntity($this->getUserId(), $entityType, $entityId));
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function link(string $entityType, int $entityId, string $filePath, ?int $year = null): DataResponse {
        try {
            $link = $this->documentService->linkFile($this->getUserId(), $entityType, $entityId, $filePath, $year);
            return new DataResponse($link, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function upload(string $entityType, int $entityId): DataResponse {
        try {
            $file = $this->request->getUploadedFile('file');
            if (!$file) {
                return $this->validationError($this->l10n->t('File is required.'));
            }
            $yearParam = $this->request->getParam('year');
            $year = $yearParam !== null ? (int)$yearParam : null;
            $link = $this->documentService->uploadAndLink($this->getUserId(), $entityType, $entityId, $file, $year);
            return new DataResponse($link, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->documentService->unlink($this->getUserId(), $id);
            return new DataResponse([], Http::STATUS_NO_CONTENT);
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    private function getUserId(): string {
        return $this->userSession->getUser()?->getUID() ?? '';
    }

    private function notFound(): DataResponse {
        return new DataResponse([
            'status' => 'error',
            'message' => $this->l10n->t('Resource not found.'),
            'code' => 'NOT_FOUND',
        ], Http::STATUS_NOT_FOUND);
    }

    private function validationError(string $message): DataResponse {
        return new DataResponse([
            'status' => 'error',
            'message' => $message,
            'code' => 'VALIDATION_ERROR',
        ], Http::STATUS_BAD_REQUEST);
    }
}

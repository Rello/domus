<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Http\FileResponse;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\DocumentService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\FileDisplayResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;

class DocumentController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private DocumentService $documentService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(string $entityType, int $entityId): DataResponse {
        return new DataResponse($this->documentService->listForEntity($this->getUserId(), $entityType, $entityId));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        return new DataResponse($this->documentService->getDocumentDetails($this->getUserId(), $id));
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function content(int $id): FileDisplayResponse|DataResponse {
        return FileResponse::download($this->documentService->getLinkedFile($this->getUserId(), $id));
    }

    #[NoAdminRequired]
    public function link(string $entityType, int $entityId, string $filePath, ?int $year = null, ?string $title = null, ?string $note = null): DataResponse {
        $link = $this->documentService->linkFile($this->getUserId(), $entityType, $entityId, $filePath, $year, $title, $note);
        return new DataResponse($link, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function upload(string $entityType, int $entityId): DataResponse {
        $file = $this->request->getUploadedFile('file');
        if (!$file) {
            throw new \InvalidArgumentException($this->l10n->t('File is required.'));
        }
        $yearParam = $this->request->getParam('year');
        $year = $yearParam !== null ? (int)$yearParam : null;
        $title = $this->request->getParam('title');
        $note = $this->request->getParam('note');
        $link = $this->documentService->uploadAndLink($this->getUserId(), $entityType, $entityId, $file, $year, $title, $note);
        return new DataResponse($link, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function attach(): DataResponse {
        $targetsRaw = $this->request->getParam('targets');
        $yearParam = $this->request->getParam('year');
        $title = $this->request->getParam('title');
        $note = $this->request->getParam('note');
        $uploadedFile = $this->request->getUploadedFile('file');
        $filePath = $this->request->getParam('filePath');
        $sourceLinkId = $this->request->getParam('sourceLinkId');
        if ($sourceLinkId !== null && (!ctype_digit((string)$sourceLinkId) || (int)$sourceLinkId <= 0)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid document link.'));
        }

        if (!$targetsRaw) {
            throw new \InvalidArgumentException($this->l10n->t('At least one target is required.'));
        }

        $targets = json_decode($targetsRaw, true);
        if (!is_array($targets)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid targets payload.'));
        }

        if (!$uploadedFile && !$filePath && !$sourceLinkId) {
            throw new \InvalidArgumentException($this->l10n->t('Provide a file upload or an existing path.'));
        }

        $year = $yearParam !== null ? (int)$yearParam : null;

        $links = $this->documentService->attachToTargets($this->getUserId(), $targets, $uploadedFile, $filePath, $year, $title, $note, null, $sourceLinkId ? (int)$sourceLinkId : null, $this->request->getParam('documentDate'));
        return new DataResponse($links, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $this->documentService->unlink($this->getUserId(), $id);
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }
}

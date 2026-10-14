<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Http\FileResponse;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\EntityImageService;
use OCA\Domus\Service\PermissionService;
use OCA\Domus\Service\PropertyService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\FileDisplayResponse;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\IRequest;
use OCP\IL10N;

class PropertyController extends Controller {
    public function __construct(
        IRequest $request,
        private ManagementAccessContext $managementContext,
        private PropertyService $propertyService,
        private PermissionService $permissionService,
        private EntityImageService $entityImageService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return new DataResponse($this->propertyService->listPropertiesForUser(
            $this->getUserId(),
            $this->permissionService->getRoleFromRequest($this->request)
        ));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        $property = $this->propertyService->getPropertyForUser($id, $this->getUserId());
        return new DataResponse($property);
    }

    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function imageContent(int $id): FileDisplayResponse|DataResponse {
        return FileResponse::image($this->entityImageService->getPropertyImage($id, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function create(string $name, string $usageRole, ?string $street = null, ?string $zip = null, ?string $city = null, ?string $country = null, ?string $type = null, ?string $description = null): DataResponse {
        $property = $this->propertyService->createProperty(compact('name', 'usageRole', 'street', 'zip', 'city', 'country', 'type', 'description'), $this->getUserId());
        return new DataResponse($property, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $name = null, ?string $usageRole = null, ?string $street = null, ?string $zip = null, ?string $city = null, ?string $country = null, ?string $type = null, ?string $description = null, ?string $documentPath = null): DataResponse {
        $data = array_filter([
            'name' => $name,
            'usageRole' => $usageRole,
            'street' => $street,
            'zip' => $zip,
            'city' => $city,
            'country' => $country,
            'type' => $type,
            'description' => $description,
            'documentPath' => $documentPath,
        ], fn($value) => $value !== null);
        $property = $this->propertyService->updateProperty($id, $data, $this->getUserId());
        return new DataResponse($property);
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $this->propertyService->deleteProperty($id, $this->getUserId());
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }

    #[NoAdminRequired]
    public function deletionSummary(int $id): DataResponse {
        return new DataResponse($this->propertyService->getDeletionSummary($id, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function uploadImage(int $id): DataResponse {
        $file = $this->request->getUploadedFile('image') ?: $this->request->getUploadedFile('file');
        if (!$file) {
            throw new \InvalidArgumentException($this->l10n->t('Image file is required.'));
        }

        return new DataResponse($this->entityImageService->uploadPropertyImage($id, $file, $this->getUserId()));
    }

    #[NoAdminRequired]
    public function removeImage(int $id): DataResponse {
        return new DataResponse($this->entityImageService->removePropertyImage($id, $this->getUserId()));
    }

    private function getUserId(): string {
        return $this->managementContext->managementUserId();
    }
}

<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\PropertyService;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class PropertyController extends BaseController {
    public function __construct(
        IRequest $request,
        IL10N $l10n,
        IUserSession $userSession,
        private PropertyService $propertyService
    ) {
        parent::__construct($request, $l10n, $userSession);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        $userId = $this->getCurrentUserId();
        return new DataResponse($this->propertyService->list($userId));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        try {
            $property = $this->propertyService->getById($id, $this->getCurrentUserId());
            return new DataResponse($property);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function create(string $name, string $usageRole, ?string $street = null, ?string $zip = null, ?string $city = null,
        ?string $country = null, ?string $type = null, ?string $description = null): DataResponse {
        try {
            $property = $this->propertyService->create([
                'name' => $name,
                'usageRole' => $usageRole,
                'street' => $street,
                'zip' => $zip,
                'city' => $city,
                'country' => $country,
                'type' => $type,
                'description' => $description,
            ], $this->getCurrentUserId());
            return new DataResponse($property, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $name = null, ?string $usageRole = null, ?string $street = null, ?string $zip = null,
        ?string $city = null, ?string $country = null, ?string $type = null, ?string $description = null): DataResponse {
        try {
            $data = array_filter([
                'name' => $name,
                'usageRole' => $usageRole,
                'street' => $street,
                'zip' => $zip,
                'city' => $city,
                'country' => $country,
                'type' => $type,
                'description' => $description,
            ], static fn($v) => $v !== null);
            $property = $this->propertyService->update($id, $data, $this->getCurrentUserId());
            return new DataResponse($property);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        try {
            $this->propertyService->delete($id, $this->getCurrentUserId());
            return new DataResponse(['status' => 'success']);
        } catch (\RuntimeException $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_CONFLICT);
        } catch (\Throwable $e) {
            return new DataResponse(['message' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }
}

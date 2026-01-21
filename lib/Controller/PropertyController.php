<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\PropertyService;
use OCP\AppFramework\OCSController;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\FrontpageRoute;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\OCSDescription;
use OCP\IRequest;
use OCP\IL10N;
use OCP\IUserSession;

class PropertyController extends OCSController {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private PropertyService $propertyService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[FrontpageRoute(verb: 'GET', url: '/')]
    #[NoAdminRequired]
    #[OCSDescription('List properties for the current user.')]
    public function frontpage(): DataResponse {
        return $this->index();
    }

    #[NoAdminRequired]
    #[OCSDescription('List properties for the current user.')]
    public function index(): DataResponse {
        return new DataResponse($this->propertyService->listPropertiesForUser($this->getUserId()));
    }

    #[NoAdminRequired]
    #[OCSDescription('Fetch a single property for the current user.')]
    public function show(int $id): DataResponse {
        try {
            $property = $this->propertyService->getPropertyForUser($id, $this->getUserId());
            return new DataResponse($property);
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    #[OCSDescription('Create a new property for the current user.')]
    public function create(string $name, string $usageRole, ?string $street = null, ?string $zip = null, ?string $city = null, ?string $country = null, ?string $type = null, ?string $description = null): DataResponse {
        try {
            $property = $this->propertyService->createProperty(compact('name', 'usageRole', 'street', 'zip', 'city', 'country', 'type', 'description'), $this->getUserId());
            return new DataResponse($property, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    #[OCSDescription('Update an existing property for the current user.')]
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
        try {
            $property = $this->propertyService->updateProperty($id, $data, $this->getUserId());
            return new DataResponse($property);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    #[OCSDescription('Delete a property for the current user.')]
    public function destroy(int $id): DataResponse {
        try {
            $this->propertyService->deleteProperty($id, $this->getUserId());
            return new DataResponse([], Http::STATUS_NO_CONTENT);
        } catch (\RuntimeException $e) {
            return new DataResponse([
                'status' => 'error',
                'message' => $e->getMessage(),
                'code' => 'CONFLICT',
            ], Http::STATUS_CONFLICT);
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

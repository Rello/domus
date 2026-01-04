<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\TaskTemplateService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;

class TaskTemplateController extends Controller {
    public function __construct(
        IRequest $request,
        private IUserSession $userSession,
        private TaskTemplateService $taskTemplateService,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        return new DataResponse($this->taskTemplateService->listTemplatesForUser($this->getUserId()));
    }

    #[NoAdminRequired]
    public function create(string $title, ?string $description = null, ?int $required = null, ?int $enabled = null): DataResponse {
        try {
            $template = $this->taskTemplateService->createTemplate([
                'title' => $title,
                'description' => $description,
                'required' => $required,
                'enabled' => $enabled,
            ], $this->getUserId());

            return new DataResponse($template, Http::STATUS_CREATED);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        }
    }

    #[NoAdminRequired]
    public function update(int $id, ?string $title = null, ?string $description = null, ?int $required = null, ?int $enabled = null, ?int $order = null): DataResponse {
        $payload = array_filter([
            'title' => $title,
            'description' => $description,
            'required' => $required,
            'enabled' => $enabled,
            'order' => $order,
        ], fn($value) => $value !== null);

        try {
            $template = $this->taskTemplateService->updateTemplate($id, $payload, $this->getUserId());
            return new DataResponse($template);
        } catch (\InvalidArgumentException $e) {
            return $this->validationError($e->getMessage());
        } catch (\Throwable $e) {
            return $this->notFound();
        }
    }

    #[NoAdminRequired]
    public function reorder(array $order): DataResponse {
        try {
            return new DataResponse($this->taskTemplateService->reorderTemplates($this->getUserId(), $order));
        } catch (\Throwable $e) {
            return $this->validationError($this->l10n->t('Task template order is invalid.'));
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

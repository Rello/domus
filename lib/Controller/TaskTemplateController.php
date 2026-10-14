<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\TaskTemplateService;
use OCA\Domus\Service\ManagementAccessContext;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IL10N;

class TaskTemplateController extends Controller {
    public function __construct(
        IRequest $request,
        private TaskTemplateService $taskTemplateService,
        private IL10N $l10n,
        private ManagementAccessContext $managementContext,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(?int $activeOnly = 1, ?string $appliesTo = null): DataResponse {
        $this->managementContext->managementUserId();
        return new DataResponse($this->taskTemplateService->listTemplates((bool)$activeOnly, $appliesTo));
    }

    #[NoAdminRequired]
    public function show(int $id): DataResponse {
        $this->managementContext->managementUserId();
        return new DataResponse($this->taskTemplateService->getTemplateWithSteps($id));
    }

    #[NoAdminRequired]
    public function create(): DataResponse {
        $this->managementContext->managementUserId();
        $payload = $this->request->getParams();
        $template = $this->taskTemplateService->createTemplate($payload);
        return new DataResponse($template, Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function update(int $id): DataResponse {
        $this->managementContext->managementUserId();
        $payload = $this->request->getParams();
		return new DataResponse($this->taskTemplateService->updateTemplate($id, $payload));
    }

    #[NoAdminRequired]
    public function destroy(int $id): DataResponse {
        $this->managementContext->managementUserId();
        $this->taskTemplateService->deleteTemplate($id);
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }

    #[NoAdminRequired]
    public function reorderSteps(int $id): DataResponse {
        $this->managementContext->managementUserId();
        $payload = $this->request->getParams();
        $orderedStepIds = $payload['orderedStepIds'] ?? [];
        return new DataResponse([
            'steps' => $this->taskTemplateService->reorderSteps($id, $orderedStepIds),
        ]);
    }

    #[NoAdminRequired]
    public function addStep(int $id): DataResponse {
        $this->managementContext->managementUserId();
        $payload = $this->request->getParams();
        return new DataResponse($this->taskTemplateService->addOrUpdateStep($id, $payload), Http::STATUS_CREATED);
    }

    #[NoAdminRequired]
    public function updateStep(int $stepId): DataResponse {
        $this->managementContext->managementUserId();
        $payload = $this->request->getParams();
        $payload['id'] = $stepId;
        $templateId = isset($payload['templateId']) ? (int)$payload['templateId'] : 0;
        if ($templateId <= 0) {
            throw new \InvalidArgumentException($this->l10n->t('Template is required.'));
        }
		return new DataResponse($this->taskTemplateService->addOrUpdateStep($templateId, $payload));
    }

    #[NoAdminRequired]
    public function deleteStep(int $stepId): DataResponse {
        $this->managementContext->managementUserId();
        $this->taskTemplateService->deleteStep($stepId);
        return new DataResponse([], Http::STATUS_NO_CONTENT);
    }
}

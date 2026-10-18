<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCA\Domus\Service\{RuleService, ManagementAccessContext};
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class RuleController extends Controller {
    public function __construct(IRequest $request, private RuleService $rules, private ManagementAccessContext $access) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(): DataResponse {
        $this->access->managementUserId();
        return new DataResponse($this->rules->listRules());
    }

    #[NoAdminRequired]
    public function options(): DataResponse {
        return new DataResponse($this->rules->options($this->access->managementUserId()));
    }

    #[NoAdminRequired]
    public function save(): DataResponse {
        return new DataResponse($this->rules->save(null, $this->request->getParams(), $this->access->managementUserId()));
    }

    #[NoAdminRequired]
    public function update(int $id): DataResponse {
        return new DataResponse($this->rules->save($id, $this->request->getParams(), $this->access->managementUserId()));
    }

    #[NoAdminRequired]
    public function delete(int $id): DataResponse {
        $this->rules->delete($id, $this->access->managementUserId());
        return new DataResponse([]);
    }

    #[NoAdminRequired]
    public function preview(): DataResponse {
        return new DataResponse($this->rules->preview($this->request->getParams(), $this->access->managementUserId()));
    }

    #[NoAdminRequired]
    public function evaluate(?int $unitId = null): DataResponse {
        return new DataResponse($this->rules->evaluate($this->access->managementUserId(), $unitId));
    }

    #[NoAdminRequired]
    public function reference(int $tenancyId, string $date): DataResponse {
        $this->rules->setReference($tenancyId, $date, $this->access->managementUserId());
        return new DataResponse([]);
    }
}

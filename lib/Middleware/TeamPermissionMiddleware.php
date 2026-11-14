<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Middleware;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\TeamPermissionService;
use OCP\AppFramework\{Controller, Middleware};
use OCP\IRequest;

class TeamPermissionMiddleware extends Middleware {
    public function __construct(private ManagementAccessContext $access, private IRequest $request) {}

    public function beforeController(Controller $controller, string $methodName): void {
        $name = (new \ReflectionClass($controller))->getShortName();
        $name = substr($name, 0, -strlen('Controller'));
        $capability = TeamPermissionService::required($name, $methodName, $this->request->getMethod(), $this->request->getParams());
        if ($capability !== null) $this->access->assertCapability($capability);
    }
}

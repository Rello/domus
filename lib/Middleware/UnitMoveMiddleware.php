<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Middleware;

use OCA\Domus\Controller\{PageController, UnitMoveController, TeamIntegrationController, RuleController};
use OCA\Domus\Service\UnitMoveGuard;
use OCP\AppFramework\{Controller, Middleware};
use OCP\AppFramework\Http\Response;
use OCP\{IRequest, IUserSession};

class UnitMoveMiddleware extends Middleware {
    private ?string $lockedUser = null;
    public function __construct(private UnitMoveGuard $guard, private IRequest $request, private IUserSession $session) {}

    public function beforeController(Controller $controller, string $methodName): void {
        if ($controller instanceof RuleController && $methodName === 'evaluate') return;
        if ($controller instanceof PageController || $controller instanceof UnitMoveController || $controller instanceof TeamIntegrationController
            || in_array($this->request->getMethod(), ['GET', 'HEAD', 'OPTIONS'], true)) return;
        $userId = $this->session->getUser()?->getUID();
        if ($userId === null) return;
        $this->guard->acquire($userId);
        $this->lockedUser = $userId;
        // Pause this actor's writes while copying; reads and Team selection stay available.
        try {
            $this->guard->assertWritable($userId);
        } catch (\Throwable $e) {
            $this->release();
            throw $e;
        }
    }

    public function afterController(Controller $controller, string $methodName, Response $response): Response {
        $this->release();
        return $response;
    }

    public function afterException(Controller $controller, string $methodName, \Exception $exception): Response {
        $this->release();
        throw $exception;
    }

    private function release(): void {
        if ($this->lockedUser !== null) {
            $this->guard->release($this->lockedUser);
            $this->lockedUser = null;
        }
    }
}

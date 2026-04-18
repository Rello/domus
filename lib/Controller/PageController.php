<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\AccountService;
use OCA\Domus\Service\DemoContentService;
use OCA\Domus\Service\PermissionService;
use OCA\Domus\AppInfo\Application;
use OCA\Viewer\Event\LoadViewer;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IConfig;
use OCP\IRequest;
use OCP\IL10N;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\IUserSession;

class PageController extends Controller {
    public function __construct(
        IRequest $request,
        private AccountService $accountService,
        private DemoContentService $demoContentService,
        private PermissionService $permissionService,
        private IEventDispatcher $eventDispatcher,
        private IConfig $config,
        private IUserSession $userSession,
        private IL10N $l10n,
        private IInitialState $initialState,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
        #[NoCSRFRequired]
    public function index(): TemplateResponse {
        if (class_exists(LoadViewer::class)) {
            $this->eventDispatcher->dispatchTyped(new LoadViewer());
        }

        $user = $this->userSession->getUser();
        $wizardValue = 0;
        if ($user !== null) {
            $wizardValue = (int)$this->config->getUserValue($user->getUID(), 'domus', 'wizard', 0);
            if ($wizardValue === 0) {
                $this->demoContentService->createInitialDemoContentIfNeeded($user->getUID());
            }
        }
        $this->initialState->provideInitialState('wizard', $wizardValue);

        return new TemplateResponse(Application::APP_ID, 'main', [
            'accounts' => $this->accountService->getHierarchyForUser($this->getUserId(), $this->l10n),
            'roleInfo' => $this->permissionService->getRoleInfoForCurrentUser(),
        ]);
    }

    private function getUserId(): string {
        return $this->userSession->getUser()?->getUID() ?? '';
    }
}

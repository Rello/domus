<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Controller;

use OCA\Domus\Service\AccountService;
use OCA\Domus\Service\DemoContentService;
use OCA\Domus\Service\PermissionService;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\RenterAccessService;
use OCA\Domus\AppInfo\Application;
use OCA\Viewer\Event\LoadViewer;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Services\IInitialState;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IConfig;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IL10N;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\IURLGenerator;
use OCP\IUserSession;

class PageController extends Controller {
    public function __construct(
        IRequest $request,
        private AccountService $accountService,
        private DemoContentService $demoContentService,
        private PermissionService $permissionService,
        private IEventDispatcher $eventDispatcher,
        private IConfig $config,
        private IURLGenerator $urlGenerator,
        private IUserSession $userSession,
        private IL10N $l10n,
        private IInitialState $initialState,
        private IGroupManager $groupManager,
        private ManagementAccessContext $managementContext,
        private RenterAccessService $renterAccess,
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
        $isStaff = $user !== null && $user->isEnabled()
            && !$this->groupManager->isInGroup($user->getUID(), 'guest_app');
        $managementCapabilities = $user !== null ? $this->managementContext->capabilities() : null;
        $managementUserId = $isStaff && ($managementCapabilities['canManage'] ?? false)
            ? $this->managementContext->managementUserId() : null;
        $renterIdentity = $user !== null ? $this->renterAccess->identity() : null;
        $hasRenterLinks = !empty($renterIdentity['partners']);
        if ($user !== null && $hasRenterLinks) {
            $this->config->setUserValue($user->getUID(), 'domus', 'renterEntry', '1');
        }
        // Remember the entry view so losing the last link shows no access rather than creating demo data.
        $isRenter = !$isStaff || $hasRenterLinks || ($user !== null
            && $this->config->getUserValue($user->getUID(), 'domus', 'renterEntry', '0') === '1');
        $this->initialState->provideInitialState('renterIdentity', $renterIdentity);
        $this->initialState->provideInitialState('renterEntry', $isRenter);
        $wizardValue = $isRenter ? 1 : 0;
        if (!$isRenter && $managementUserId !== null && $this->managementContext->activeTeamId() === null) {
            $wizardValue = (int)$this->config->getUserValue($user->getUID(), 'domus', 'wizard', 0);
            if ($wizardValue === 0) {
                $this->demoContentService->createInitialDemoContentIfNeeded($managementUserId);
            }
        }
        $this->initialState->provideInitialState('wizard', $wizardValue);
        if ($user !== null) {
            $this->initialState->provideInitialState('managementContext', $managementCapabilities);
        }

        return new TemplateResponse(Application::APP_ID, 'main', [
            'accounts' => !$isRenter && $managementUserId !== null ? $this->accountService->getHierarchyForUser($managementUserId, $this->l10n) : [],
            'roleInfo' => $isStaff ? $this->permissionService->getRoleInfoForCurrentUser() : ['currentRole' => 'tenant', 'availableRoles' => ['tenant']],
            'urlGenerator' => $this->urlGenerator,
        ]);
    }
}

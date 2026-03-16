<?php

namespace OCA\Domus\Controller;

use OCA\Domus\Service\AccountService;
use OCA\Domus\AppInfo\Application;
use OCA\Viewer\Event\LoadViewer;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IRequest;
use OCP\IL10N;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\IUserSession;

class PageController extends Controller {
    public function __construct(
        IRequest $request,
        private AccountService $accountService,
        private IEventDispatcher $eventDispatcher,
			private IUserSession $userSession,
			private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
        #[NoCSRFRequired]
    public function index(): TemplateResponse {
        if (class_exists(LoadViewer::class)) {
            $this->eventDispatcher->dispatchTyped(new LoadViewer());
        }
        return new TemplateResponse(Application::APP_ID, 'main', [
            'accounts' => $this->accountService->getHierarchyForUser($this->getUserId(), $this->l10n),
        ]);
    }

	private function getUserId(): string {
		return $this->userSession->getUser()?->getUID() ?? '';
	}
}

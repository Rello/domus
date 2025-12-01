<?php

namespace OCA\Domus\Controller;

use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;

class PageController extends BaseController {
    public function __construct(IRequest $request, IL10N $l10n, IUserSession $userSession) {
        parent::__construct($request, $l10n, $userSession);
    }

	#[NoCSRFRequired]
	#[NoAdminRequired]
    public function index(): TemplateResponse {
        return new TemplateResponse('domus', 'main');
    }
}

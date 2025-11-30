<?php

namespace OCA\Domus\Controller;

use OCP\AppFramework\Http\TemplateResponse;
use OCP\IL10N;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\AppFramework\Attributes\NoAdminRequired;

class PageController extends BaseController {
    public function __construct(IRequest $request, IL10N $l10n, IUserSession $userSession) {
        parent::__construct($request, $l10n, $userSession);
    }

    #[NoAdminRequired]
    public function index(): TemplateResponse {
        return new TemplateResponse('domus', 'main');
    }
}

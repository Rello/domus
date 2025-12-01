<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use OCP\IL10N;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;

class PageController extends Controller {
    public function __construct(
        IRequest $request,
        private IL10N $l10n,
    ) {
        parent::__construct(Application::APP_ID, $request);
    }

    #[NoAdminRequired]
    public function index(): TemplateResponse {
        return new TemplateResponse(Application::APP_ID, 'main');
    }
}

<?php

namespace OCA\Domus\Controller;

use OCA\Domus\AppInfo\Application;
use OCP\AppFramework\Controller;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\IL10N;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http;

abstract class BaseController extends Controller {
    protected IL10N $l10n;
    protected IUserSession $userSession;

    public function __construct(IRequest $request, IL10N $l10n, IUserSession $userSession) {
        parent::__construct(Application::APP_ID, $request);
        $this->l10n = $l10n;
        $this->userSession = $userSession;
    }

    protected function getCurrentUserId(): string {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new \RuntimeException('User not logged in');
        }
        return $user->getUID();
    }

    protected function validationError(string $message): DataResponse {
        return new DataResponse([
            'status' => 'error',
            'message' => $message,
            'code' => 'VALIDATION_ERROR',
        ], Http::STATUS_BAD_REQUEST);
    }
}

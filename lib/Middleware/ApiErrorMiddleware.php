<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Middleware;

use OCA\Domus\Controller\PageController;
use OCA\Domus\Http\ApiErrorResponse;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Middleware;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

class ApiErrorMiddleware extends Middleware {
    public function __construct(private IL10N $l10n, private LoggerInterface $logger) {
    }

    public function afterException(Controller $controller, string $methodName, \Exception $exception): DataResponse {
        // Nextcloud retains its normal HTML error handling for the app entry page.
        if ($controller instanceof PageController) {
            throw $exception;
        }
        return ApiErrorResponse::fromException($exception, $this->l10n, $this->logger);
    }
}

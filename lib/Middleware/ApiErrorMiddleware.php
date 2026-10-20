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
use OCP\AppFramework\OCSController;
use OCP\AppFramework\OCS\OCSException;
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
        if ($controller instanceof OCSController && $exception instanceof OCSException) {
            throw $exception;
        }
        $response = ApiErrorResponse::fromException($exception, $this->l10n, $this->logger);
        if ($controller instanceof OCSController) {
            // Let Nextcloud's OCS middleware wrap errors as well as successes.
            throw new OCSException($response->getData()['message'], $response->getStatus());
        }
        return $response;
    }
}

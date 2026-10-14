<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Http;

use OCA\Domus\Exception\ConflictException;
use OCA\Domus\Exception\ResourceNotFoundException;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http\DataResponse;
use OCP\Files\NotFoundException;
use OCP\IL10N;
use Psr\Log\LoggerInterface;

/** One response contract for management, Team, and renter endpoints. */
class ApiErrorResponse {
    public static function fromException(\Throwable $exception, IL10N $l10n, LoggerInterface $logger): DataResponse {
        if ($exception instanceof ResourceNotFoundException || $exception instanceof DoesNotExistException || $exception instanceof NotFoundException) {
            $status = 404;
            $code = 'NOT_FOUND';
            $message = $l10n->t('Resource not found.');
        } elseif ($exception instanceof \InvalidArgumentException) {
            $status = 400;
            $code = 'VALIDATION_ERROR';
            $message = $exception->getMessage();
        } elseif ($exception instanceof \DomainException) {
            $status = 403;
            $code = 'ACCESS_DENIED';
            $message = $exception->getMessage();
        } elseif ($exception instanceof ConflictException) {
            $status = 409;
            $code = 'CONFLICT';
            $message = $exception->getMessage();
        } else {
            $logger->error('Domus API request failed', ['exception' => $exception]);
            $status = 500;
            $code = 'INTERNAL_ERROR';
            $message = $l10n->t('An error occurred');
        }

        // Localize low-level errors without formatting already translated service messages again.
        $message = match ($message) {
            'The requested owner does not match the signed-in account.' => $l10n->t('The requested owner does not match the signed-in account.'),
            'The record belongs to another Team.' => $l10n->t('The record belongs to another Team.'),
            'The record does not belong to the selected Team.' => $l10n->t('The record does not belong to the selected Team.'),
            'The record is not available to this owner.' => $l10n->t('The record is not available to this owner.'),
            'Team records cannot use personal data transfer.' => $l10n->t('Team records cannot use personal data transfer.'),
            'This request has already been reviewed.' => $l10n->t('This request has already been reviewed.'),
            default => $message,
        };

        $response = new DataResponse(['status' => 'error', 'message' => $message, 'code' => $code], $status);
        $response->addHeader('Cache-Control', 'private, no-store');
        return $response;
    }
}

<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Controller;

use OCA\Domus\Service\BookingAssignmentPreviewService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;

class BookingAssignmentPreviewController extends Controller {
    public function __construct(IRequest $request, private BookingAssignmentPreviewService $service) {
        parent::__construct('domus', $request);
    }
    private function respond(callable $operation, int $status = 200): DataResponse {
        try {
            $response = new DataResponse($operation(), $status);
        } catch (\OCA\Domus\Exception\BookingAssignmentException $e) {
            $response = new DataResponse(['message' => $e->getMessage()], 422);
        }
        $response->addHeader('Cache-Control', 'private, no-store');
        return $response;
    }
    #[NoAdminRequired]
    public function create(int $unitId, ?string $filePath = null): DataResponse {
        return $this->respond(fn() => $this->service->create($unitId, $filePath, $this->request->getUploadedFile('file')), 202);
    }
    #[NoAdminRequired]
    public function show(int $unitId, int $taskId): DataResponse {
        return $this->respond(fn() => $this->service->show($unitId, $taskId));
    }
    #[NoAdminRequired]
    public function discard(int $unitId, int $taskId): DataResponse {
        $this->service->discard($unitId, $taskId);
        return new DataResponse([]);
    }
}

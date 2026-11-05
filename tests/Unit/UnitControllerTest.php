<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Controller\UnitController;
use OCA\Domus\Db\Unit;
use OCA\Domus\Service\EntityImageService;
use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\PermissionService;
use OCA\Domus\Service\ServiceChargeSettlementService;
use OCA\Domus\Service\UnitService;
use OCA\Domus\Service\UnitTransferService;
use OCP\IL10N;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

class UnitControllerTest extends TestCase {
    /** @dataProvider notesCases */
    public function testNotesReachPersistence(string $action, ?string $notes): void {
        $context = $this->createMock(ManagementAccessContext::class);
        $context->method('managementUserId')->willReturn('owner');
        $permissions = $this->createMock(PermissionService::class);
        $permissions->method('getRoleFromRequest')->willReturn('landlord');
        $service = $this->createMock(UnitService::class);
        $dataCheck = self::callback(static function (array $data) use ($action, $notes): bool {
            return $data['notes'] === 'Description'
                && ($action === 'update' && $notes === null
                    ? !array_key_exists('additionalNotes', $data)
                    : array_key_exists('additionalNotes', $data) && $data['additionalNotes'] === $notes);
        });
        if ($action === 'create') {
            $service->expects(self::once())->method('createUnit')->with($dataCheck, 'owner', 'landlord')->willReturn(new Unit());
        } else {
            $service->expects(self::once())->method('updateUnit')->with(7, $dataCheck, 'owner', 'landlord')->willReturn(new Unit());
        }
        $controller = new UnitController(
            $this->createMock(IRequest::class), $context, $service,
            $this->createMock(ServiceChargeSettlementService::class), $permissions,
            $this->createMock(UnitTransferService::class), $this->createMock(EntityImageService::class),
            $this->createMock(IL10N::class),
        );
        if ($action === 'create') {
            $controller->create(propertyId: null, label: 'Unit', notes: 'Description', additionalNotes: $notes);
        } else {
            $controller->update(id: 7, notes: 'Description', additionalNotes: $notes);
        }
    }

    public function notesCases(): array {
        return [
            ['create', "Meter 12345\nBasement"],
            ['update', "Meter 67890\nBasement"],
            ['update', ''],
            ['update', null],
        ];
    }
}

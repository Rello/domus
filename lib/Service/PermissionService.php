<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Service;

use OCP\IL10N;
use OCP\IGroupManager;
use OCP\IRequest;
use OCP\IUserSession;

class PermissionService {
    private const ROLE_LANDLORD = 'landlord';
    private const ROLE_BUILDING_MGMT = 'buildingMgmt';
    private const BUILDING_MGMT_GROUP_ID = 'domus_property_management';
    private const PARTNER_TYPES = ['tenant', 'owner', 'buildingManagement', 'contractor', 'facilities'];

    public function __construct(
        private IL10N $l10n,
        private IGroupManager $groupManager,
        private IUserSession $userSession,
    ) {
    }

    public function getRoleFromRequest(IRequest $request): string {
        $roleHeader = $request->getHeader('X-Domus-Role');
        $roleParam = $request->getParam('role');
        $requestedRole = $roleHeader ?: $roleParam;

        if ($requestedRole === self::ROLE_BUILDING_MGMT && $this->canUseBuildingManagement()) {
            return self::ROLE_BUILDING_MGMT;
        }

        return self::ROLE_LANDLORD;
    }

    public function getRoleInfoForCurrentUser(): array {
        $availableRoles = [self::ROLE_LANDLORD];
        if ($this->canUseBuildingManagement()) {
            $availableRoles[] = self::ROLE_BUILDING_MGMT;
        }

        return [
            'currentRole' => self::ROLE_LANDLORD,
            'availableRoles' => $availableRoles,
        ];
    }

    public function isBuildingManagement(string $role): bool {
        return $role === self::ROLE_BUILDING_MGMT;
    }

    public function isLandlord(string $role): bool {
        return $role === self::ROLE_LANDLORD;
    }

    public function assertPropertyRequirement(string $role, ?int $propertyId): void {
        if ($this->isBuildingManagement($role) && ($propertyId === null || $propertyId === 0)) {
            throw new \InvalidArgumentException($this->l10n->t('Property is required for building management.'));
        }
    }

    public function assertPartnerTypeForRole(string $role, string $partnerType): void {
        $expectedType = $this->getAllowedPartnerType($role);
        if ($partnerType !== $expectedType) {
            throw new \InvalidArgumentException($this->l10n->t('Partner type does not match the current role.'));
        }
    }

    public function assertPartnerTypeAllowed(string $partnerType): void {
        if (!in_array($partnerType, self::PARTNER_TYPES, true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid partner type.'));
        }
    }

    public function assertPartnerMatchesRole(string $role, string $partnerType): void {
        $this->assertPartnerTypeForRole($role, $partnerType);
    }

    public function filterPartnerListType(?string $type): ?string {
        if ($type === null || $type === '') {
            return null;
        }
        $this->assertPartnerTypeAllowed($type);
        return $type;
    }

    public function guardTenancyFinancialFields(string $role, array $payload): array {
        if (!$this->isBuildingManagement($role)) {
            return $payload;
        }

        foreach (['baseRent', 'serviceCharge', 'deposit'] as $field) {
            if (array_key_exists($field, $payload) && $payload[$field] !== null && $payload[$field] !== '') {
                throw new \InvalidArgumentException($this->l10n->t('Field %s cannot be set for building management.', [$field]));
            }
            }

        $payload['baseRent'] = '0';
        $payload['serviceCharge'] = null;
        $payload['deposit'] = null;

        return $payload;
    }

    private function getAllowedPartnerType(string $role): string {
        return $this->isBuildingManagement($role) ? 'owner' : 'tenant';
    }

    public function getAllowedPartnerTypes(): array {
        return self::PARTNER_TYPES;
    }

    private function canUseBuildingManagement(): bool {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return false;
        }

        return in_array(self::BUILDING_MGMT_GROUP_ID, $this->groupManager->getUserGroupIds($user), true);
    }
}

<?php

namespace OCA\Domus\Service;

use OCP\IL10N;
use OCP\IRequest;

class PermissionService {
    private const ROLE_LANDLORD = 'landlord';
    private const ROLE_BUILDING_MGMT = 'buildingMgmt';

    public function __construct(
        private IL10N $l10n,
    ) {
    }

    public function getRoleFromRequest(IRequest $request): string {
        $roleHeader = $request->getHeader('X-Domus-Role');
        $roleParam = $request->getParam('role');
        $role = $roleHeader ?: $roleParam;

        return in_array($role, [self::ROLE_LANDLORD, self::ROLE_BUILDING_MGMT], true)
            ? $role
            : self::ROLE_LANDLORD;
    }

    public function isBuildingManagement(string $role): bool {
        return $role === self::ROLE_BUILDING_MGMT;
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

    public function assertPartnerMatchesRole(string $role, string $partnerType): void {
        $this->assertPartnerTypeForRole($role, $partnerType);
    }

    public function filterPartnerListType(?string $type, string $role): string {
        $allowedType = $this->getAllowedPartnerType($role);
        if ($type === null || $type === '') {
            return $allowedType;
        }
        $this->assertPartnerTypeForRole($role, $type);
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
}

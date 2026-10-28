<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{Partner, Unit, Property, Tenancy};
use OCA\Domus\Service\{PartnerService, UnitService, PropertyService, TenancyService};
use PHPUnit\Framework\TestCase;

class AuditDomainTest extends TestCase {
    private function service(string $class, array &$deps): object {
        $deps = [];
        foreach ((new \ReflectionClass($class))->getConstructor()->getParameters() as $parameter) {
            $deps[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        return new $class(...array_values($deps));
    }

    /** @dataProvider deletions */
    public function testDeletionAuditsOnlyAfterSuccessfulDelete(string $serviceClass, string $entityClass, string $entityType): void {
        $deps = [];
        $service = $this->service($serviceClass, $deps);
        $entity = new $entityClass();
        $entity->setId(7); $entity->setTeamId('team-a'); $entity->setUserId('owner');
        if ($entity instanceof Tenancy) { $entity->setUnitId(1); $entity->setStartDate('2026-01-01'); }
        $deps[$entityType . 'Mapper']->method('findForUser')->willReturn($entity);
        $deleted = false;
        $deps[$entityType . 'Mapper']->method('delete')->willReturnCallback(function ($entity) use (&$deleted) { $deleted = true; return $entity; });
        $deps['audit']->expects(self::once())->method('record')->with($entityType . '.deleted', 7, 'owner', 'team-a', self::isType('array'))
            ->willReturnCallback(function () use (&$deleted) { self::assertTrue($deleted); });
        $method = 'delete' . ucfirst($entityType);
        $service->$method(7, 'owner');
    }

    public static function deletions(): array {
        return [[PartnerService::class, Partner::class, 'partner'], [UnitService::class, Unit::class, 'unit'],
            [PropertyService::class, Property::class, 'property'], [TenancyService::class, Tenancy::class, 'tenancy']];
    }

    public function testFailedPartnerDeleteDoesNotAuditSuccess(): void {
        $deps = [];
        $service = $this->service(PartnerService::class, $deps);
        $partner = new Partner(); $partner->setId(7);
        $deps['partnerMapper']->method('findForUser')->willReturn($partner);
        $deps['partnerMapper']->method('delete')->willThrowException(new \RuntimeException('Failed write'));
        $deps['audit']->expects(self::never())->method('record');
        $this->expectException(\RuntimeException::class);
        $service->deletePartner(7, 'owner');
    }

    public function testPartnerFormCapturesOldAndNewAccountAfterWrite(): void {
        $deps = [];
        $service = $this->service(PartnerService::class, $deps);
        $partner = new Partner(); $partner->setId(7); $partner->setName('Tenant'); $partner->setTeamId('a'); $partner->setNcUserId('old');
        $deps['partnerMapper']->method('findForUser')->willReturn($partner);
        $written = false;
        $deps['partnerMapper']->method('update')->willReturnCallback(function ($entity) use (&$written) { $written = true; return $entity; });
        $deps['audit']->expects(self::once())->method('account')->with(7, 'owner', 'a', 'old', null)
            ->willReturnCallback(function () use (&$written) { self::assertTrue($written); });
        $service->updatePartner(7, ['ncUserId' => ''], 'owner', 'landlord');
    }
}

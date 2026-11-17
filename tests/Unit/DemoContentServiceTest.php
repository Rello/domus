<?php
// SPDX-FileCopyrightText: 2026 Marcel Scherello
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{DistributionKey, Partner, Property, Unit};
use OCA\Domus\Http\ApiErrorResponse;
use OCA\Domus\Service\DemoContentService;
use PHPUnit\Framework\TestCase;

class DemoContentServiceTest extends TestCase {
    private function fixture(?string $teamId = null): array {
        $dependencies = [];
        foreach ((new \ReflectionClass(DemoContentService::class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $dependencies['managementContext']->method('activeTeamId')->willReturn($teamId);
        $dependencies['l10n']->method('t')->willReturnArgument(0);
        return [new DemoContentService(...$dependencies), $dependencies];
    }

    public static function roles(): array {
        return [['landlord'], ['buildingMgmt']];
    }

    /** @dataProvider roles */
    public function testTeamDemoCreationIsForbiddenBeforeAnyWrites(string $role): void {
        [$service, $dependencies] = $this->fixture('team-a');
        $dependencies['connection']->expects(self::never())->method('beginTransaction');
        $dependencies['unitService']->expects(self::never())->method('createUnit');
        $dependencies['propertyService']->expects(self::never())->method('createProperty');
        $dependencies['documentService']->expects(self::never())->method('createContentForTargets');
        $dependencies['entityImageService']->expects(self::never())->method('applyBundledUnitImage');
        try {
            $service->createDemoContent('alice', $role);
            self::fail('Demo creation must reject a Team workspace.');
        } catch (\DomainException $exception) {
            $response = ApiErrorResponse::fromException($exception, $dependencies['l10n'], $dependencies['logger']);
            self::assertSame(403, $response->getStatus());
            self::assertSame('ACCESS_DENIED', $response->getData()['code']);
            self::assertSame('Demo content can only be created in the Personal workspace.', $response->getData()['message']);
        }
    }

    public function testInitialDemoInTeamDoesNotConsumePersonalOnboarding(): void {
        [$service, $dependencies] = $this->fixture('team-a');
        $dependencies['config']->expects(self::never())->method('getUserValue');
        $dependencies['config']->expects(self::never())->method('setUserValue');
        $dependencies['unitMapper']->expects(self::never())->method('findByUser');
        $dependencies['connection']->expects(self::never())->method('beginTransaction');
        $service->createInitialDemoContentIfNeeded('alice');
    }

    private function preparePersonalCreation(array $dependencies): void {
        $unit = new Unit();
        $unit->setId(10);
        $dependencies['unitService']->expects(self::once())->method('createUnit')->willReturn($unit);
        $property = new Property();
        $property->setId(20);
        $dependencies['propertyService']->method('createProperty')->willReturn($property);
        $partnerId = 30;
        $dependencies['partnerService']->method('createPartner')->willReturnCallback(static function () use (&$partnerId): Partner {
            $partner = new Partner();
            $partner->setId($partnerId++);
            return $partner;
        });
        $keyId = 40;
        $dependencies['distributionKeyMapper']->method('insert')->willReturnCallback(static function (DistributionKey $key) use (&$keyId): DistributionKey {
            $key->setId($keyId++);
            return $key;
        });
        $dependencies['taskTemplateMapper']->method('findByKey')->willReturn(null);
        $dependencies['bookingService']->expects(self::atLeastOnce())->method('createBooking');
        $dependencies['connection']->expects(self::once())->method('beginTransaction');
        $dependencies['connection']->expects(self::once())->method('commit');
        $dependencies['connection']->expects(self::never())->method('rollBack');
    }

    /** @dataProvider roles */
    public function testBothDemoTypesStillCompleteInPersonal(string $role): void {
        [$service, $dependencies] = $this->fixture();
        $this->preparePersonalCreation($dependencies);
        $result = $service->createDemoContent('alice', $role);
        self::assertSame(10, $result['unitId']);
        self::assertSame(30, $result[$role === 'buildingMgmt' ? 'ownerId' : 'tenantId']);
        if ($role === 'buildingMgmt') self::assertSame(20, $result['propertyId']);
    }

    public function testInitialPersonalDemoStillCompletes(): void {
        [$service, $dependencies] = $this->fixture();
        $this->preparePersonalCreation($dependencies);
        $dependencies['config']->method('getUserValue')->willReturn('0');
        $dependencies['unitMapper']->method('findByUser')->willReturn([]);
        $dependencies['config']->expects(self::once())->method('setUserValue')
            ->with('alice', 'domus', 'initialDemoContentCreated', '1');
        $dependencies['logger']->expects(self::never())->method('warning');
        $service->createInitialDemoContentIfNeeded('alice');
    }
}

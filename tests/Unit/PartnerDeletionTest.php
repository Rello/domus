<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\{Partner, PartnerMapper, PartnerRel, PartnerRelMapper, Tenancy};
use OCA\Domus\Exception\ConflictException;
use OCA\Domus\Service\{PartnerService, TenancyService, PermissionService};
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class PartnerDeletionTest extends TestCase {
    private function fixture(array $types = ['tenancy'], string $partnerType = 'tenant'): array {
        $db = new TransferDatabase();
        $db->tables = ['partner' => [7], 'tenancy' => [12], 'relations' => $types];
        $partner = new Partner(); $partner->setId(7); $partner->setPartnerType($partnerType);
        $partners = $this->createMock(PartnerMapper::class);
        $partners->method('findForUser')->with(7, 'alice')->willReturn($partner);
        $relations = $this->createMock(PartnerRelMapper::class);
        $relations->method('findForPartner')->with(7, 'alice')->willReturnCallback(function () use ($db) {
            return array_map(function ($type) {
                $row = new PartnerRel(); $row->setType($type); $row->setRelationId(12); return $row;
            }, $db->tables['relations']);
        });
        $tenancies = $this->createMock(TenancyService::class);
        $tenancy = new Tenancy(); $tenancy->setId(12); $tenancy->setUnitLabel('Flat A'); $tenancy->setStartDate('2026-01-01');
        $tenancies->method('getTenancyForUser')->with(12, 'alice')->willReturn($tenancy);
        $l10n = $this->createMock(IL10N::class); $l10n->method('t')->willReturnArgument(0);
        $service = new PartnerService($partners, $relations, $tenancies, $this->createMock(PermissionService::class), $l10n, $db);
        return [$service, $partners, $tenancies, $db];
    }

    /** @dataProvider dependencies */
    public function testCascadeIsOfferedOnlyForASingleTenancy(array $types, string $partnerType, bool $allowed): void {
        [$service, $partners, $tenancies] = $this->fixture($types, $partnerType);
        $summary = $service->getDeletionSummary(7, 'alice');
        self::assertSame(count($types), $summary['relationCount']);
        self::assertSame($allowed ? 12 : null, $summary['tenancy']['id'] ?? null);
        $partners->expects(self::never())->method('delete');
        $tenancies->expects(self::never())->method('deleteTenancy');
        if ($types !== []) {
            $this->expectException(ConflictException::class);
            $service->deletePartner(7, 'alice');
        }
    }

    public static function dependencies(): array {
        return [[[], 'tenant', false], [['tenancy'], 'tenant', true], [['unit'], 'tenant', false],
            [['property'], 'tenant', false], [['tenancy', 'unit'], 'tenant', false],
            [['tenancy', 'tenancy'], 'tenant', false], [['tenancy'], 'owner', false]];
    }

    /** @dataProvider invalidRequests */
    public function testCascadeRevalidatesLinksAndConfirmedTenancy(array $types, int $requestedId): void {
        [$service, $partners, $tenancies, $db] = $this->fixture($types);
        $partners->expects(self::never())->method('delete');
        $tenancies->expects(self::never())->method('deleteTenancy');
        try {
            $service->deletePartner(7, 'alice', $requestedId);
            self::fail('Expected conflict');
        } catch (ConflictException $e) {
            self::assertSame(1, $db->rollbacks);
            self::assertSame(0, $db->commits);
        }
    }

    public static function invalidRequests(): array {
        return [[['tenancy', 'property'], 12], [['unit'], 12], [[], 12], [['tenancy'], 99]];
    }

    /** @dataProvider outcomes */
    public function testCombinedDeletionCommitsOrRollsBackTogether(string $outcome): void {
        [$service, $partners, $tenancies, $db] = $this->fixture();
        $before = $db->tables;
        $tenancies->expects(self::once())->method('deleteTenancy')->with(12, 'alice')
            ->willReturnCallback(function () use ($db, $outcome) {
                $db->tables['tenancy'] = [];
                $db->tables['relations'] = $outcome === 'new-link' ? ['unit'] : [];
                if ($outcome === 'tenancy-failure') throw new \RuntimeException('Failed tenancy delete');
                return [];
            });
        $partners->expects(in_array($outcome, ['success', 'partner-failure'], true) ? self::once() : self::never())->method('delete')
            ->willReturnCallback(function ($partner) use ($db, $outcome) {
                $db->tables['partner'] = [];
                if ($outcome === 'partner-failure') throw new \RuntimeException('Failed partner delete');
                return $partner;
            });
        try {
            $service->deletePartner(7, 'alice', 12);
            self::assertSame('success', $outcome);
            self::assertSame(['partner' => [], 'tenancy' => [], 'relations' => []], $db->tables);
            self::assertSame(1, $db->commits);
        } catch (\RuntimeException $e) {
            self::assertNotSame('success', $outcome);
            self::assertSame($before, $db->tables);
            self::assertSame(1, $db->rollbacks);
            self::assertSame(0, $db->commits);
        }
    }

    public static function outcomes(): array {
        return [['success'], ['tenancy-failure'], ['partner-failure'], ['new-link']];
    }
}

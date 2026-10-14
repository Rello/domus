<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Service\ManagementAccessContext;
use OCA\Domus\Service\PortfolioSettingsService;
use OCA\Domus\Tests\Support\TransferDatabase;
use OCP\IConfig;
use PHPUnit\Framework\TestCase;

class PortfolioSettingsServiceTest extends TestCase {
    public function testTeamTaxRateIsSharedAndUpdatingSameValueDoesNotInsertDuplicate(): void {
        $db = new TransferDatabase();
        $db->tables['domus_team_settings'] = [
            ['team_id' => 'team-a', 'setting_key' => 'taxRate', 'setting_value' => '0.19'],
        ];
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('activeTeamId')->willReturn('team-a');
        $config = $this->createMock(IConfig::class);
        $config->expects(self::never())->method('setUserValue');
        $settings = new PortfolioSettingsService($access, $config, $db);

        self::assertSame('0.19', $settings->getValue('alice', 'taxRate', '0'));
        $settings->setValue('bob', 'taxRate', '0.19');
        self::assertCount(1, $db->tables['domus_team_settings']);
        $settings->setValue('bob', 'taxRate', '0.20');
        self::assertSame('0.20', $settings->getValue('alice', 'taxRate', '0'));
        self::assertCount(1, $db->tables['domus_team_settings']);
    }
    public function testRequestCacheSeparatesTeamsAndDefaultsAndTracksWrites(): void {
        $db = new TransferDatabase();
        $db->tables['domus_team_settings'] = [
            ['team_id' => 'a', 'setting_key' => 'taxRate', 'setting_value' => '0.19'],
        ];
        $team = 'a';
        $access = $this->createMock(ManagementAccessContext::class);
        $access->method('activeTeamId')->willReturnCallback(static function () use (&$team) {
            if ($team === 'revoked') throw new \DomainException('Revoked');
            return $team;
        });
        $config = $this->createMock(IConfig::class);
        $config->method('getUserValue')->with('alice', 'domus', 'taxRate', '0')->willReturn('0.3');
        $settings = new PortfolioSettingsService($access, $config, $db);
        for ($i = 0; $i < 20; $i++) self::assertSame('0.19', $settings->getValue('alice', 'taxRate', '0'));
        self::assertSame(1, $db->reads['domus_team_settings']);
        $team = 'b';
        self::assertSame('0', $settings->getValue('alice', 'taxRate', '0'));
        self::assertSame('0.1', $settings->getValue('alice', 'taxRate', '0.1'));
        self::assertSame(2, $db->reads['domus_team_settings']);
        $settings->setValue('alice', 'taxRate', '0.2');
        self::assertSame('0.2', $settings->getValue('alice', 'taxRate', '0'));
        $team = 'a';
        self::assertSame('0.19', $settings->getValue('alice', 'taxRate', '0'));
        $settings->setValue('alice', 'taxRate', '0.25');
        self::assertSame('0.25', $settings->getValue('alice', 'taxRate', '0'));
        self::assertSame(2, $db->reads['domus_team_settings']);
        $team = null;
        self::assertSame('0.3', $settings->getValue('alice', 'taxRate', '0'));
        $team = 'revoked';
        $this->expectException(\DomainException::class);
        $settings->getValue('alice', 'taxRate', '0');
    }

}

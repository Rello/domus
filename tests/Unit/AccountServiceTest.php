<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Db\Account;
use OCA\Domus\Db\AccountMapper;
use OCA\Domus\Db\BookingMapper;
use OCA\Domus\Exception\ConflictException;
use OCA\Domus\Service\AccountService;
use OCP\IL10N;
use PHPUnit\Framework\TestCase;

class AccountServiceTest extends TestCase {
    public function testSystemAccountRejectsEveryMutation(): void {
        foreach (['update', 'enable', 'disable', 'delete'] as $operation) {
            $account = new Account();
            $account->setId(1);
            $account->setIsSystem(1);
            $account->setNumber('2000');
            $mapper = $this->createMock(AccountMapper::class);
            $mapper->method('findById')->with(1)->willReturn($account);
            $mapper->expects(self::never())->method('update');
            $mapper->expects(self::never())->method('delete');
            $l10n = $this->createMock(IL10N::class);
            $l10n->method('t')->willReturnArgument(0);
            $service = new AccountService($mapper, $this->createMock(BookingMapper::class), $l10n);
            try {
                match ($operation) {
                    'update' => $service->updateAccount(1, ['number' => '9999', 'labelEn' => 'Changed', 'parentId' => 2, 'sortOrder' => 99]),
                    'enable' => $service->setStatus(1, 'active', 'owner'),
                    'disable' => $service->setStatus(1, 'disabled', 'owner'),
                    'delete' => $service->deleteAccount(1, 'owner'),
                };
                self::fail('System account mutation was allowed: ' . $operation);
            } catch (ConflictException $exception) {
                self::assertSame('System accounts cannot be modified.', $exception->getMessage());
                self::assertSame('2000', $account->getNumber());
            }
        }
    }

    public function testCustomAccountNumberCannotChange(): void {
        foreach (['2512', '', '02511'] as $number) {
            $account = new Account();
            $account->setId(2);
            $account->setIsSystem(0);
            $account->setNumber('2511');
            $account->setLabelEn('Loan interest');
            $account->setParentId(1);
            $mapper = $this->createMock(AccountMapper::class);
            $mapper->method('findById')->with(2)->willReturn($account);
            $mapper->expects(self::never())->method('update');
            $l10n = $this->createMock(IL10N::class);
            $l10n->method('t')->willReturnArgument(0);
            $service = new AccountService($mapper, $this->createMock(BookingMapper::class), $l10n);

            try {
                $service->updateAccount(2, ['number' => $number, 'labelEn' => 'Changed', 'parentId' => 3]);
                self::fail('Account renumbering was allowed.');
            } catch (ConflictException $exception) {
                self::assertSame('Account numbers cannot be changed. Create a new account and reassign bookings before deleting the old account.', $exception->getMessage());
                self::assertSame('2511', $account->getNumber());
                self::assertSame('Loan interest', $account->getLabelEn());
                self::assertSame(1, $account->getParentId());
            }
        }
    }

    public function testUnchangedAccountNumberAllowsLabelEdits(): void {
        $account = new Account();
        $account->setId(2);
        $account->setIsSystem(0);
        $account->setNumber('2511');
        $account->setLabelDe('Zinsen');
        $account->setLabelEn('Interest');
        $mapper = $this->createMock(AccountMapper::class);
        $mapper->method('findById')->with(2)->willReturn($account);
        $mapper->expects(self::once())->method('update')->with($account)->willReturn($account);
        $service = new AccountService($mapper, $this->createMock(BookingMapper::class), $this->createMock(IL10N::class));

        $updated = $service->updateAccount(2, ['number' => '2511', 'labelEn' => 'Loan interest']);

        self::assertSame('2511', $updated->getNumber());
        self::assertSame('Loan interest', $updated->getLabelEn());
    }

    public function testAccountCannotBeDeletedUntilBookingsAreReassigned(): void {
        $account = new Account();
        $account->setId(2);
        $account->setIsSystem(0);
        $account->setNumber('2511');
        $mapper = $this->createMock(AccountMapper::class);
        $mapper->method('findById')->with(2)->willReturn($account);
        $mapper->expects(self::never())->method('delete');
        $bookingMapper = $this->createMock(BookingMapper::class);
        $bookingMapper->method('countByAccount')->with('owner', '2511')->willReturn(1);
        $l10n = $this->createMock(IL10N::class);
        $l10n->method('t')->willReturnArgument(0);
        $service = new AccountService($mapper, $bookingMapper, $l10n);

        $this->expectException(ConflictException::class);
        $service->deleteAccount(2, 'owner');
    }

    public function testCustomAccountRemainsEditable(): void {
        $account = new Account();
        $account->setId(2);
        $account->setIsSystem(0);
        $account->setLabelDe('Alt');
        $account->setLabelEn('Old');
        $mapper = $this->createMock(AccountMapper::class);
        $mapper->method('findById')->with(2)->willReturn($account);
        $mapper->expects(self::once())->method('update')->with($account)->willReturn($account);
        $service = new AccountService($mapper, $this->createMock(BookingMapper::class), $this->createMock(IL10N::class));
        $updated = $service->updateAccount(2, ['labelDe' => 'Neu', 'labelEn' => 'New', 'sortOrder' => 5]);
        self::assertSame('New', $updated->getLabelEn());
        self::assertSame(5, $updated->getSortOrder());
    }
}

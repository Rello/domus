<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Run only against a disposable MariaDB container populated from a pre-upgrade dump.
// Nextcloud is bootstrapped for its real DBAL/query builder; its own connection is never used here.
define('OC_CONSOLE', true);
require '/var/www/html/lib/base.php';
set_exception_handler(static function (Throwable $error): void {
    fwrite(STDERR, (string)$error . "\n");
    exit(1);
});
require_once dirname(__DIR__) . '/lib/Migration/Version1003Date20261112000000.php';
$db = OCP\Server::get(OC\DB\ConnectionFactory::class)->getConnection('mysql', [
    'host' => 'domus-upgrade-rehearsal-db', 'port' => 3306,
    'dbname' => 'domus_rehearsal', 'user' => 'root', 'password' => '',
    'tablePrefix' => 'oc_', 'unix_socket' => null,
]);
$assert = static function (bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
};
$assert($db->executeQuery('SELECT DATABASE()')->fetchOne() === 'domus_rehearsal', 'Wrong rehearsal database');
$output = new class implements OCP\Migration\IOutput {
    public function debug(string $message): void {}
    public function info($message) {}
    public function warning($message) {}
    public function startProgress($max = 0) {}
    public function advance($step = 1, $description = '') {}
    public function finishProgress() {}
};
$tables = $db->executeQuery("SHOW TABLES LIKE 'oc_domus_%'")->fetchFirstColumn();
$snapshot = static function () use ($db, $tables): array {
    $result = [];
    foreach ($tables as $table) {
        $result[$table] = $db->executeQuery('SELECT * FROM ' . $db->quoteIdentifier($table))->fetchAllAssociative();
        usort($result[$table], static fn ($a, $b) => ($a['id'] ?? json_encode($a)) <=> ($b['id'] ?? json_encode($b)));
    }
    return $result;
};
$original = $snapshot();
$original2700 = array_values(array_filter($original['oc_domus_bookings'], static fn ($row) => (int)$row['account'] === 2700));
$assert(count($original2700) > 0, 'Pre-upgrade copy must contain real 2700 bookings');
$insert = static function (string $table, array $row) use ($db): int {
    unset($row['id']);
    $query = $db->getQueryBuilder();
    $values = [];
    foreach ($row as $key => $value) $values[$key] = $query->createNamedParameter($value);
    $query->insert($table)->values($values)->executeStatement();
    return (int)$query->getLastInsertId();
};

// Supplement the copied Personal records with Team, negative/zero and allocated postings.
$source = $original2700[0];
$parentId = $insert('domus_bookings', array_replace($source, ['team_id' => 'rehearsal:a', 'unit_id' => null, 'amount' => '125.50', 'description' => 'Rehearsal property posting']));
$childId = $insert('domus_bookings', array_replace($source, ['team_id' => 'rehearsal:a', 'source_property_booking_id' => $parentId, 'amount' => '125.50', 'description' => 'Rehearsal allocation']));
$insert('domus_bookings', array_replace($source, ['team_id' => 'rehearsal:b', 'amount' => '-25.50']));
$insert('domus_bookings', array_replace($source, ['team_id' => 'rehearsal:b', 'amount' => '0.00']));
$account = array_values(array_filter($original['oc_domus_accounts'], static fn ($row) => $row['number'] === '2700'))[0];
$teamAccountId = $insert('domus_accounts', array_replace($account, ['team_id' => 'rehearsal:a', 'scope_key' => 'team:rehearsal:a', 'is_system' => 0]));
$customAccountId = $insert('domus_accounts', array_replace($account, ['number' => '2701', 'parent_id' => $teamAccountId, 'team_id' => 'rehearsal:a', 'scope_key' => 'team:rehearsal:a', 'is_system' => 0]));
$insert('domus_bookings', array_replace($source, ['account' => 2701, 'team_id' => 'rehearsal:a', 'amount' => '19.99']));
$insert('domus_docLinks', ['user_id' => 'rehearsal', 'entity_type' => 'booking', 'entity_id' => $childId, 'file_id' => 12345, 'file_name' => 'rehearsal.pdf', 'created_at' => time(), 'team_id' => 'rehearsal:a']);
$insert('domus_action_logs', ['user_id' => 'rehearsal', 'entity_type' => 'booking', 'entity_id' => $parentId, 'type' => 'note', 'title' => 'Rehearsal activity', 'source' => 'manual', 'linked_entity_type' => 'booking', 'linked_entity_id' => $childId, 'created_by' => 'rehearsal', 'created_at' => time(), 'updated_at' => time(), 'team_id' => 'rehearsal:a']);
$before = $snapshot();
$migration = new OCA\Domus\Migration\Version1003Date20261112000000(new OC\DB\ConnectionAdapter($db), OCP\Server::get(OCP\IUserManager::class), OCP\Server::get(OCP\IGroupManager::class));

// A late failure must roll back both the remapping and the 2200 cleanup.
$db->executeStatement("CREATE TRIGGER rehearsal_account_failure BEFORE DELETE ON oc_domus_accounts FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Expected rehearsal failure'");
$failed = false;
try {
    $migration->postSchemaChange($output, static fn () => null, []);
} catch (Throwable $error) {
    $assert(str_contains($error->getMessage(), 'Expected rehearsal failure'), 'Unexpected failure in rollback rehearsal');
    $failed = true;
} finally {
    $db->executeStatement('DROP TRIGGER rehearsal_account_failure');
}
$assert($failed && $before === $snapshot(), 'Failed upgrade did not roll back every table');
echo "PASS late-failure rollback: all copied tables unchanged\n";

// Use Nextcloud's migration runner, including version recording and pending-step selection.
// Override only construction so the data step cannot resolve the installation's own DB service.
$runner = new class('domus', $db, $output) extends OC\DB\MigrationService {
    public OCA\Domus\Migration\Version1003Date20261112000000 $dataMigration;
    public function createInstance($version): OCP\Migration\IMigrationStep {
        return match ($version) {
            '1003Date20261112000000' => $this->dataMigration,
            default => throw new RuntimeException('Unexpected pending migration: ' . $version),
        };
    }
};
$runner->dataMigration = $migration;
$assert(!in_array('1003Date20261112000000', $runner->getMigratedVersions(), true), 'Restore the pre-upgrade snapshot before rehearsing');
$runner->migrate();
$assert(in_array('1003Date20261112000000', $runner->getMigratedVersions(), true), 'Migration version was not recorded');
echo "PASS Nextcloud migration runner: pending schema/data steps executed and recorded\n";
$after = $snapshot();
$afterBookings = array_column($after['oc_domus_bookings'], null, 'id');
$removed2200 = array_map(static fn ($row) => (int)$row['id'], array_filter($before['oc_domus_bookings'], static fn ($row) => (int)$row['account'] === 2200));
$moved = 0;
$cents = static fn ($row): int => (int)round((float)$row['amount'] * 100);
$expected2300 = 0;
foreach ($before['oc_domus_bookings'] as $booking) {
    $id = $booking['id'];
    if ((int)$booking['account'] === 2200) {
        $assert(!isset($afterBookings[$id]), '2200 cleanup did not run');
        continue;
    }
    if (in_array((int)$booking['account'], [2300, 2700], true)) $expected2300 += $cents($booking);
    if ((int)$booking['account'] === 2700) { $booking['account'] = 2300; $moved++; }
    if (in_array((int)($booking['source_property_booking_id'] ?? 0), $removed2200, true)) $booking['source_property_booking_id'] = null;
    $assert(isset($afterBookings[$id]) && $afterBookings[$id] === $booking, 'Booking content/ID/allocation changed unexpectedly: ' . $id);
}
$assert(count($afterBookings) === count($before['oc_domus_bookings']) - count($removed2200), 'Unexpected booking loss or duplication');
$actual2300 = array_sum(array_map($cents, array_filter($afterBookings, static fn ($row) => (int)$row['account'] === 2300)));
$assert($actual2300 === $expected2300, '2300 amounts do not reconcile');
$assert(!array_filter($afterBookings, static fn ($row) => (int)$row['account'] === 2700), '2700 bookings remain');
foreach (['oc_domus_docLinks', 'oc_domus_action_logs'] as $table) {
    $expected = array_values(array_filter($before[$table], static fn ($row) =>
        !(($row['entity_type'] === 'booking' && in_array((int)$row['entity_id'], $removed2200, true)) ||
          (($row['linked_entity_type'] ?? null) === 'booking' && in_array((int)$row['linked_entity_id'], $removed2200, true)))));
    $assert($after[$table] === $expected, 'Document/activity links changed unexpectedly');
}
$removedAccounts = array_column(array_filter($before['oc_domus_accounts'], static fn ($row) => in_array($row['number'], ['2200', '2700'], true)), 'id');
$expectedAccounts = [];
foreach ($before['oc_domus_accounts'] as $account) {
    if (in_array($account['number'], ['2200', '2700'], true)) continue;
    if (in_array($account['parent_id'], $removedAccounts, true)) $account['parent_id'] = null;
    $expectedAccounts[] = $account;
}
$assert($after['oc_domus_accounts'] === $expectedAccounts, 'Account cleanup changed unrelated definitions');
foreach ($tables as $table) {
    if (in_array($table, ['oc_domus_bookings', 'oc_domus_accounts', 'oc_domus_docLinks', 'oc_domus_action_logs', 'oc_domus_units'], true)) continue;
    $assert($before[$table] === $after[$table], 'Unrelated table changed: ' . $table);
}
foreach ($before['oc_domus_units'] as $index => $unit) {
    $updatedUnit = $after['oc_domus_units'][$index];
    unset($updatedUnit['additional_notes']);
    unset($unit['additional_notes']);
    $assert($unit === $updatedUnit, 'Schema upgrade changed unit data');
}
echo 'PASS upgrade: ' . count($original2700) . ' copied 2700 bookings + ' . ($moved - count($original2700)) . " synthetic postings moved in place\n";
echo 'PASS amount reconciliation: 2300 total ' . number_format($actual2300 / 100, 2, '.', '') . "; booking IDs, amounts, documents, activities and allocations preserved\n";
echo "PASS removed account 2700 in all scopes; custom children retained; unrelated tables preserved\n";
$runner->migrate();
$assert($after === $snapshot(), 'Migration runner retry changed data');
$migration->postSchemaChange($output, static fn () => null, []);
$assert($after === $snapshot(), 'Forced data-step retry changed data');
echo "PASS completed-upgrade retry: no data changes\n";

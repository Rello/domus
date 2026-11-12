<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Uses Nextcloud's real schema classes without bootstrapping or connecting to Nextcloud.
// All SQL executes against an isolated in-memory SQLite database.
// Only the database/user service interfaces are stubbed; schema and SQL use real DBAL.
require __DIR__ . '/Stubs/OCP/IDBConnection.php';
require __DIR__ . '/Stubs/OCP/IUserManager.php';
require __DIR__ . '/Stubs/OCP/IGroupManager.php';
require __DIR__ . '/Support/LegacyCatalogueFixture.php';
require __DIR__ . '/Support/SqliteMigrationDatabase.php';
$nextcloudRoot = $argv[1] ?? '/var/www/html';
require $nextcloudRoot . '/3rdparty/autoload.php';
spl_autoload_register(static function (string $class) use ($nextcloudRoot): void {
    foreach (['OC\\' => $nextcloudRoot . '/lib/private/', 'OCP\\' => $nextcloudRoot . '/lib/public/',
        'OCA\\Domus\\' => dirname(__DIR__) . '/lib/'] as $prefix => $directory) {
        if (str_starts_with($class, $prefix)) {
            $file = $directory . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($file)) require_once $file;
            return;
        }
    }
});

// SchemaWrapper needs only the prefix; no application connection is initialized.
$schemaConnection = new class extends \OC\DB\Connection {
    public function __construct() {}
    public function getPrefix(): string { return ''; }
};
$output = new class implements \OCP\Migration\IOutput {
    public function debug(string $message): void {}
    public function info($message) {}
    public function warning($message) {}
    public function startProgress($max = 0) {}
    public function advance($step = 1, $description = '') {}
    public function finishProgress() {}
};
$platform = new \Doctrine\DBAL\Platforms\SqlitePlatform();
$comparator = new \Doctrine\DBAL\Schema\Comparator();
$schema = new \Doctrine\DBAL\Schema\Schema();
$apply = static function (string $class, \Doctrine\DBAL\Schema\Schema $schema) use ($schemaConnection, $output): void {
    $wrapper = new \OC\DB\SchemaWrapper($schemaConnection, $schema);
    (new \ReflectionClass($class))->newInstanceWithoutConstructor()->changeSchema($output, static fn () => $wrapper, []);
};
$historical = glob(dirname(__DIR__) . '/lib/Migration/Version000[1-5]*.php');
sort($historical);
foreach ($historical as $file) {
    $apply('OCA\\Domus\\Migration\\' . basename($file, '.php'), $schema);
}
$baseline = clone $schema;
$migration = \OCA\Domus\Migration\Version1003Date20261112000000::class;
$apply($migration, $schema);
$final = clone $schema;
$assert = static function (bool $condition, string $message): void {
    if (!$condition) throw new \RuntimeException($message);
};
$assert(count($schema->getTables()) === count($baseline->getTables()) + 1, 'Only the unit move table should be added');
foreach (['domus_docLinks' => 'document_date', 'domus_units' => 'document_folder_id',
    'domus_task_templates' => 'system_template_id', 'domus_task_steps' => 'default_due_days_offset'] as $table => $column) {
    $assert($schema->getTable($table)->hasColumn($column), "Missing $table.$column");
}
$assert($schema->getTable('domus_task_templates')->hasIndex('domus_tpl_scope_system'), 'Missing template scope index');
$assert($schema->getTable('domus_unit_moves')->hasIndex('domus_move_unit'), 'Missing move uniqueness');

foreach (['fresh installation' => new \Doctrine\DBAL\Schema\Schema(), '1.2 upgrade' => $baseline] as $label => $startingSchema) {
    $db = new \PDO('sqlite::memory:');
    $db->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
    foreach ($startingSchema->toSql($platform) as $sql) $db->exec($sql);
    $rows = [];
    foreach ($startingSchema->getTables() as $table) {
        $values = [];
        foreach ($table->getColumns() as $column) {
            if (!$column->getNotnull() || $column->getDefault() !== null) continue;
            $values[$column->getName()] = in_array($column->getType()->getName(), ['integer', 'bigint', 'smallint'], true) ? 1 : 'fixture';
        }
        $quoted = array_map([$platform, 'quoteIdentifier'], array_keys($values));
        $name = $platform->quoteIdentifier($table->getName());
        $db->prepare('INSERT INTO ' . $name . ' (' . implode(',', $quoted) . ') VALUES (' . implode(',', array_fill(0, count($values), '?')) . ')')->execute(array_values($values));
        $rows[$table->getName()] = $db->query('SELECT * FROM ' . $name)->fetchAll(\PDO::FETCH_ASSOC);
    }
    foreach ($platform->getAlterSchemaSQL($comparator->compareSchemas($startingSchema, $final)) as $sql) $db->exec($sql);
    foreach ($rows as $name => $before) {
        $columns = implode(',', array_map([$platform, 'quoteIdentifier'], array_keys($before[0])));
        $after = $db->query('SELECT ' . $columns . ' FROM ' . $platform->quoteIdentifier($name))->fetchAll(\PDO::FETCH_ASSOC);
        $assert($before === $after, 'Existing data changed in ' . $name);
    }
    echo "PASS $label: final schema applied; existing rows preserved\n";
}
$apply($migration, $schema);
$assert($platform->getAlterSchemaSQL($comparator->compareSchemas($final, $schema)) === [], 'Retry must not change the schema');
echo "PASS completed beta schema and retry: no schema changes\n";
// A beta.2 installation has document_date but none of the later additions.
$partial = clone $baseline;
$partial->getTable('domus_docLinks')->addColumn('document_date', 'string', ['length' => 10, 'notnull' => false]);
$apply($migration, $partial);
$assert($platform->getAlterSchemaSQL($comparator->compareSchemas($final, $partial)) === [], 'Partial beta upgrade differs from final schema');
echo "PASS partial beta upgrade: same final schema\n";

$users = new class implements \OCP\IUserManager {
    public function get($uid) { return $uid === 'deleted' ? null : new \stdClass(); }
    public function getByEmail($email) { return []; }
    public function callForSeenUsers(\Closure $callback) {}
};
$groups = new class implements \OCP\IGroupManager {
    public function isInGroup($userId, $group) { return $userId === 'guest'; }
    public function isAdmin($userId) { return false; }
    public function getUserGroupIds(\OCP\IUser $user): array { return []; }
};
$beta6 = clone $baseline;
$beta6->getTable('domus_docLinks')->addColumn('document_date', 'string', ['length' => 10, 'notnull' => false]);
foreach (['1.2' => $baseline, 'beta.6' => $beta6] as $version => $oldSchema) {
    $connection = \Doctrine\DBAL\DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
    foreach ($oldSchema->toSql($platform) as $sql) $connection->executeStatement($sql);
    foreach (\OCA\Domus\Tests\Support\LegacyCatalogueFixture::tables() as $table => $rows) {
        foreach ($rows as $row) {
            $quoted = [];
            foreach ($row as $column => $value) $quoted[$connection->quoteIdentifier($column)] = $value;
            $connection->insert($table, $quoted);
        }
    }
    $upgrade = clone $oldSchema;
    $apply($migration, $upgrade);
    foreach ($platform->getAlterSchemaSQL($comparator->compareSchemas($oldSchema, $upgrade)) as $sql) $connection->executeStatement($sql);
    $dataMigration = new $migration(new \OCA\Domus\Tests\Support\SqliteMigrationDatabase($connection), $users, $groups);
    $dataMigration->postSchemaChange($output, static fn () => null, []);
    foreach (['alice', 'bob'] as $uid) {
        $accounts = $connection->fetchAllAssociative('SELECT * FROM domus_accounts WHERE scope_key = ?', ['user:' . $uid]);
        $assert(count($accounts) === 2, "$version: missing Personal accounts");
        $byNumber = array_column($accounts, null, 'number');
        $assert($byNumber[2991]['parent_id'] === $byNumber[2990]['id'], "$version: wrong custom parent");
        $assert($byNumber[2990]['parent_id'] === 1, "$version: wrong shared parent");
        $templates = $connection->fetchAllAssociative('SELECT * FROM domus_task_templates WHERE scope_key = ?', ['user:' . $uid]);
        $assert(count($templates) === 3, "$version: missing custom templates");
        foreach ($templates as $template) {
            $steps = $connection->fetchAllAssociative('SELECT * FROM domus_task_tpl_steps WHERE template_id = ?', [$template['id']]);
            $assert(count($steps) === 1 && $steps[0]['default_due_days_offset'] === -3
                && $steps[0]['action_url'] === 'https://example.com/custom' && $steps[0]['allow_early_completion'] === 1,
                "$version: lost customized step");
            if ($template['key'] === 'year_end') $assert($template['is_active'] === 0 && $template['system_template_id'] !== null, "$version: disabled default lost");
        }
    }
    $snapshot = static function () use ($connection, $final): array {
        $tables = [];
        foreach ($final->getTables() as $table) $tables[$table->getName()] = $connection->fetchAllAssociative('SELECT * FROM ' . $connection->quoteIdentifier($table->getName()));
        return $tables;
    };
    $once = $snapshot();
    $assert($once['domus_task_steps'][0]['default_due_days_offset'] === -3, "$version: historical timing lost");
    $assert($once['domus_task_steps'][0]['due_date'] === '2026-11-01', "$version: existing deadline changed");
    $assert($once['domus_workflow_runs'][0]['template_id'] === 1, "$version: historical reference changed");
    $dataMigration->postSchemaChange($output, static fn () => null, []);
    $assert($snapshot() === $once, "$version: retry changed data");
    echo "PASS $version SQL schema + data upgrade: custom accounts, hierarchies, templates, steps, history and retries\n";
}


foreach (['fresh' => $final, 'upgrade' => $baseline] as $label => $yearSchema) {
    $yearSchema = clone $yearSchema;
    $db = new \PDO('sqlite::memory:');
    foreach ($yearSchema->toSql($platform) as $sql) $db->exec($sql);
    $db->exec("INSERT INTO domus_units (user_id, label, created_at, updated_at) VALUES ('year-test', 'Existing', 1, 1)");
    $beforeYear = clone $yearSchema;
    $apply(\OCA\Domus\Migration\Version1003Date20261112000000::class, $yearSchema);
    foreach ($comparator->compareSchemas($beforeYear, $yearSchema)->toSaveSql($platform) as $sql) $db->exec($sql);
    $assert($db->query('SELECT construction_year FROM domus_units')->fetchColumn() === null, "$label: existing year stays empty");
    $db->exec('UPDATE domus_units SET construction_year = 1984');
    $assert((int)$db->query('SELECT construction_year FROM domus_units')->fetchColumn() === 1984, "$label: year persists");
    $beforeRetry = clone $yearSchema;
    $apply(\OCA\Domus\Migration\Version1003Date20261112000000::class, $yearSchema);
    $assert($comparator->compareSchemas($beforeRetry, $yearSchema)->toSaveSql($platform) === [], "$label: year migration is retry-safe");
}
echo "Construction year migration passed.\n";

foreach (['fresh' => $final, 'upgrade' => $baseline] as $label => $notesSchema) {
    $notesSchema = clone $notesSchema;
    $db = new \PDO('sqlite::memory:');
    foreach ($notesSchema->toSql($platform) as $sql) $db->exec($sql);
    $db->exec("INSERT INTO domus_units (user_id, label, notes, created_at, updated_at) VALUES ('notes-test', 'Existing', 'Description', 1, 1)");
    $beforeNotes = clone $notesSchema;
    $apply(\OCA\Domus\Migration\Version1003Date20261112000000::class, $notesSchema);
    foreach ($comparator->compareSchemas($beforeNotes, $notesSchema)->toSaveSql($platform) as $sql) $db->exec($sql);
    $assert($db->query('SELECT additional_notes FROM domus_units')->fetchColumn() === null, "$label: new notes stay empty");
    $db->exec("UPDATE domus_units SET additional_notes = 'Meter 12345'");
    $assert($db->query('SELECT notes FROM domus_units')->fetchColumn() === 'Description', "$label: description preserved");
    $assert($db->query('SELECT additional_notes FROM domus_units')->fetchColumn() === 'Meter 12345', "$label: notes persist");
    $beforeRetry = clone $notesSchema;
    $apply(\OCA\Domus\Migration\Version1003Date20261112000000::class, $notesSchema);
    $assert($comparator->compareSchemas($beforeRetry, $notesSchema)->toSaveSql($platform) === [], "$label: notes migration is retry-safe");
}
echo "Unit notes migration passed.\n";

// Exercise the complete data step, including failures after account conversion.
foreach (['fresh' => false, '1.2 populated' => true] as $label => $populated) {
    $connection = \Doctrine\DBAL\DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
    foreach ($final->toSql($platform) as $sql) $connection->executeStatement($sql);
    $adapter = new \OCA\Domus\Tests\Support\SqliteMigrationDatabase($connection);
    $dataMigration = new $migration($adapter, $users, $groups);
    if ($populated) {
        foreach (\OCA\Domus\Tests\Support\LegacyCatalogueFixture::tables() as $table => $rows) {
            foreach ($rows as $row) {
                $quoted = [];
                foreach ($row as $column => $value) $quoted[$connection->quoteIdentifier($column)] = $value;
                $connection->insert($table, $quoted);
            }
        }
        $connection->executeStatement("INSERT INTO domus_accounts (id, number, label_en, label_de, is_system, created_at, updated_at) VALUES (20, '2700', 'Old costs', 'Alte Kosten', 1, 1, 1), (21, '2200', 'Old reserve', 'Alte Rücklage', 1, 1, 1)");
        $connection->executeStatement("INSERT INTO domus_bookings (id, user_id, account, date, amount, year, created_at, updated_at) VALUES (20, 'alice', 2700, '2025-12-31', 123.45, 2025, 1, 1), (21, 'alice', 2200, '2025-12-31', 50, 2025, 1, 1)");
        $connection->executeStatement("INSERT INTO domus_docLinks (id, user_id, entity_type, entity_id, file_id, file_name, created_at) VALUES (20, 'alice', 'booking', 20, 100, 'cost.pdf', 1), (21, 'alice', 'booking', 21, 101, 'reserve.pdf', 1)");
        $connection->executeStatement('UPDATE domus_bookings SET source_property_booking_id = 21 WHERE id = 20');
        $snapshot = static function () use ($connection, $final): array {
            $rows = [];
            foreach ($final->getTables() as $table) $rows[$table->getName()] = $connection->fetchAllAssociative('SELECT * FROM ' . $connection->quoteIdentifier($table->getName()));
            return $rows;
        };
        $before = $snapshot();
        // Fail after cleanup and catalogue creation, proving one transaction covers both.
        $connection->executeStatement("CREATE TRIGGER fail_schedule BEFORE UPDATE ON domus_task_steps BEGIN SELECT RAISE(ABORT, 'Expected migration failure'); END");
        $failed = false;
        try {
            $dataMigration->postSchemaChange($output, static fn () => null, []);
        } catch (\Throwable $error) {
            $assert(str_contains($error->getMessage(), 'Expected migration failure'), 'Unexpected rollback failure');
            $failed = true;
        }
        $assert($failed && $snapshot() === $before, 'Data migration did not fully roll back');
        $connection->executeStatement('DROP TRIGGER fail_schedule');
    }
    $dataMigration->postSchemaChange($output, static fn () => null, []);
    (new \OCA\Domus\Migration\FillDefaultAccountsRepairStep($adapter))->run($output);
    if ($populated) {
        $booking = $connection->fetchAssociative('SELECT * FROM domus_bookings WHERE id = 20');
        $assert((int)$booking['account'] === 2300 && (float)$booking['amount'] === 123.45 && $booking['source_property_booking_id'] === null, 'Conversion lost booking data or retained deleted source');
        $assert((int)$connection->fetchOne('SELECT COUNT(*) FROM domus_bookings WHERE id = 21') === 0, '2200 booking retained');
        $assert($connection->fetchFirstColumn('SELECT id FROM domus_docLinks') === [20], 'Document links not preserved/cleaned correctly');
        $assert((int)$connection->fetchOne("SELECT COUNT(*) FROM domus_accounts WHERE number IN ('2200', '2700')") === 0, 'Obsolete accounts retained');
        $once = $snapshot();
        $dataMigration->postSchemaChange($output, static fn () => null, []);
        $assert($snapshot() === $once, 'Combined migration retry changed data');
    } else {
        $assert((int)$connection->fetchOne('SELECT COUNT(*) FROM domus_accounts') === 11, 'Fresh install defaults missing');
        $assert((int)$connection->fetchOne("SELECT COUNT(*) FROM domus_task_templates WHERE scope_key = 'system'") === 2, 'Fresh system templates missing or duplicated');
        $assert((int)$connection->fetchOne('SELECT COUNT(*) FROM domus_task_tpl_steps') === 10, 'Fresh template steps missing or duplicated');
    }
    echo "PASS $label: complete data migration, default repair" . ($populated ? ", account conversion, cleanup, rollback and retry" : '') . "\n";
}

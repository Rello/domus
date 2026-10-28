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
$migration = \OCA\Domus\Migration\Version0008Date20261028000000::class;
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

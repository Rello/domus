<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Only the explicitly named disposable databases below receive writes.
$domusLoader = static function (string $class): void {
    $prefix = 'OCA\\Domus\\';
    if (str_starts_with($class, $prefix)) {
        $file = dirname(__DIR__) . '/lib/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
        if (is_file($file)) require_once $file;
    }
};
define('OC_CONSOLE', true);
require '/var/www/html/lib/base.php';
spl_autoload_register($domusLoader, true, true);
set_exception_handler(static function (Throwable $error): void {
    fwrite(STDERR, (string)$error . "\n");
    exit(1);
});
foreach (['Db/DocumentLinkMapper', 'Migration/Version1003Date20261112000000', 'Migration/Version1003Date20261116000000'] as $source) {
    $class = 'OCA\\Domus\\' . str_replace('/', '\\', $source);
    if ((new ReflectionClass($class))->getFileName() !== dirname(__DIR__) . '/lib/' . $source . '.php') {
        throw new RuntimeException('Fixture loaded app code from another checkout');
    }
}
$engine = $argv[1] ?? '';
if (!in_array($engine, ['mysql', 'pgsql', 'mysql-insensitive'], true)) {
    throw new RuntimeException('Choose mysql, pgsql or mysql-insensitive');
}
$postgres = $engine === 'pgsql';
$host = match ($engine) {
    'pgsql' => 'domus-case-postgres',
    'mysql' => 'domus-case-mariadb',
    'mysql-insensitive' => 'domus-case-mariadb-insensitive',
};
$factory = OCP\Server::get(OC\DB\ConnectionFactory::class);
$connect = static fn (string $prefix) => $factory->getConnection($postgres ? 'pgsql' : 'mysql', [
    'host' => $host, 'port' => $postgres ? 5432 : 3306, 'dbname' => 'domus_case_test',
    'user' => $postgres ? 'postgres' : 'root', 'password' => '', 'tablePrefix' => $prefix,
    'unix_socket' => null,
]);
$assert = static function (bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
};
$db = $connect('oc_');
$assert($db->executeQuery($postgres ? 'SELECT current_database()' : 'SELECT DATABASE()')->fetchOne() === 'domus_case_test', 'Wrong database');
$assert($db->createSchemaManager()->listTableNames() === [], 'Refusing a nonempty database; recreate the disposable container');
if (!$postgres) {
    $assert((int)$db->executeQuery('SELECT @@lower_case_table_names')->fetchOne() === ($engine === 'mysql' ? 0 : 1), 'Unexpected table-name case setting');
}
$tableNames = static fn (OC\DB\Connection $db): array => $db->executeQuery($postgres
    ? 'SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = current_schema()'
    : 'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()')->fetchFirstColumn();
$output = new class implements OCP\Migration\IOutput {
    public function debug(string $message): void {}
    public function info($message) {}
    public function warning($message) {}
    public function startProgress($max = 0) {}
    public function advance($step = 1, $description = '') {}
    public function finishProgress() {}
};
$historical = array_map(static fn (string $file): string => substr(basename($file, '.php'), 7), glob(dirname(__DIR__) . '/lib/Migration/Version000[1-5]*.php'));
sort($historical);
$version1003 = '1003Date20261112000000';
$versionNormalization = '1003Date20261116000000';
$step = static function (string $version, OC\DB\Connection $db): OCP\Migration\IMigrationStep {
    $adapter = new OC\DB\ConnectionAdapter($db);
    $class = 'OCA\\Domus\\Migration\\Version' . $version;
    if ($version === '1003Date20261112000000') {
        return new $class($adapter, OCP\Server::get(OCP\IUserManager::class), OCP\Server::get(OCP\IGroupManager::class));
    }
    return (new ReflectionClass($class))->getConstructor() ? new $class($adapter) : new $class();
};
$runnerFor = static function (OC\DB\Connection $db) use ($output, $step): OC\DB\MigrationService {
    $runner = new class('domus', $db, $output) extends OC\DB\MigrationService {
        public function __construct($app, $db, $output) {
            parent::__construct($app, $db, $output);
            $this->migrationsPath = dirname(__DIR__) . '/lib/Migration';
        }
        public Closure $makeStep;
        public OC\DB\Connection $fixtureDb;
        public function createInstance($version): OCP\Migration\IMigrationStep {
            return ($this->makeStep)($version, $this->fixtureDb);
        }
    };
    $runner->makeStep = $step;
    $runner->fixtureDb = $db;
    return $runner;
};
$cases = [
    ['fresh', 'lower', false],
    ['upgrade12', 'lower', false], ['upgrade12', 'legacy', false],
    ['partial1003', 'lower', false], ['partial1003', 'legacy', false],
    ['completed1003', 'lower', false], ['completed1003', 'legacy', false],
    ['upgrade12', 'temporary', false], ['completed1003', 'temporary', false],
];
if ($engine !== 'mysql-insensitive') {
    $cases[] = ['upgrade12', 'both', true];
    $cases[] = ['completed1003', 'both', true];
    $cases[] = ['completed1003', 'temporaryConflict', true];
}
foreach ($cases as $index => [$path, $spelling, $conflict]) {
    // Deliberately use non-default prefixes to test identifier handling.
    $prefix = 'oc_case' . $index . '_';
    $db = $connect($prefix);
    $quote = $db->getDatabasePlatform()->quoteIdentifier(...);
    $canonical = $prefix . 'domus_doclinks';
    $legacy = $prefix . 'domus_docLinks';
    $temporary = $prefix . 'domus_doclinks_case_tmp';
    $runner = $runnerFor($db);
    $cleanup = static function () use ($db, $prefix, $quote, $assert, $tableNames): void {
        foreach ($tableNames($db) as $name) {
            $assert(str_starts_with($name, $prefix), 'Unexpected table outside disposable fixture');
            $db->executeStatement('DROP TABLE ' . $quote($name));
        }
    };
    if ($path !== 'fresh') {
        $schema = new Doctrine\DBAL\Schema\Schema();
        $wrapper = new OC\DB\SchemaWrapper($db, $schema);
        $schemaVersions = $historical;
        if ($path !== 'upgrade12') $schemaVersions[] = $version1003;
        foreach ($schemaVersions as $version) {
            $step($version, $db)->changeSchema($output, static fn () => $wrapper, ['tablePrefix' => $prefix]);
        }
        foreach ($schema->toSql($db->getDatabasePlatform()) as $sql) $db->executeStatement($sql);
        $db->executeStatement('CREATE TABLE ' . $quote($prefix . 'migrations') . ' (app VARCHAR(255) NOT NULL, version VARCHAR(255) NOT NULL, PRIMARY KEY (app, version))');
        foreach ($historical as $version) $db->insert($prefix . 'migrations', ['app' => 'domus', 'version' => $version]);
        if ($path === 'completed1003') $db->insert($prefix . 'migrations', ['app' => 'domus', 'version' => $version1003]);
        $db->insert($canonical, ['user_id' => 'case-fixture', 'entity_type' => 'unit', 'entity_id' => 42, 'file_id' => 123, 'file_name' => 'keep.pdf', 'created_at' => 1]);
        // A legacy custom account forces personalOwners(), reproducing the reported SELECT.
        $db->insert($prefix . 'domus_accounts', ['number' => '2999', 'label_en' => 'Custom', 'label_de' => 'Custom', 'is_system' => 0, 'created_at' => 1, 'updated_at' => 1]);
        if (in_array($spelling, ['legacy', 'both'], true)) {
            $db->executeStatement('ALTER TABLE ' . $quote($canonical) . ' RENAME TO ' . $quote($temporary));
            $db->executeStatement('ALTER TABLE ' . $quote($temporary) . ' RENAME TO ' . $quote($legacy));
        } elseif ($spelling === 'temporary') {
            $db->executeStatement('ALTER TABLE ' . $quote($canonical) . ' RENAME TO ' . $quote($temporary));
        }
        if ($spelling === 'both') {
            $db->executeStatement('CREATE TABLE ' . $quote($canonical) . ' (id INTEGER NOT NULL)');
            $db->executeStatement('INSERT INTO ' . $quote($canonical) . ' VALUES (987)');
        } elseif ($spelling === 'temporaryConflict') {
            $db->executeStatement('CREATE TABLE ' . $quote($temporary) . ' (id INTEGER NOT NULL)');
            $db->executeStatement('INSERT INTO ' . $quote($temporary) . ' VALUES (987)');
        }
    }
    $namesBefore = $tableNames($db);
    try {
        $runner->migrate();
        $assert(!$conflict, 'Conflicting tables were accepted');
    } catch (Throwable $error) {
        if (!$conflict || !str_contains($error->getMessage(), 'Conflicting Domus document-link tables')) throw $error;
        $namesAfter = $tableNames($db);
        sort($namesBefore);
        sort($namesAfter);
        $assert($namesBefore === $namesAfter, 'Conflict changed table names: ' . json_encode([$namesBefore, $namesAfter]));
        $source = $spelling === 'both' ? $legacy : $canonical;
        $other = $spelling === 'both' ? $canonical : $temporary;
        $assert($db->executeQuery('SELECT file_name FROM ' . $quote($source))->fetchOne() === 'keep.pdf', 'Conflict changed original data');
        $assert((int)$db->executeQuery('SELECT id FROM ' . $quote($other))->fetchOne() === 987, 'Conflict changed other data');
        $assert(!in_array($path === 'upgrade12' ? $version1003 : $versionNormalization, $runner->getMigratedVersions(), true), 'Failed migration recorded as complete');
        echo "PASS $engine $path/$spelling: conflict rejected without changes\n";
        $cleanup();
        continue;
    }
    $names = $tableNames($db);
    $assert(in_array($canonical, $names, true) && !in_array($legacy, $names, true) && !in_array($temporary, $names, true), 'Wrong physical table name');
    $assert(in_array($versionNormalization, $runner->getMigratedVersions(), true), 'Normalization migration not recorded');
    $table = $db->createSchemaManager()->introspectTable($canonical);
    $assert($table->hasColumn('document_date') && $table->hasIndex('domus_doc_rel'), 'Schema/index not preserved');
    $adapter = new OC\DB\ConnectionAdapter($db);
    $mapper = new OCA\Domus\Db\DocumentLinkMapper($adapter);
    if ($path !== 'fresh') {
        $links = $mapper->findForEntity('case-fixture', 'unit', 42);
        $assert(count($links) === 1 && $links[0]->getFileName() === 'keep.pdf', 'Existing document link lost or unreadable');
    }
    $link = new OCA\Domus\Db\DocumentLink();
    $link->setUserId('case-fixture');
    $link->setEntityType('unit');
    $link->setEntityId(43);
    $link->setFileId(124);
    $link->setFileName('new.pdf');
    $link->setCreatedAt(2);
    $mapper->insert($link);
    $assert($link->getId() > ($path === 'fresh' ? 0 : 1), 'Auto-increment not preserved');
    $link->setFileName('updated.pdf');
    $mapper->update($link);
    $assert($mapper->findForEntity('case-fixture', 'unit', 43)[0]->getFileName() === 'updated.pdf', 'Document update failed');
    $mapper->delete($link);
    $assert($mapper->findForEntity('case-fixture', 'unit', 43) === [], 'Document delete failed');
    $beforeRetry = $db->executeQuery('SELECT * FROM ' . $quote($canonical))->fetchAll();
    // Explicitly replay both steps, as well as the normal already-recorded no-op.
    $runner->executeStep($version1003);
    $runner->executeStep($versionNormalization);
    $runner->migrate();
    $assert($beforeRetry === $db->executeQuery('SELECT * FROM ' . $quote($canonical))->fetchAll(), 'Retry changed document data');
    echo "PASS $engine $path/$spelling: migration runner, preserved data/index/identity, document CRUD, retries\n";
    $cleanup();
}
echo "PASS all $engine cases; installation database unchanged\n";

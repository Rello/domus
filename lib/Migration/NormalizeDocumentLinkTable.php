<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Migration;

use OCP\IDBConnection;

/** Shared by the pre-1003 and already-upgraded installation paths. */
class NormalizeDocumentLinkTable {
    public function __construct(private IDBConnection $db) {
    }

    public function run(string $prefix): void {
        // Do not use Schema::hasTable(): DBAL folds names and can hide two distinct tables.
        $sql = match ($this->db->getDatabaseProvider()) {
            'mysql' => 'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()',
            'postgres' => 'SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = current_schema()',
            'sqlite' => "SELECT name FROM sqlite_master WHERE type = 'table'",
            default => throw new \RuntimeException('Unsupported database for Domus document-link table normalization'),
        };
        $tables = $this->db->executeQuery($sql)->fetchFirstColumn();
        $legacy = $prefix . 'domus_docLinks';
        $canonical = $prefix . 'domus_doclinks';
        $temporary = $prefix . 'domus_doclinks_case_tmp';
        $present = array_values(array_filter([$legacy, $canonical, $temporary],
            static fn (string $name): bool => in_array($name, $tables, true)));
        if (count($present) > 1) {
            throw new \RuntimeException('Conflicting Domus document-link tables: ' . implode(', ', $present)
                . '. Resolve the duplicate tables before retrying; no tables were changed.');
        }
        if ($present === [] || $present[0] === $canonical) {
            return;
        }

        // A distinct intermediate name also works on case-insensitive databases.
        // If interrupted after this first rename, the next attempt resumes from it.
        if ($present[0] === $legacy) {
            $this->rename($legacy, $temporary);
        }
        $this->rename($temporary, $canonical);
    }

    private function rename(string $from, string $to): void {
        $platform = $this->db->getDatabasePlatform();
        $this->db->executeStatement('ALTER TABLE ' . $platform->quoteIdentifier($from)
            . ' RENAME TO ' . $platform->quoteIdentifier($to));
    }
}

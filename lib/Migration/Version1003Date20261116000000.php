<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Migration;

use Closure;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/** Normalize installations that already completed the original 1003 migration. */
class Version1003Date20261116000000 extends SimpleMigrationStep {
    public function __construct(private IDBConnection $db) {
    }

    public function preSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        (new NormalizeDocumentLinkTable($this->db))->run($options['tablePrefix'] ?? '');
    }
}

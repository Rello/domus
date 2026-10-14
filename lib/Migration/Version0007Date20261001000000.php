<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/** Replace the unreleased invitation prototype with the existing partner assignment. */
class Version0007Date20261001000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        $schema = $schemaClosure();
        if ($schema->hasTable('domus_renter_access')) {
            $schema->dropTable('domus_renter_access');
        }
        $partners = $schema->getTable('domus_partners');
        if (!$partners->hasIndex('domus_partner_ncuser')) {
            $partners->addIndex(['nc_user_id'], 'domus_partner_ncuser');
        }
        return $schema;
    }
}

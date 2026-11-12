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

/** Move other tax deductions to other costs, then remove obsolete accounts in every scope. */
class Version0011Date20261111000000 extends SimpleMigrationStep {
    public function __construct(private IDBConnection $connection) {
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        $this->connection->beginTransaction();
        try {
            // Change the account in place: IDs, allocation sources, documents and activity links stay intact.
            $update = $this->connection->getQueryBuilder();
            $update->update('domus_bookings')
                ->set('account', $update->createNamedParameter(2300, $update::PARAM_INT))
                ->where($update->expr()->eq('account', $update->createNamedParameter(2700, $update::PARAM_INT)))
                ->executeStatement();

            $query = $this->connection->getQueryBuilder();
            $query->select('id')->from('domus_bookings')
                ->where($query->expr()->in('account', $query->createNamedParameter([2200], $query::PARAM_INT_ARRAY)));
            $result = $query->executeQuery();
            $bookings = $result->fetchAll();
            $result->closeCursor();
            foreach ($bookings as $booking) {
                $id = (int)$booking['id'];
                $this->deleteLinks('domus_docLinks', 'entity_type', 'entity_id', $id);
                $this->deleteLinks('domus_action_logs', 'entity_type', 'entity_id', $id);
                $this->deleteLinks('domus_action_logs', 'linked_entity_type', 'linked_entity_id', $id);
                $update = $this->connection->getQueryBuilder();
                $update->update('domus_bookings')->set('source_property_booking_id', $update->createNamedParameter(null))
                    ->where($update->expr()->eq('source_property_booking_id', $update->createNamedParameter($id, $update::PARAM_INT)))
                    ->executeStatement();
            }
            $delete = $this->connection->getQueryBuilder();
            $delete->delete('domus_bookings')
                ->where($delete->expr()->in('account', $delete->createNamedParameter([2200], $delete::PARAM_INT_ARRAY)))
                ->executeStatement();

            $query = $this->connection->getQueryBuilder();
            $query->select('id')->from('domus_accounts')
                ->where($query->expr()->in('number', $query->createNamedParameter(['2200', '2700'], $query::PARAM_STR_ARRAY)));
            $result = $query->executeQuery();
            $accounts = $result->fetchAll();
            $result->closeCursor();
            // Retain custom child accounts and their bookings as independent accounts.
            foreach ($accounts as $account) {
                $update = $this->connection->getQueryBuilder();
                $update->update('domus_accounts')->set('parent_id', $update->createNamedParameter(null))
                    ->where($update->expr()->eq('parent_id', $update->createNamedParameter((int)$account['id'], $update::PARAM_INT)))
                    ->executeStatement();
            }
            $delete = $this->connection->getQueryBuilder();
            $delete->delete('domus_accounts')
                ->where($delete->expr()->in('number', $delete->createNamedParameter(['2200', '2700'], $delete::PARAM_STR_ARRAY)))
                ->executeStatement();
            $this->connection->commit();
        } catch (\Throwable $e) {
            $this->connection->rollBack();
            throw $e;
        }
    }

    private function deleteLinks(string $table, string $typeColumn, string $idColumn, int $id): void {
        $delete = $this->connection->getQueryBuilder();
        $delete->delete($table)
            ->where($delete->expr()->eq($typeColumn, $delete->createNamedParameter('booking')))
            ->andWhere($delete->expr()->eq($idColumn, $delete->createNamedParameter($id, $delete::PARAM_INT)))
            ->executeStatement();
    }
}

<?php

namespace OCA\Domus\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0003Date20251203000000 extends SimpleMigrationStep {
    public function __construct(private IDBConnection $connection) {
    }

    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('domus_properties')) {
            $table = $schema->getTable('domus_properties');
            if (!$table->hasColumn('document_path')) {
                $table->addColumn('document_path', 'string', ['notnull' => false, 'length' => 512]);
            }
        }

        if ($schema->hasTable('domus_units')) {
            $table = $schema->getTable('domus_units');
            if (!$table->hasColumn('document_path')) {
                $table->addColumn('document_path', 'string', ['notnull' => false, 'length' => 512]);
            }
        }

        return $schema;
    }

    public function postSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void {
        if ($this->connection->tableExists('domus_properties')) {
            $properties = $this->connection->getQueryBuilder();
            $properties->select('id', 'name', 'document_path')
                ->from('domus_properties');
            $results = $properties->executeQuery()->fetchAll();

            foreach ($results as $row) {
                $documentPath = $row['document_path'] ?? null;
                if ($documentPath !== null && trim($documentPath) !== '') {
                    continue;
                }
                $path = $this->buildPropertyPath((string)($row['name'] ?? ''));
                $update = $this->connection->getQueryBuilder();
                $update->update('domus_properties')
                    ->set('document_path', $update->createNamedParameter($path))
                    ->where($update->expr()->eq('id', $update->createNamedParameter((int)$row['id'], $update::PARAM_INT)))
                    ->executeStatement();
            }
        }

        if (!$this->connection->tableExists('domus_units')) {
            return;
        }

        $propertyLookup = [];
        if ($this->connection->tableExists('domus_properties')) {
            $propertyQuery = $this->connection->getQueryBuilder();
            $propertyQuery->select('id', 'name')
                ->from('domus_properties');
            $propertyRows = $propertyQuery->executeQuery()->fetchAll();
            foreach ($propertyRows as $row) {
                $propertyLookup[(int)$row['id']] = $row['name'] ?? '';
            }
        }

        $units = $this->connection->getQueryBuilder();
        $units->select('id', 'label', 'unit_number', 'property_id', 'document_path')
            ->from('domus_units');
        $unitRows = $units->executeQuery()->fetchAll();

        foreach ($unitRows as $row) {
            $documentPath = $row['document_path'] ?? null;
            if ($documentPath !== null && trim($documentPath) !== '') {
                continue;
            }
            $propertyName = null;
            $propertyId = $row['property_id'] ?? null;
            if ($propertyId !== null) {
                $propertyName = $propertyLookup[(int)$propertyId] ?? null;
            }
            $path = $this->buildUnitPath((string)($row['label'] ?? ''), (string)($row['unit_number'] ?? ''), $propertyName);
            $update = $this->connection->getQueryBuilder();
            $update->update('domus_units')
                ->set('document_path', $update->createNamedParameter($path))
                ->where($update->expr()->eq('id', $update->createNamedParameter((int)$row['id'], $update::PARAM_INT)))
                ->executeStatement();
        }
    }

    private function buildPropertyPath(string $propertyName): string {
        $segment = $this->sanitizeSegment($propertyName);
        if ($segment === '') {
            $segment = 'Property';
        }
        return implode('/', ['DomusApp', $segment]);
    }

    private function buildUnitPath(string $label, string $unitNumber, ?string $propertyName): string {
        $unitSegment = $this->resolveUnitSegment($label, $unitNumber);
        $segments = ['DomusApp'];
        $propertySegment = $propertyName ? $this->sanitizeSegment($propertyName) : '';
        if ($propertySegment !== '') {
            $segments[] = $propertySegment;
        }
        $segments[] = $unitSegment;

        return implode('/', $segments);
    }

    private function resolveUnitSegment(string $label, string $unitNumber): string {
        $label = trim($label);
        if ($label !== '') {
            return $this->sanitizeSegment($label);
        }

        $number = trim($unitNumber);
        if ($number !== '') {
            return $this->sanitizeSegment($number);
        }

        return 'Unit';
    }

    private function sanitizeSegment(string $segment): string {
        $clean = str_replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], '-', $segment);
        return trim((string)$clean, " \t\n\r\0\x0B-");
    }
}

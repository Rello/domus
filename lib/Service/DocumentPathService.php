<?php

namespace OCA\Domus\Service;

class DocumentPathService {
    private const BASE_FOLDER = 'DomusApp';

    public function buildPropertyPath(string $propertyName): string {
        $propertySegment = $this->sanitizeSegment($propertyName);
        if ($propertySegment === '') {
            $propertySegment = 'Property';
        }

        return $this->buildPath([self::BASE_FOLDER, $propertySegment]);
    }

    public function buildUnitPath(?string $unitLabel, ?string $unitNumber, ?string $propertyName): string {
        $unitSegment = $this->resolveUnitSegment($unitLabel, $unitNumber);
        $propertySegment = $propertyName ? $this->sanitizeSegment($propertyName) : '';

        $segments = [self::BASE_FOLDER];
        if ($propertySegment !== '') {
            $segments[] = $propertySegment;
        }
        $segments[] = $unitSegment;

        return $this->buildPath($segments);
    }

    private function resolveUnitSegment(?string $unitLabel, ?string $unitNumber): string {
        $label = trim((string)$unitLabel);
        if ($label !== '') {
            return $this->sanitizeSegment($label);
        }

        $number = trim((string)$unitNumber);
        if ($number !== '') {
            return $this->sanitizeSegment($number);
        }

        return 'Unit';
    }

    private function buildPath(array $segments): string {
        $cleaned = array_values(array_filter($segments, static fn(string $segment) => trim($segment) !== ''));
        return implode('/', $cleaned);
    }

    private function sanitizeSegment(string $segment): string {
        $clean = str_replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], '-', $segment);
        return trim((string)$clean, " \t\n\r\0\x0B-");
    }
}

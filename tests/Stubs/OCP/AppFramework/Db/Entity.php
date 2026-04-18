<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

namespace OCP\AppFramework\Db;

abstract class Entity {
    protected $id = null;

    /**
     * @var array<string, string>
     */
    private array $types = [];

    protected function addType(string $field, string $type): void {
        $this->types[$field] = $type;
    }

    public function __call(string $name, array $arguments) {
        if (str_starts_with($name, 'get')) {
            $property = lcfirst(substr($name, 3));
            return $this->{$property} ?? null;
        }

        if (str_starts_with($name, 'is')) {
            $property = lcfirst(substr($name, 2));
            return (bool)($this->{$property} ?? false);
        }

        if (str_starts_with($name, 'set')) {
            $property = lcfirst(substr($name, 3));
            $value = $arguments[0] ?? null;
            $this->{$property} = $this->castValue($property, $value);
            return $this;
        }

        throw new \BadMethodCallException('Method "' . $name . '" is not available.');
    }

    private function castValue(string $property, mixed $value): mixed {
        if ($value === null || !isset($this->types[$property])) {
            return $value;
        }

        return match ($this->types[$property]) {
            'int' => (int)$value,
            'bool' => (bool)$value,
            'string' => (string)$value,
            default => $value,
        };
    }
}

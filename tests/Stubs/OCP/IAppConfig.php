<?php
namespace OCP;

interface IAppConfig {
	public function getValueString(string $app, string $key, string $default = ''): string;
	public function getValueBool(string $app, string $key, bool $default = false): bool;
	public function getValueArray(string $app, string $key, array $default = []): array;
}

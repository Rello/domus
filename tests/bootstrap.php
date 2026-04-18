<?php

/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

declare(strict_types=1);

$vendorAutoload = __DIR__ . '/../vendor/autoload.php';
if (is_file($vendorAutoload)) {
    require_once $vendorAutoload;
}

spl_autoload_register(static function (string $class): void {
    $prefixes = [
        'OCA\\Domus\\Tests\\' => __DIR__ . '/',
        'OCA\\Domus\\' => dirname(__DIR__) . '/lib/',
        'OCP\\' => __DIR__ . '/Stubs/OCP/',
        'Psr\\Log\\' => __DIR__ . '/Stubs/Psr/Log/',
    ];

    foreach ($prefixes as $prefix => $baseDir) {
        if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
            continue;
        }

        $relativeClass = substr($class, strlen($prefix));
        $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';
        if (is_file($file)) {
            require_once $file;
        }

        return;
    }
});

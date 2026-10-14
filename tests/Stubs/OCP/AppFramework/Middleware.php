<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCP\AppFramework;

class Middleware {
    public function afterException(Controller $controller, string $methodName, \Exception $exception) {
        throw $exception;
    }
}

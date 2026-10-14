<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Exception;

/** A requested business record or attachment does not exist in the current scope. */
class ResourceNotFoundException extends \RuntimeException {
}

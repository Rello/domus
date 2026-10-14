<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Exception;

/** The current state of a record prevents the requested operation. */
class ConflictException extends \RuntimeException {
}

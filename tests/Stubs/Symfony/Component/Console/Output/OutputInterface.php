<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace Symfony\Component\Console\Output;

interface OutputInterface {
    public function writeln($messages, int $options = 0): void;
}

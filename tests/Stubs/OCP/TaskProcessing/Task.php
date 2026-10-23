<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCP\TaskProcessing;
final class Task {
    public const STATUS_SCHEDULED = 1, STATUS_RUNNING = 2, STATUS_SUCCESSFUL = 3, STATUS_FAILED = 4, STATUS_CANCELLED = 5;
    private ?int $id = null;
    private int $status = 1;
    private ?array $output = null;
    private ?float $progress = null;
    public function getScheduledAt(): ?int { return null; }
    public function getStartedAt(): ?int { return null; }
    public function getEndedAt(): ?int { return null; }
    public function getProgress(): ?float { return $this->progress; }
    public function setProgress(?float $progress): void { $this->progress = $progress; }
    public function __construct(private string $type, private array $input, private string $app, private ?string $user, private ?string $custom = '') {}
    public function getTaskTypeId(): string { return $this->type; }
    public function getInput(): array { return $this->input; }
    public function getAppId(): string { return $this->app; }
    public function getUserId(): ?string { return $this->user; }
    public function getCustomId(): ?string { return $this->custom; }
    public function getId(): ?int { return $this->id; }
    public function setId(?int $id): void { $this->id = $id; }
    public function getStatus(): int { return $this->status; }
    public function setStatus(int $status): void { $this->status = $status; }
    public function getOutput(): ?array { return $this->output; }
    public function setOutput(?array $output): void { $this->output = $output; }
}

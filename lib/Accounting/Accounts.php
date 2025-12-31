<?php

namespace OCA\Domus\Accounting;

use OCA\Domus\Service\AccountService;
use OCP\IL10N;

class Accounts {
    public function __construct(private AccountService $accountService) {
    }

    public function all(?IL10N $l10n = null): array {
        return $this->accountService->listAccounts($l10n);
    }

    public function exists(string $nr): bool {
        return $this->accountService->exists($nr);
    }

    public function label(string $nr, ?IL10N $l10n = null): string {
        return $this->accountService->label($nr, $l10n);
    }
}

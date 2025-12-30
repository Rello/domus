<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Account;
use OCA\Domus\Db\AccountMapper;
use OCP\IL10N;

class AccountService {
    public function __construct(
        private AccountMapper $accountMapper,
        private IL10N $l10n,
    ) {
    }

    public function listAccounts(?IL10N $l10n = null): array {
        $accounts = $this->accountMapper->findAllOrdered();
        $list = [];

        foreach ($accounts as $account) {
            $list[(string)$account->getNumber()] = [
                'label' => $this->resolveLabel($account, $l10n),
            ];
        }

        return $list;
    }

    public function listAccountDetails(?IL10N $l10n = null): array {
        $accounts = $this->accountMapper->findAllOrdered();

        return array_map(fn(Account $account) => $this->mapAccount($account, $l10n), $accounts);
    }

    public function getHierarchy(?IL10N $l10n = null): array {
        $accounts = $this->accountMapper->findAllOrdered();
        $mapped = [];

        foreach ($accounts as $account) {
            $mapped[$account->getId()] = $this->mapAccount($account, $l10n) + ['children' => []];
        }

        $tree = [];
        foreach ($accounts as $account) {
            $accountId = $account->getId();
            $parentId = $account->getParentId();
            if ($parentId && isset($mapped[$parentId])) {
                $mapped[$parentId]['children'][] = &$mapped[$accountId];
            } else {
                $tree[] = &$mapped[$accountId];
            }
        }

        return $tree;
    }

    public function exists(string $number): bool {
        return $this->accountMapper->findByNumber($number) !== null;
    }

    public function label(string $number, ?IL10N $l10n = null): string {
        $account = $this->accountMapper->findByNumber($number);
        if (!$account) {
            return '';
        }

        return $this->resolveLabel($account, $l10n);
    }

    public function assertAccountNumber(string $number): void {
        if (!$this->exists($number)) {
            throw new \InvalidArgumentException($this->l10n->t('Account is invalid.'));
        }
    }

    private function resolveLabel(Account $account, ?IL10N $l10n = null): string {
        $languageCode = $l10n?->getLanguageCode() ?? $this->l10n->getLanguageCode();
        $languageCode = strtolower((string)$languageCode);
        $label = str_starts_with($languageCode, 'de') ? $account->getLabelDe() : $account->getLabelEn();

        if (!$label) {
            $label = $account->getLabelEn() ?: $account->getLabelDe();
        }

        return $label ?? '';
    }

    private function mapAccount(Account $account, ?IL10N $l10n = null): array {
        return [
            'id' => $account->getId(),
            'number' => $account->getNumber(),
            'labelDe' => $account->getLabelDe(),
            'labelEn' => $account->getLabelEn(),
            'label' => $this->resolveLabel($account, $l10n),
            'parentId' => $account->getParentId(),
            'status' => $account->getStatus(),
            'isSystem' => $account->getIsSystem(),
            'sortOrder' => $account->getSortOrder(),
            'createdAt' => $account->getCreatedAt(),
            'updatedAt' => $account->getUpdatedAt(),
        ];
    }
}

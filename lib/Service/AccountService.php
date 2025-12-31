<?php

namespace OCA\Domus\Service;

use OCA\Domus\Db\Account;
use OCA\Domus\Db\AccountMapper;
use OCA\Domus\Db\BookingMapper;
use OCP\IL10N;

class AccountService {
    public function __construct(
        private AccountMapper $accountMapper,
        private BookingMapper $bookingMapper,
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
        return $this->buildHierarchy($accounts, $l10n);
    }

    public function getHierarchyForUser(string $userId, ?IL10N $l10n = null): array {
        $accounts = $this->accountMapper->findAllOrdered();
        $usage = $this->bookingMapper->findAccountUsage($userId);
        $usedNumbers = [];
        foreach ($usage as $row) {
            $usedNumbers[(string)$row['account']] = true;
        }

        return $this->buildHierarchy($accounts, $l10n, $usedNumbers);
    }

    public function createAccount(array $data): Account {
        $number = trim((string)($data['number'] ?? ''));
        if ($number === '') {
            throw new \InvalidArgumentException($this->l10n->t('Account number is required.'));
        }
        if ($this->accountMapper->findByNumber($number)) {
            throw new \InvalidArgumentException($this->l10n->t('Account number already exists.'));
        }

        $labelDe = $this->normalizeLabel($data['labelDe'] ?? null);
        $labelEn = $this->normalizeLabel($data['labelEn'] ?? null);
        [$labelDe, $labelEn] = $this->ensureLabels($labelDe, $labelEn);

        $parentId = $this->resolveParentId($data['parentId'] ?? null);
        $sortOrder = isset($data['sortOrder']) ? (int)$data['sortOrder'] : ($this->accountMapper->getMaxSortOrder() + 1);
        $now = time();

        $account = new Account();
        $account->setNumber($number);
        $account->setLabelDe($labelDe);
        $account->setLabelEn($labelEn);
        $account->setParentId($parentId);
        $account->setStatus('active');
        $account->setIsSystem(0);
        $account->setSortOrder($sortOrder);
        $account->setCreatedAt($now);
        $account->setUpdatedAt($now);

        return $this->accountMapper->insert($account);
    }

    public function updateAccount(int $id, array $data): Account {
        $account = $this->getAccount($id);
        if (array_key_exists('number', $data)) {
            $number = trim((string)$data['number']);
            if ($number === '') {
                throw new \InvalidArgumentException($this->l10n->t('Account number is required.'));
            }
            $existing = $this->accountMapper->findByNumber($number);
            if ($existing && $existing->getId() !== $account->getId()) {
                throw new \InvalidArgumentException($this->l10n->t('Account number already exists.'));
            }
            $account->setNumber($number);
        }

        if (array_key_exists('labelDe', $data)) {
            $account->setLabelDe($this->normalizeLabel($data['labelDe']));
        }
        if (array_key_exists('labelEn', $data)) {
            $account->setLabelEn($this->normalizeLabel($data['labelEn']));
        }

        [$normalizedDe, $normalizedEn] = $this->ensureLabels($account->getLabelDe(), $account->getLabelEn());
        $account->setLabelDe($normalizedDe);
        $account->setLabelEn($normalizedEn);

        if (array_key_exists('parentId', $data)) {
            $parentId = $this->resolveParentId($data['parentId']);
            if ($parentId !== null && $parentId === $account->getId()) {
                throw new \InvalidArgumentException($this->l10n->t('Account cannot be its own parent.'));
            }
            $account->setParentId($parentId);
        }

        if (array_key_exists('sortOrder', $data)) {
            $account->setSortOrder((int)$data['sortOrder']);
        }

        $account->setUpdatedAt(time());
        return $this->accountMapper->update($account);
    }

    public function setStatus(int $id, string $status, string $userId): Account {
        if (!in_array($status, ['active', 'disabled'], true)) {
            throw new \InvalidArgumentException($this->l10n->t('Invalid status.'));
        }
        $account = $this->getAccount($id);
        if ($status === 'disabled') {
            $this->assertAccountMutable($account, $userId);
        }
        $account->setStatus($status);
        $account->setUpdatedAt(time());
        return $this->accountMapper->update($account);
    }

    public function deleteAccount(int $id, string $userId): void {
        $account = $this->getAccount($id);
        $this->assertAccountMutable($account, $userId);
        $children = $this->accountMapper->findChildren($account->getId());
        if (count($children) > 0) {
            throw new \RuntimeException($this->l10n->t('Account has child entries and cannot be deleted.'));
        }
        $this->accountMapper->delete($account);
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

    private function getAccount(int $id): Account {
        $account = $this->accountMapper->findById($id);
        if (!$account) {
            throw new \RuntimeException($this->l10n->t('Account not found.'));
        }
        return $account;
    }

    private function assertAccountMutable(Account $account, string $userId): void {
        if ((int)$account->getIsSystem() === 1) {
            throw new \RuntimeException($this->l10n->t('System accounts cannot be modified.'));
        }
        if ($this->bookingMapper->countByAccount($userId, (string)$account->getNumber()) > 0) {
            throw new \RuntimeException($this->l10n->t('Account is used in bookings and cannot be modified.'));
        }
    }

    private function normalizeLabel(?string $value): ?string {
        $trimmed = $value !== null ? trim($value) : '';
        return $trimmed === '' ? null : $trimmed;
    }

    private function ensureLabels(?string $labelDe, ?string $labelEn): array {
        if ($labelDe === null && $labelEn === null) {
            throw new \InvalidArgumentException($this->l10n->t('At least one label is required.'));
        }
        if ($labelDe === null) {
            $labelDe = $labelEn;
        }
        if ($labelEn === null) {
            $labelEn = $labelDe;
        }
        return [$labelDe, $labelEn];
    }

    private function resolveParentId(mixed $parentId): ?int {
        if ($parentId === null || $parentId === '') {
            return null;
        }
        $resolved = (int)$parentId;
        if ($resolved <= 0) {
            return null;
        }
        $parent = $this->accountMapper->findById($resolved);
        if (!$parent) {
            throw new \InvalidArgumentException($this->l10n->t('Parent account not found.'));
        }
        return $resolved;
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

    private function mapAccount(Account $account, ?IL10N $l10n = null, array $usage = []): array {
        $number = (string)$account->getNumber();
        return [
            'id' => $account->getId(),
            'number' => $number,
            'labelDe' => $account->getLabelDe(),
            'labelEn' => $account->getLabelEn(),
            'label' => $this->resolveLabel($account, $l10n),
            'parentId' => $account->getParentId(),
            'status' => $account->getStatus(),
            'isSystem' => $account->getIsSystem(),
            'sortOrder' => $account->getSortOrder(),
            'createdAt' => $account->getCreatedAt(),
            'updatedAt' => $account->getUpdatedAt(),
            'usedInBookings' => isset($usage[$number]),
        ];
    }

    private function buildHierarchy(array $accounts, ?IL10N $l10n = null, array $usage = []): array {
        $mapped = [];

        foreach ($accounts as $account) {
            $mapped[$account->getId()] = $this->mapAccount($account, $l10n, $usage) + ['children' => []];
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
}

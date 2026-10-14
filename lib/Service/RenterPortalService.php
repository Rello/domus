<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\RenterPortalMapper;
use OCA\Domus\Db\RenterAccessMapper;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\IUserManager;

class RenterPortalService {
    private const CONTACT_FIELDS = ['name', 'email', 'phone', 'street', 'zip', 'city', 'country'];
    public function __construct(private RenterPortalMapper $mapper, private RenterAccessMapper $accounts,
        private ManagementAccessContext $access, private TeamIntegrationService $teams,
        private IRootFolder $files, private IUserManager $users, private IURLGenerator $urls, private IL10N $l10n) {}

    private function denied(): never {
        throw new \DomainException($this->l10n->t('This tenancy or document is no longer available to you.'));
    }

    private function management(string $teamId): void {
        $this->access->assertSubmittedTeam($teamId);
        $this->teams->assertTeamAdmin($teamId);
    }

    private function tenancyRow(string $teamId, int $tenancyId): array {
        $row = $this->mapper->rows('domus_tenancies', ['team_id' => $teamId, 'id' => $tenancyId])[0] ?? null;
        if ($row === null || !$this->mapper->rows('domus_units', ['team_id' => $teamId, 'id' => (int)$row['unit_id']])) $this->denied();
        return $row;
    }

    private function contacts(string $teamId, int $tenancyId, bool $preview = false): array {
        $uid = $this->access->actorUserId();
        $contacts = [];
        foreach ($this->mapper->rows('domus_partner_rel', ['team_id' => $teamId, 'type' => 'tenancy', 'relation_id' => $tenancyId]) as $rel) {
            $filters = ['team_id' => $teamId, 'id' => (int)$rel['partner_id'], 'partner_type' => 'tenant'];
            if (!$preview) $filters['nc_user_id'] = $uid;
            foreach ($this->mapper->rows('domus_partners', $filters) as $partner) $contacts[] = $partner;
        }
        if (!$contacts && !$preview) $this->denied();
        return $contacts;
    }

    private function serializeContact(array $row): array {
        return ['id' => (int)$row['id']] + array_intersect_key($row, array_flip(self::CONTACT_FIELDS));
    }

    public function detail(string $teamId, int $tenancyId): array {
        $contacts = $this->contacts($teamId, $tenancyId);
        return $this->serializeDetail($teamId, $tenancyId, $contacts);
    }

    /** The management preview uses the same serializer and recipient filtering. */
    public function preview(string $teamId, int $tenancyId, int $partnerId): array {
        $this->management($teamId);
        $contacts = array_values(array_filter($this->contacts($teamId, $tenancyId, true), fn ($p) => (int)$p['id'] === $partnerId));
        if (!$contacts) $this->denied();
        return $this->serializeDetail($teamId, $tenancyId, $contacts, true);
    }

    private function serializeDetail(string $teamId, int $id, array $contacts, bool $preview = false): array {
        $row = $this->tenancyRow($teamId, $id);
        $unit = $this->mapper->rows('domus_units', ['team_id' => $teamId, 'id' => (int)$row['unit_id']])[0];
        $tenancy = ['id' => $id, 'unitLabel' => $unit['label'], 'startDate' => $row['start_date'], 'endDate' => $row['end_date']];
        foreach (['baseRent' => 'base_rent', 'serviceCharge' => 'service_charge', 'deposit' => 'deposit', 'conditions' => 'conditions'] as $field => $column) {
            $tenancy[$field] = $row[$column] ?? null;
        }
        $corrections = $this->ownCorrections($teamId, $contacts, $preview);
        $tenancy['partnerIds'] = array_map(fn ($p) => (int)$p['id'], $contacts);
        return ['tenancy' => $tenancy, 'contacts' => array_map($this->serializeContact(...), $contacts),
            'documents' => $this->documentsForTenancy($teamId, $id, $preview),
            'corrections' => array_values(array_filter($corrections, fn ($request) => $request['state'] === 'pending')),
            'activities' => $this->ownActivities($teamId, $corrections)];
    }

    /** Resolve only a directly linked tenancy file, through its owning staff account. */
    private function linkedFile(array $link): File {
        $this->tenancyRow($link['team_id'], (int)$link['entity_id']);
        if ($link['entity_type'] !== 'tenancy') $this->denied();
        $user = $this->users->get($link['user_id']);
        if (!$user || !$user->isEnabled() || !$this->teams->isTeamMember($link['team_id'], $user->getUID())) $this->denied();
        foreach ($this->files->getUserFolder($user->getUID())->getById((int)$link['file_id']) as $file) {
            if ($file instanceof File && $file->isReadable()) return $file;
        }
        $this->denied();
    }

    private function documentsForTenancy(string $teamId, int $id, bool $preview = false): array {
        $documents = [];
        foreach ($this->mapper->rows('domus_docLinks', ['team_id' => $teamId, 'entity_type' => 'tenancy', 'entity_id' => $id]) as $link) {
            try { $file = $this->linkedFile($link); } catch (\Throwable) { continue; }
            $documents[] = ['id' => (int)$link['id'], 'fileName' => $link['file_name'] ?: $file->getName(),
                'fileUrl' => $preview ? $this->urls->linkToRoute('domus.RenterPortal.previewContent', ['teamId' => $teamId, 'tenancyId' => $id, 'id' => (int)$link['id']])
                    : $this->urls->linkToRoute('domus.RenterPortal.content', ['id' => (int)$link['id']]),
                'createdAt' => (int)$link['created_at']];
        }
        return $documents;
    }

    public function documents(string $teamId, int $tenancyId): array {
        $this->contacts($teamId, $tenancyId);
        $this->tenancyRow($teamId, $tenancyId);
        return $this->documentsForTenancy($teamId, $tenancyId);
    }

    public function previewContent(string $teamId, int $tenancyId, int $id): File {
        $this->management($teamId);
        $link = $this->mapper->rows('domus_docLinks', ['team_id' => $teamId, 'id' => $id, 'entity_type' => 'tenancy', 'entity_id' => $tenancyId])[0] ?? null;
        if (!$link) $this->denied();
        return $this->linkedFile($link);
    }

    public function content(int $id): File {
        $link = $this->mapper->rows('domus_docLinks', ['id' => $id, 'entity_type' => 'tenancy'])[0] ?? null;
        if (!$link || empty($link['team_id'])) $this->denied();
        $this->contacts($link['team_id'], (int)$link['entity_id']);
        return $this->linkedFile($link);
    }

    private function ownCorrections(string $teamId, array $contacts, bool $preview = false): array {
        $requests = [];
        foreach ($contacts as $contact) {
            $recipient = $preview ? ($contact['nc_user_id'] ?? '') : $this->access->actorUserId();
            if ($recipient === '') continue;
            foreach ($this->mapper->rows('domus_corrections', ['team_id' => $teamId, 'partner_id' => (int)$contact['id'], 'requested_by' => $recipient]) as $request) {
                $requests[] = $this->serializeCorrection($request);
            }
        }
        return $requests;
    }

    /** Only system decisions on this recipient's own requests are renter-visible. */
    private function ownActivities(string $teamId, array $requests): array {
        $entries = [];
        foreach ($requests as $request) {
            foreach ($this->mapper->rows('domus_action_logs', ['team_id' => $teamId, 'entity_type' => 'partner',
                'entity_id' => $request['partnerId'], 'source' => 'system', 'linked_entity_type' => 'correction',
                'linked_entity_id' => $request['id']]) as $entry) {
                $entries[] = ['id' => (int)$entry['id'], 'type' => $entry['type'], 'title' => $entry['title'],
                    'data' => $entry['data'], 'source' => 'system', 'createdAt' => (int)$entry['created_at']];
            }
        }
        usort($entries, fn ($a, $b) => [$b['createdAt'], $b['id']] <=> [$a['createdAt'], $a['id']]);
        return $entries;
    }

    private function recordCorrectionActivity(array $request, string $state, string $actor): void {
        $title = match ($state) {
            'approved' => $this->l10n->t('Contact correction approved'),
            'rejected' => $this->l10n->t('Contact correction rejected'),
            'conflict' => $this->l10n->t('Contact correction could not be applied because the contact changed'),
        };
        $labels = ['name' => $this->l10n->t('Name'), 'email' => $this->l10n->t('Email'), 'phone' => $this->l10n->t('Phone'),
            'street' => $this->l10n->t('Street'), 'zip' => $this->l10n->t('ZIP'), 'city' => $this->l10n->t('City'), 'country' => $this->l10n->t('Country')];
        $original = json_decode($request['original_values'], true);
        $lines = [$this->l10n->t('Requested changes')];
        foreach (json_decode($request['proposed_values'], true) as $field => $value) {
            $lines[] = $labels[$field] . ': ' . ($original[$field] ?? '—') . ' → ' . $value;
        }
        $now = time();
        $this->mapper->insert('domus_action_logs', ['team_id' => $request['team_id'], 'user_id' => $actor,
            'entity_type' => 'partner', 'entity_id' => (int)$request['partner_id'], 'type' => 'event',
            'title' => $title, 'data' => implode("\n", $lines), 'source' => 'system',
            'linked_entity_type' => 'correction', 'linked_entity_id' => (int)$request['id'],
            'created_by' => $actor, 'created_at' => $now, 'updated_at' => $now]);
    }

    private function serializeCorrection(array $request): array {
        return ['id' => (int)$request['id'], 'partnerId' => (int)$request['partner_id'], 'state' => $request['state'],
            'original' => json_decode($request['original_values'], true), 'proposed' => json_decode($request['proposed_values'], true),
            'requestedBy' => $request['requested_by'], 'createdAt' => (int)$request['created_at'], 'decidedAt' => $request['decided_at'] ?? null];
    }

    public function requestCorrection(string $teamId, int $partnerId, array $proposed): array {
        $uid = $this->access->actorUserId();
        $contact = $this->mapper->rows('domus_partners', ['team_id' => $teamId, 'id' => $partnerId, 'partner_type' => 'tenant', 'nc_user_id' => $uid])[0] ?? null;
        if (!$contact || !$this->accounts->linkedTenancies($teamId, $partnerId)) $this->denied();
        if (!$proposed || array_diff(array_keys($proposed), self::CONTACT_FIELDS)) throw new \InvalidArgumentException($this->l10n->t('Choose only your contact details to correct.'));
        $original = [];
        foreach ($proposed as $field => &$value) {
            if (!is_string($value) || mb_strlen($value) > ($field === 'zip' ? 32 : 190)) throw new \InvalidArgumentException($this->l10n->t('Contact details exceed the permitted length.'));
            $value = trim($value);
            if ($field === 'email' && $value !== '' && !filter_var($value, FILTER_VALIDATE_EMAIL)) throw new \InvalidArgumentException($this->l10n->t('Enter a valid email address.'));
            if ($field === 'name' && $value === '') throw new \InvalidArgumentException($this->l10n->t('Name is required.'));
            $original[$field] = $contact[$field] ?? null;
        }
        unset($value);
        $proposed = array_filter($proposed, fn ($value, $field) => $value !== ($original[$field] ?? ''), ARRAY_FILTER_USE_BOTH);
        $original = array_intersect_key($original, $proposed);
        if (!$proposed) throw new \InvalidArgumentException($this->l10n->t('No contact details have changed.'));
        $id = $this->mapper->insert('domus_corrections', ['team_id' => $teamId, 'partner_id' => $partnerId,
            'requested_by' => $uid, 'original_values' => json_encode($original), 'proposed_values' => json_encode($proposed),
            'state' => 'pending', 'created_at' => time()]);
        return ['id' => $id, 'state' => 'pending'];
    }

    public function corrections(string $teamId, int $partnerId): array {
        $this->management($teamId);
        if (!$this->accounts->partner($teamId, $partnerId)) $this->denied();
        return array_map($this->serializeCorrection(...), $this->mapper->rows('domus_corrections', ['team_id' => $teamId, 'partner_id' => $partnerId, 'state' => 'pending']));
    }

    public function decide(string $teamId, int $id, bool $approve): array {
        $this->management($teamId);
        $request = $this->mapper->rows('domus_corrections', ['team_id' => $teamId, 'id' => $id])[0] ?? null;
        if (!$request || !$this->accounts->partner($teamId, (int)$request['partner_id'])) $this->denied();
        // Clearing an account assignment also stops its pending requests from being applied.
        $partner = $this->accounts->partner($teamId, (int)$request['partner_id']);
        if ($approve && ($partner['nc_user_id'] ?? null) !== $request['requested_by']) $this->denied();
        if ($request['state'] !== 'pending') throw new \DomainException($this->l10n->t('This request has already been reviewed.'));
        try {
            $actor = $this->access->actorUserId();
            return ['state' => $this->mapper->decide($request, json_decode($request['original_values'], true),
                json_decode($request['proposed_values'], true), $actor, $approve,
                fn ($state) => $this->recordCorrectionActivity($request, $state, $actor))];
        } catch (\DomainException $e) {
            throw new \DomainException($this->l10n->t('This request has already been reviewed.'), 0, $e);
        }
    }
}

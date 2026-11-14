<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

use OCA\Domus\Db\{Tenancy, PartnerMapper, PartnerRelMapper, TaskTemplateMapper};

/** Called within the tenancy write transaction; never scans historical data in the background. */
class TenantChangeService {
    public function __construct(
        private PartnerRelMapper $partnerRelMapper,
        private PartnerMapper $partnerMapper,
        private TaskTemplateMapper $templateMapper,
        private WorkflowRunService $workflows,
    ) {
    }

    /** Only tenancies ended by this creation are eligible. */
    public function created(Tenancy $incoming, string $userId, array $endedTenancies): void {
        $previous = null;
        foreach ($endedTenancies as $other) {
            if ($previous === null || $other->getStartDate() > $previous->getStartDate()) $previous = $other;
        }
        if ($previous === null) return; // First letting has no departing tenant.
        $outgoingIds = $this->partnerIds($previous, $userId);
        $incomingIds = $this->partnerIds($incoming, $userId);
        // A shared contact means continuation/partial household change, not a full tenant change.
        if ($incomingIds === [] || array_intersect($outgoingIds, $incomingIds) !== []) return;
        $this->start($previous, $userId);
    }

    private function partnerIds(Tenancy $tenancy, string $userId): array {
        return array_values(array_unique(array_map(
            static fn ($relation) => (int)$relation->getPartnerId(),
            $this->partnerRelMapper->findForTenancy($tenancy->getId(), $userId),
        )));
    }

    private function start(Tenancy $outgoing, string $userId): void {
        $template = $this->templateMapper->findByKey('tenant_change');
        if (!$template || !(int)$template->getIsActive() || $template->getAppliesTo() !== 'unit') return;
        $contacts = array_values(array_filter(
            $this->partnerMapper->findForUserByIds($this->partnerIds($outgoing, $userId), $userId),
            static fn ($contact) => $contact->getPartnerType() === 'tenant',
        ));
        if ($contacts === []) return;
        foreach ($contacts as $contact) {
            // Each departing contact gets the same one-step process with its own edit target.
            $this->workflows->startWorkflowRun('unit', $outgoing->getUnitId(), $template->getId(), null,
                $contact->getName(), $userId, $contact->getId());
        }
    }
}

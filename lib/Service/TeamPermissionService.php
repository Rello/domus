<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Service;

/** Explicit member mutation allowlist: new management actions default to administrator-only. */
class TeamPermissionService {
    public static function capabilities(string $role): array {
        $member = in_array($role, ['admin', 'member'], true);
        $admin = $role === 'admin';
        return [
            'editContacts' => $member, 'editBookings' => $member,
            'addDocuments' => $member, 'manageTasks' => $member,
            'managePortfolio' => $admin, 'manageTenancies' => $admin,
            'deleteRecords' => $admin, 'manageSettings' => $admin,
            'manageRenterAccess' => $admin, 'closeYears' => $admin,
        ];
    }

    public static function required(string $controller, string $method, string $verb, array $params = []): ?string {
        // Renter endpoints and server-wide policy have their own authorization.
        if ($controller === 'RenterPortal' && $method === 'requestCorrection') return null;
        if ($controller === 'TeamIntegration' && in_array($method, ['activate', 'deactivate', 'savePolicy'], true)) return null;
        if (in_array($verb, ['GET', 'HEAD', 'OPTIONS'], true)) return null;
        if ($controller === 'Partner' && in_array($method, ['create', 'update'], true)) {
            return isset($params['ncUserId']) ? 'manageRenterAccess' : 'editContacts';
        }
        if ($controller === 'Booking' && in_array($method, ['create', 'update'], true)) return 'editBookings';
        if ($controller === 'BookingAssignmentPreview') return 'editBookings';
        if ($controller === 'Document' && in_array($method, ['link', 'upload', 'attach'], true)) {
            return !empty($params['sourceLinkId']) ? 'deleteRecords' : 'addDocuments';
        }
        if ($controller === 'Task' && in_array($method, ['createForEntity', 'update', 'close', 'reopen', 'remind'], true)) return 'manageTasks';
        // Workflow progress does not execute action URLs; those endpoints are checked separately.
        if ($controller === 'WorkflowRun' && in_array($method, ['createForEntity', 'closeStep', 'closeEarly', 'reopenStep', 'remindStep'], true)) return 'manageTasks';
        if ($controller === 'ActionLog' && in_array($method, ['createForEntity', 'update'], true)) return 'manageTasks';
        if ($controller === 'RenterPortal' && $method === 'decide') return 'editContacts';
        if ($controller === 'RenterAccess') return 'manageRenterAccess';
        if ($controller === 'BookingYear') return 'closeYears';
        if ($controller === 'FinancialHistory') return 'deleteRecords';
        if ($verb === 'DELETE') return 'deleteRecords';
        if (in_array($controller, ['Settings', 'Rule', 'TaskTemplate', 'Account'], true)) return 'manageSettings';
        if ($controller === 'Tenancy') return 'manageTenancies';
        return 'managePortfolio';
    }
}

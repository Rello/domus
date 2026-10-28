<?php

/**
 * SPDX-FileCopyrightText: 2025 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Domus\AppInfo;

use OCA\Domus\UserMigration\DomusMigrator;
use OCA\Domus\Listener\UserDeletedListener;
use OCA\Domus\Middleware\ApiErrorMiddleware;
use OCP\User\Events\UserDeletedEvent;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IRegistrationContext;

class Application extends App implements IBootstrap {
    public const APP_ID = 'domus';

    public function __construct(array $urlParams = []) {
        parent::__construct(self::APP_ID, $urlParams);
    }

    public function register(IRegistrationContext $context): void {
        $context->registerDashboardWidget(\OCA\Domus\Dashboard\TasksWidget::class);
        $context->registerMiddleware(ApiErrorMiddleware::class);
        $context->registerMiddleware(\OCA\Domus\Middleware\UnitMoveMiddleware::class);
        $context->registerUserMigrator(DomusMigrator::class);
        $context->registerEventListener(UserDeletedEvent::class, UserDeletedListener::class);
    }

    public function boot(IBootContext $context): void {
    }
}

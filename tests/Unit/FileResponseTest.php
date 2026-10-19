<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Tests\Unit;

use OCA\Domus\Controller\{DocumentController, PropertyController, RenterPortalController, UnitController};
use OCA\Domus\Exception\ResourceNotFoundException;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\Files\File;
use PHPUnit\Framework\TestCase;

class FileResponseTest extends TestCase {
    private function dependencies(string $class): array {
        $dependencies = [];
        foreach ((new \ReflectionClass($class))->getConstructor()->getParameters() as $parameter) {
            $dependencies[$parameter->getName()] = $this->createMock($parameter->getType()->getName());
        }
        $dependencies['l10n']->method('t')->willReturnArgument(0);
        if (isset($dependencies['managementContext'])) {
            $dependencies['managementContext']->method('managementUserId')->willReturn('alice');
        }
        return $dependencies;
    }

    /** @dataProvider contentRoutes */
    public function testAuthenticatedBrowserRoutesUseExplicitSafeHeaders(string $class, string $method, string $service, string $serviceMethod, array $args, array $serviceArgs, string $mime, string $disposition): void {
        $dependencies = $this->dependencies($class);
        $file = $this->createMock(File::class);
        $file->method('getName')->willReturn("a\"\r\nümlaut.svg");
        $file->method('getMimeType')->willReturn($mime);
        $dependencies[$service]->expects(self::once())->method($serviceMethod)->with(...$serviceArgs)->willReturn($file);
        $response = (new $class(...array_values($dependencies)))->$method(...$args);
        $headers = $response->getHeaders();
        self::assertSame(200, $response->getStatus());
        self::assertSame($mime, $headers['Content-Type']);
        self::assertSame($disposition . "; filename*=UTF-8''" . rawurlencode($file->getName()), $headers['Content-Disposition']);
        self::assertSame('private, no-store', $headers['Cache-Control']);
        self::assertSame('nosniff', $headers['X-Content-Type-Options']);
        if ($method === 'imageContent') {
            self::assertStringStartsWith("sandbox; default-src 'none'", $headers['Content-Security-Policy']);
        }
        $action = new \ReflectionMethod($class, $method);
        self::assertCount(1, $action->getAttributes(NoCSRFRequired::class));
        self::assertCount(0, $action->getAttributes('OCP\\AppFramework\\Http\\Attribute\\PublicPage'));
    }

    public static function contentRoutes(): array {
        return [
            'property image' => [PropertyController::class, 'imageContent', 'entityImageService', 'getPropertyImage', [1], [1, 'alice'], 'image/png', 'inline'],
            'unit svg' => [UnitController::class, 'imageContent', 'entityImageService', 'getUnitImage', [1], [1, 'alice'], 'image/svg+xml', 'inline'],
            'renamed html image' => [UnitController::class, 'imageContent', 'entityImageService', 'getUnitImage', [1], [1, 'alice'], 'text/html', 'attachment'],
            'management document' => [DocumentController::class, 'content', 'documentService', 'getLinkedFile', [1], ['alice', 1], 'text/html', 'attachment'],
            'renter document' => [RenterPortalController::class, 'content', 'service', 'content', [1], [1], 'application/pdf', 'inline'],
            'preview document' => [RenterPortalController::class, 'previewContent', 'service', 'previewContent', ['a', 2, 1], ['a', 2, 1], 'application/pdf', 'inline'],
        ];
    }

    /** @dataProvider managementRoutes */
    public function testMissingOrUnauthorizedFilesStillFailClosed(string $class, string $method, string $service, string $serviceMethod): void {
        $dependencies = $this->dependencies($class);
        $dependencies[$service]->method($serviceMethod)->willThrowException(new ResourceNotFoundException('Not found'));
        $this->expectException(ResourceNotFoundException::class);
        (new $class(...array_values($dependencies)))->$method(1);
    }

    public static function managementRoutes(): array {
        return [
            [PropertyController::class, 'imageContent', 'entityImageService', 'getPropertyImage'],
            [UnitController::class, 'imageContent', 'entityImageService', 'getUnitImage'],
            [DocumentController::class, 'content', 'documentService', 'getLinkedFile'],
        ];
    }
}

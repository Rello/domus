<?php
/**
 * SPDX-FileCopyrightText: 2026 Marcel Scherello
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
namespace OCA\Domus\Http;

use OCP\AppFramework\Http\FileDisplayResponse;
use OCP\Files\File;

/** Responses for files whose access has already been checked by the owning service. */
final class FileResponse {
    public static function image(File $file): FileDisplayResponse {
        $mime = $file->getMimeType();
        $response = self::create($file, $mime, !str_starts_with($mime, 'image/'));
        // SVGs must remain safe even when their URL is opened as a document.
        $response->addHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'");
        return $response;
    }

    public static function document(File $file): FileDisplayResponse {
        $mime = $file->getMimeType();
        // Only passive formats may be rendered on the authenticated app origin.
        $inline = in_array($mime, ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'text/plain'], true);
        return self::create($file, $mime, !$inline);
    }

    public static function download(File $file): FileDisplayResponse {
        return self::create($file, $file->getMimeType(), true);
    }

    private static function create(File $file, string $mime, bool $download): FileDisplayResponse {
        $response = new FileDisplayResponse($file);
        $response->addHeader('Content-Type', $mime ?: 'application/octet-stream');
        $response->addHeader('Content-Disposition', ($download ? 'attachment' : 'inline') . "; filename*=UTF-8''" . rawurlencode($file->getName()));
        $response->addHeader('Cache-Control', 'private, no-store');
        $response->addHeader('X-Content-Type-Options', 'nosniff');
        return $response;
    }
}

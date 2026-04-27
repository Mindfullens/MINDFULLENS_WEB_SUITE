<?php

declare(strict_types=1);

const RAW_BRIDGE_SUPPORTED_FORMATS = [
    'dng',
    'nef',
    'nrw',
    'cr2',
    'cr3',
    'arw',
    'raf',
    'rw2',
    'orf',
    'pef',
    'iiq',
    '3fr',
    'erf',
    'kdc',
    'mos',
    'mrw',
    'x3f',
];

function raw_bridge_send_json(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function raw_bridge_exec_allowed(): bool
{
    if (!function_exists('exec')) {
        return false;
    }

    $disabled = (string) ini_get('disable_functions');
    if ($disabled === '') {
        return true;
    }

    $disabledList = array_map('trim', explode(',', $disabled));
    return !in_array('exec', $disabledList, true);
}

function raw_bridge_find_binary(array $candidates): ?string
{
    if (!raw_bridge_exec_allowed()) {
        return null;
    }

    foreach ($candidates as $candidate) {
        $output = [];
        $exitCode = 1;
        @exec('command -v ' . escapeshellarg($candidate) . ' 2>/dev/null', $output, $exitCode);

        if ($exitCode === 0 && !empty($output[0])) {
            return trim((string) $output[0]);
        }
    }

    return null;
}

function raw_bridge_capabilities(): array
{
    $imagickAvailable = extension_loaded('imagick') && class_exists('Imagick');
    $magickBinary = raw_bridge_find_binary(['magick']);
    $convertBinary = raw_bridge_find_binary(['convert']);

    $decoderInstalled = $imagickAvailable || $magickBinary !== null || $convertBinary !== null;
    $backend = 'none';

    if ($imagickAvailable) {
        $backend = 'Imagick';
    } elseif ($magickBinary !== null) {
        $backend = 'ImageMagick CLI (magick)';
    } elseif ($convertBinary !== null) {
        $backend = 'ImageMagick CLI (convert)';
    }

    return [
        'decoderInstalled' => $decoderInstalled,
        'workerReady' => true,
        'backend' => $backend,
        'supportedFormats' => RAW_BRIDGE_SUPPORTED_FORMATS,
        'colorPipeline' => [
            'stage' => 'srgb-linear-srgb-v1',
            'inputEncoding' => 'display-srgb',
            'workingEncoding' => 'scene-linear',
            'outputEncoding' => 'display-srgb',
            'linearStageEnabled' => true,
        ],
    ];
}

function raw_bridge_get_header(string $name): ?string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    if (!isset($_SERVER[$key])) {
        return null;
    }

    $value = trim((string) $_SERVER[$key]);
    return $value === '' ? null : $value;
}

function raw_bridge_safe_extension(string $fileName): string
{
    $extension = pathinfo($fileName, PATHINFO_EXTENSION);
    $extension = strtolower((string) $extension);
    $extension = preg_replace('/[^a-z0-9]/', '', $extension ?? '');

    if ($extension === null || $extension === '') {
        return 'raw';
    }

    return $extension;
}

function raw_bridge_remove_tree(string $path): void
{
    if (!is_dir($path)) {
        return;
    }

    $items = scandir($path);
    if ($items === false) {
        @rmdir($path);
        return;
    }

    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }

        $itemPath = $path . DIRECTORY_SEPARATOR . $item;
        if (is_dir($itemPath)) {
            raw_bridge_remove_tree($itemPath);
        } else {
            @unlink($itemPath);
        }
    }

    @rmdir($path);
}

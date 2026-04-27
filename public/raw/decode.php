<?php

declare(strict_types=1);

require_once __DIR__ . '/raw_bridge_lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    raw_bridge_send_json(405, [
        'error' => [
            'code' => 'RAW_METHOD_NOT_ALLOWED',
            'message' => 'Endpoint RAW wymaga metody POST.',
        ],
        'capabilities' => raw_bridge_capabilities(),
    ]);
    exit;
}

$capabilities = raw_bridge_capabilities();

if (!$capabilities['decoderInstalled']) {
    raw_bridge_send_json(503, [
        'error' => [
            'code' => 'RAW_DECODER_MISSING',
            'message' => 'Na serwerze nie wykryto aktywnego dekodera RAW (Imagick/magick/convert).',
        ],
        'capabilities' => $capabilities,
    ]);
    exit;
}

$body = file_get_contents('php://input');
if ($body === false || $body === '') {
    raw_bridge_send_json(400, [
        'error' => [
            'code' => 'RAW_EMPTY_UPLOAD',
            'message' => 'Nie otrzymano danych pliku RAW/DNG.',
        ],
        'capabilities' => $capabilities,
    ]);
    exit;
}

$fileName = raw_bridge_get_header('X-File-Name') ?? ('upload-' . uniqid('', true) . '.raw');
$renderIntent = strtolower(raw_bridge_get_header('X-Render-Intent') ?? 'preview');
$renderIntent = $renderIntent === 'full' ? 'full' : 'preview';

$tempRoot = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR)
    . DIRECTORY_SEPARATOR
    . 'mindfullens-raw-'
    . (function_exists('random_bytes') ? bin2hex(random_bytes(8)) : uniqid('', true));

if (!@mkdir($tempRoot, 0700, true) && !is_dir($tempRoot)) {
    raw_bridge_send_json(500, [
        'error' => [
            'code' => 'RAW_TEMP_DIR_FAILED',
            'message' => 'Nie udało się utworzyć katalogu tymczasowego.',
        ],
        'capabilities' => $capabilities,
    ]);
    exit;
}

$inputPath = $tempRoot . DIRECTORY_SEPARATOR . 'input.' . raw_bridge_safe_extension($fileName);
$outputPath = $tempRoot . DIRECTORY_SEPARATOR . 'preview.png';
$backendUsed = $capabilities['backend'];

try {
    if (file_put_contents($inputPath, $body) === false) {
        throw new RuntimeException('Nie udało się zapisać pliku RAW w katalogu tymczasowym.');
    }

    $pngBlob = null;

    if (extension_loaded('imagick') && class_exists('Imagick')) {
        try {
            $imagick = new Imagick();
            $imagick->readImage($inputPath);

            if (method_exists($imagick, 'autoOrient')) {
                @$imagick->autoOrient();
            }

            if ($renderIntent !== 'full') {
                @$imagick->thumbnailImage(1800, 1800, true, true);
            }

            $imagick->setImageColorspace(Imagick::COLORSPACE_SRGB);
            $imagick->setImageFormat('png');
            $pngBlob = $imagick->getImageBlob();
            $imagick->clear();
            $imagick->destroy();
            $backendUsed = 'Imagick';
        } catch (Throwable $error) {
            $pngBlob = null;
        }
    }

    if ($pngBlob === null) {
        $binary = raw_bridge_find_binary(['magick', 'convert']);

        if ($binary === null) {
            throw new RuntimeException('Brak binarki ImageMagick (magick/convert).');
        }

        $resizeArg = $renderIntent === 'full' ? '' : ' -resize 1800x1800\> ';
        $command = escapeshellarg($binary)
            . ' '
            . escapeshellarg($inputPath)
            . ' -auto-orient -colorspace sRGB '
            . $resizeArg
            . escapeshellarg($outputPath)
            . ' 2>&1';

        $output = [];
        $exitCode = 1;
        @exec($command, $output, $exitCode);

        if ($exitCode !== 0 || !is_file($outputPath)) {
            $message = 'ImageMagick nie zdekodował pliku RAW.';
            if (!empty($output)) {
                $message .= ' ' . trim((string) end($output));
            }
            throw new RuntimeException($message);
        }

        $pngBlob = file_get_contents($outputPath);
        if ($pngBlob === false || $pngBlob === '') {
            throw new RuntimeException('Nie udało się odczytać wygenerowanego PNG.');
        }

        $backendUsed = basename($binary) === 'magick'
            ? 'ImageMagick CLI (magick)'
            : 'ImageMagick CLI (convert)';
    }

    http_response_code(200);
    header('Content-Type: image/png');
    header('Cache-Control: no-store, max-age=0');
    header('X-Raw-Backend: ' . $backendUsed);
    header('X-Raw-Color-Stage: srgb-linear-srgb-v1');
    header('X-Raw-Input-Encoding: display-srgb');
    header('X-Raw-Output-Encoding: display-srgb');
    header('X-Raw-Linear-Stage-Enabled: 1');
    echo $pngBlob;
} catch (Throwable $error) {
    raw_bridge_send_json(422, [
        'error' => [
            'code' => 'RAW_DECODE_FAILED',
            'message' => 'Dekoder RAW nie zdołał otworzyć tego pliku: ' . $error->getMessage(),
        ],
        'capabilities' => $capabilities,
    ]);
} finally {
    raw_bridge_remove_tree($tempRoot);
}

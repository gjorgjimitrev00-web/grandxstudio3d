<?php
declare(strict_types=1);
ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
function fail(int $status): never { http_response_code($status); exit('Storage request rejected.'); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail(405);
$configFile = dirname(__DIR__) . '/grandx-media-config.php';
if (!is_file($configFile)) fail(503);
$config = require $configFile;
if (strlen($config['secret'] ?? '') < 32 || str_starts_with($config['secret'], 'REPLACE')) fail(503);
$action = $_SERVER['HTTP_X_GX_ACTION'] ?? '';
$key = $_SERVER['HTTP_X_GX_KEY'] ?? '';
$timestamp = $_SERVER['HTTP_X_GX_TIME'] ?? '';
$signature = $_SERVER['HTTP_X_GX_SIGNATURE'] ?? '';
if (!in_array($action, ['put', 'get', 'delete'], true) || !ctype_digit($timestamp) || abs(time() - (int)$timestamp) > 300) fail(403);
if (!preg_match('~^(images/[a-f0-9-]+-(400|800|1600)\.webp|private/[a-f0-9-]+\.(stl|3mf|step|stp|obj|zip|pdf|png|jpg|jpeg))$~D', $key)) fail(400);
$body = file_get_contents('php://input', false, null, 0, 20971521);
if ($body === false || strlen($body) > 20971520) fail(413);
$expected = hash_hmac('sha256', "$action\n$key\n$timestamp\n" . hash('sha256', $body), $config['secret']);
if (!hash_equals($expected, $signature)) fail(403);
$isPrivate = str_starts_with($key, 'private/');
$root = $isPrivate ? $config['private_root'] : __DIR__ . '/images';
if (!is_dir($root) && !mkdir($root, $isPrivate ? 0700 : 0755, true)) fail(500);
$realRoot = realpath($root);
if ($isPrivate && str_starts_with($realRoot . '/', realpath(__DIR__) . '/')) fail(503);
$target = $realRoot . '/' . basename($key);
if ($action === 'put') {
    if (!$isPrivate) {
        $image = @getimagesizefromstring($body);
        if (!$image || $image['mime'] !== 'image/webp' || $image[0] > 1600 || $image[1] > 1600) fail(400);
    }
    $file = @fopen($target, 'xb');
    if (!$file) fail(409);
    $written = fwrite($file, $body); fclose($file);
    if ($written !== strlen($body)) { @unlink($target); fail(500); }
    chmod($target, $isPrivate ? 0600 : 0644);
    header('Content-Type: application/json'); echo '{"ok":true}';
} elseif ($action === 'get') {
    if (!is_file($target)) fail(404);
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="download"');
    readfile($target);
} else {
    if (is_file($target) && !unlink($target)) fail(500);
    header('Content-Type: application/json'); echo '{"ok":true}';
}

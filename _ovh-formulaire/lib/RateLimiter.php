<?php
declare(strict_types=1);

namespace CitForm;

use RuntimeException;

function ensureRateDirectory(string $directory): void
{
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Protection anti-abus indisponible.');
    }
}

function loadOrCreateRateSecret(string $directory): string
{
    ensureRateDirectory($directory);
    $secretFile = $directory . '/rate-secret';

    if (is_file($secretFile)) {
        $secret = trim((string) file_get_contents($secretFile));
        if (strlen($secret) >= 64) {
            return $secret;
        }
    }

    $secret = bin2hex(random_bytes(32));
    if (file_put_contents($secretFile, $secret, LOCK_EX) === false) {
        throw new RuntimeException('Protection anti-abus indisponible.');
    }
    chmod($secretFile, 0600);
    return $secret;
}

function cleanupExpiredRateFiles(string $directory, int $now, int $lifetime): void
{
    foreach (glob($directory . '/rate-*') ?: [] as $file) {
        if (basename($file) === 'rate-secret' || !is_file($file)) {
            continue;
        }

        $modifiedAt = filemtime($file);
        if ($modifiedAt !== false && $modifiedAt < ($now - $lifetime)) {
            unlink($file);
        }
    }
}

function allowAttempt(
    string $ip,
    string $secret,
    string $directory,
    int $now,
    array $config
): bool {
    ensureRateDirectory($directory);
    cleanupExpiredRateFiles($directory, $now, (int) $config['rate_file_lifetime_seconds']);

    $fingerprint = hash_hmac('sha256', $ip, $secret);
    $rateFile = $directory . '/rate-' . $fingerprint;
    $handle = fopen($rateFile, 'c+');
    if ($handle === false) {
        throw new RuntimeException('Protection anti-abus indisponible.');
    }

    chmod($rateFile, 0600);
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        throw new RuntimeException('Protection anti-abus indisponible.');
    }

    rewind($handle);
    $stored = stream_get_contents($handle);
    $attempts = json_decode($stored !== false ? $stored : '[]', true);
    if (!is_array($attempts)) {
        $attempts = [];
    }

    $windowStart = $now - (int) $config['rate_limit_window_seconds'];
    $attempts = array_values(array_filter(
        $attempts,
        fn(mixed $timestamp): bool => is_int($timestamp) && $timestamp > $windowStart
    ));

    $allowed = count($attempts) < (int) $config['rate_limit_attempts'];
    if ($allowed) {
        $attempts[] = $now;
    }

    rewind($handle);
    ftruncate($handle, 0);
    fwrite($handle, (string) json_encode($attempts, JSON_THROW_ON_ERROR));
    fflush($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    touch($rateFile, $now);

    return $allowed;
}

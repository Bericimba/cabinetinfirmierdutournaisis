<?php
declare(strict_types=1);

namespace CitForm;

use DateTimeImmutable;
use DateTimeZone;
use Throwable;

function responsePayload(int $status, bool $ok, string $message, string $origin = '', array $errors = []): array
{
    $headers = [
        'Vary' => 'Origin',
        'Access-Control-Allow-Methods' => 'POST, OPTIONS',
        'Access-Control-Allow-Headers' => 'Content-Type, Accept',
        'Cache-Control' => 'no-store',
    ];
    if ($origin !== '') {
        $headers['Access-Control-Allow-Origin'] = $origin;
    }

    $payload = ['ok' => $ok, 'message' => $message];
    if ($errors !== []) {
        $payload['errors'] = $errors;
    }

    return ['status' => $status, 'headers' => $headers, 'payload' => $payload];
}

function handleRequest(array $server, array $post, array $config, callable $mailer): array
{
    $origin = is_string($server['HTTP_ORIGIN'] ?? null) ? $server['HTTP_ORIGIN'] : '';
    if (!in_array($origin, $config['allowed_origins'], true)) {
        return responsePayload(403, false, 'Origine non autorisée.');
    }

    $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? ''));
    if ($method === 'OPTIONS') {
        return responsePayload(204, true, '', $origin);
    }
    if ($method !== 'POST') {
        return responsePayload(405, false, 'Méthode non autorisée.', $origin);
    }

    $remoteIp = is_string($server['REMOTE_ADDR'] ?? null) ? $server['REMOTE_ADDR'] : '';
    if (filter_var($remoteIp, FILTER_VALIDATE_IP) === false) {
        return responsePayload(400, false, 'Votre demande ne peut pas être traitée.', $origin);
    }

    try {
        $allowed = allowAttempt(
            $remoteIp,
            (string) $config['rate_secret'],
            (string) $config['rate_dir'],
            time(),
            $config
        );
    } catch (Throwable) {
        return responsePayload(
            503,
            false,
            "Votre demande n'a pas pu être envoyée. Appelez-nous au (+32) 069 30 41 33.",
            $origin
        );
    }

    if (!$allowed) {
        return responsePayload(
            429,
            false,
            'Trop de tentatives. Appelez-nous au (+32) 069 30 41 33.',
            $origin
        );
    }

    $validation = validateSubmission(
        $post,
        new DateTimeImmutable('now', new DateTimeZone('UTC'))
    );
    if ($validation['errors'] !== []) {
        return responsePayload(
            422,
            false,
            'Vérifiez les champs indiqués.',
            $origin,
            $validation['errors']
        );
    }

    if (($config['mail_enabled'] ?? false) !== true) {
        return responsePayload(
            503,
            false,
            "Votre demande n'a pas pu être envoyée. Appelez-nous au (+32) 069 30 41 33.",
            $origin
        );
    }

    $clean = $validation['clean'];
    if ($mailer(buildNotification($clean)) !== true) {
        return responsePayload(
            500,
            false,
            "Votre demande n'a pas pu être envoyée. Appelez-nous au (+32) 069 30 41 33.",
            $origin
        );
    }

    $confirmation = buildConfirmation($clean);
    if ($confirmation !== null) {
        $mailer($confirmation);
    }

    $message = $clean['form_id'] === 'patient'
        ? "Votre demande a bien été reçue. Notre équipe vous contactera par téléphone dans l'heure."
        : "Votre demande a bien été reçue. L'équipe concernée vous répondra dans les meilleurs délais.";

    return responsePayload(200, true, $message, $origin);
}

function renderResponse(array $response, string $accept): array
{
    if ($response['status'] === 204) {
        return ['content_type' => 'text/plain; charset=UTF-8', 'body' => ''];
    }

    if (str_contains(strtolower($accept), 'application/json')) {
        return [
            'content_type' => 'application/json; charset=UTF-8',
            'body' => (string) json_encode(
                $response['payload'],
                JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
            ),
        ];
    }

    $message = htmlspecialchars((string) $response['payload']['message'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $title = ($response['payload']['ok'] ?? false) ? 'Demande reçue' : 'Envoi impossible';
    $statusRole = ($response['payload']['ok'] ?? false) ? 'status' : 'alert';

    $body = '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>CIT — ' . $title . '</title><style>'
        . 'body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;box-sizing:border-box;'
        . 'font-family:"Segoe UI",Calibri,Arial,sans-serif;background:#FDF8FC;color:#2C2A2B}'
        . 'main{width:min(100%,560px);background:#fff;border:1px solid #8DD8D0;border-radius:14px;padding:28px;box-sizing:border-box}'
        . 'h1{font-size:1.6rem;margin:0 0 14px;color:#1A9E8F}p{line-height:1.65;margin:0 0 20px}'
        . 'a{display:inline-flex;min-height:44px;align-items:center;padding:0 22px;border-radius:25px;color:#fff;text-decoration:none;'
        . 'font-weight:700;background:linear-gradient(135deg,#D4187A,#7B4FB5)}'
        . '</style></head><body><main role="' . $statusRole . '" tabindex="-1">'
        . '<h1>' . $title . '</h1><p>' . $message . '</p>'
        . '<a href="https://cabinetinfirmierdutournaisis.be/">Retour au site du CIT</a>'
        . '</main></body></html>';

    return ['content_type' => 'text/html; charset=UTF-8', 'body' => $body];
}

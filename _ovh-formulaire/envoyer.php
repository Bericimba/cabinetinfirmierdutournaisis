<?php
declare(strict_types=1);

use function CitForm\handleRequest;
use function CitForm\loadOrCreateRateSecret;
use function CitForm\renderResponse;

ini_set('display_errors', '0');
error_reporting(E_ALL);

require __DIR__ . '/lib/FormService.php';
require __DIR__ . '/lib/RateLimiter.php';
require __DIR__ . '/lib/HttpResponder.php';

$config = require __DIR__ . '/config.php';
$localConfigFile = __DIR__ . '/config.local.php';
$localConfig = is_file($localConfigFile)
    ? require $localConfigFile
    : ['mail_enabled' => false];
$config = array_replace($config, $localConfig);
$config['rate_dir'] = __DIR__ . '/var';

try {
    $config['rate_secret'] = loadOrCreateRateSecret($config['rate_dir']);

    $mailer = static function (array $message) use ($config): bool {
        $headers = [
            'From: CIT <' . $config['from'] . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
        ];
        if (is_string($message['reply_to'] ?? null) && $message['reply_to'] !== '') {
            $headers[] = 'Reply-To: ' . $message['reply_to'];
        }

        return mail(
            $message['to'],
            $message['subject'],
            $message['body'],
            implode("\r\n", $headers)
        );
    };

    $response = handleRequest($_SERVER, $_POST, $config, $mailer);
} catch (Throwable) {
    $response = [
        'status' => 500,
        'headers' => ['Cache-Control' => 'no-store'],
        'payload' => [
            'ok' => false,
            'message' => "Votre demande n'a pas pu être envoyée. Appelez-nous au (+32) 069 30 41 33.",
        ],
    ];
}

$accept = is_string($_SERVER['HTTP_ACCEPT'] ?? null) ? $_SERVER['HTTP_ACCEPT'] : 'text/html';
$rendered = renderResponse($response, $accept);

http_response_code($response['status']);
foreach ($response['headers'] as $name => $value) {
    header($name . ': ' . $value);
}
header('Content-Type: ' . $rendered['content_type']);
echo $rendered['body'];

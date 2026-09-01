<?php
declare(strict_types=1);

$serviceFile = dirname(__DIR__) . '/lib/FormService.php';
if (!is_file($serviceFile)) {
    fwrite(STDERR, "FAIL: FormService.php n'existe pas encore.\n");
    exit(1);
}

require $serviceFile;

$rateLimiterFile = dirname(__DIR__) . '/lib/RateLimiter.php';
$httpResponderFile = dirname(__DIR__) . '/lib/HttpResponder.php';
if (!is_file($rateLimiterFile) || !is_file($httpResponderFile)) {
    fwrite(STDERR, "FAIL: la protection anti-spam et la réponse HTTP n'existent pas encore.\n");
    exit(1);
}

require $rateLimiterFile;
require $httpResponderFile;

use function CitForm\buildConfirmation;
use function CitForm\buildNotification;
use function CitForm\handleRequest;
use function CitForm\allowAttempt;
use function CitForm\renderResponse;
use function CitForm\routeFor;
use function CitForm\validateSubmission;

$passed = 0;
$failed = 0;

function runTest(string $name, callable $test): void
{
    global $passed, $failed;

    try {
        $test();
        $passed++;
        fwrite(STDOUT, "PASS: {$name}\n");
    } catch (Throwable $error) {
        $failed++;
        fwrite(STDERR, "FAIL: {$name} — {$error->getMessage()}\n");
    }
}

function assertSameValue(mixed $expected, mixed $actual): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(
            'attendu ' . var_export($expected, true) . ', reçu ' . var_export($actual, true)
        );
    }
}

function assertContainsText(string $needle, string $haystack): void
{
    if (!str_contains($haystack, $needle)) {
        throw new RuntimeException("texte absent : {$needle}");
    }
}

function assertNotContainsText(string $needle, string $haystack): void
{
    if (str_contains($haystack, $needle)) {
        throw new RuntimeException("texte confidentiel recopié : {$needle}");
    }
}

function assertThrows(callable $operation): void
{
    try {
        $operation();
    } catch (Throwable) {
        return;
    }

    throw new RuntimeException('exception attendue mais absente');
}

function assertFileDoesNotContain(string $directory, string $needle): void
{
    foreach (glob($directory . '/*') ?: [] as $file) {
        if (is_file($file) && str_contains((string) file_get_contents($file), $needle)) {
            throw new RuntimeException("donnée technique stockée en clair : {$needle}");
        }
        if (str_contains(basename($file), $needle)) {
            throw new RuntimeException("donnée technique présente dans un nom de fichier : {$needle}");
        }
    }
}

function removeTestDirectory(string $directory): void
{
    foreach (glob($directory . '/*') ?: [] as $file) {
        if (is_file($file)) {
            unlink($file);
        }
    }
    if (is_dir($directory)) {
        rmdir($directory);
    }
}

function httpConfig(array $changes = []): array
{
    $directory = sys_get_temp_dir() . '/cit-http-' . bin2hex(random_bytes(6));
    return array_replace([
        'allowed_origins' => [
            'https://cabinetinfirmierdutournaisis.be',
            'https://www.cabinetinfirmierdutournaisis.be',
        ],
        'from' => 'formulaire@cabinetinfirmierdutournaisis.be',
        'mail_enabled' => true,
        'rate_dir' => $directory,
        'rate_secret' => bin2hex(random_bytes(32)),
        'rate_limit_attempts' => 5,
        'rate_limit_window_seconds' => 900,
        'rate_file_lifetime_seconds' => 3600,
    ], $changes);
}

function validServer(array $changes = []): array
{
    return array_replace([
        'REQUEST_METHOD' => 'POST',
        'HTTP_ORIGIN' => 'https://cabinetinfirmierdutournaisis.be',
        'HTTP_ACCEPT' => 'application/json',
        'REMOTE_ADDR' => '192.0.2.10',
    ], $changes);
}

function validPatient(array $changes = []): array
{
    return array_replace([
        'form_id' => 'patient',
        'nom' => 'Marie Dupont',
        'telephone' => '+32 69 30 41 33',
        'email' => '',
        'type_soin' => 'Pansement / Plaie',
        'lieu' => ['Domicile'],
        'date_souhaitee' => '2026-09-02',
        'message' => 'Sonnez deux fois.',
        'accord' => '1',
        'website' => '',
        'started_at' => '1788263990',
    ], $changes);
}

function validProfessional(array $changes = []): array
{
    return array_replace([
        'form_id' => 'professionnel',
        'nom' => 'Jean Infirmier',
        'telephone' => '+32 470 00 00 00',
        'email' => '',
        'type_demande' => 'Remplacement régulier',
        'message' => 'Disponibilités en septembre.',
        'accord' => '1',
        'website' => '',
        'started_at' => '1788263990',
    ], $changes);
}

$now = new DateTimeImmutable('2026-09-01T12:00:00+00:00');

runTest('accepte une demande patient sans adresse e-mail', function () use ($now): void {
    $result = validateSubmission(validPatient(), $now);
    assertSameValue([], $result['errors']);
    assertSameValue('', $result['clean']['email']);
});

runTest('nettoie le nom et le message avant utilisation', function () use ($now): void {
    $result = validateSubmission(validPatient([
        'nom' => '  <b>Marie</b>   Dupont  ',
        'message' => "  <script>alerte</script> Sonnez.  ",
    ]), $now);
    assertSameValue('Marie Dupont', $result['clean']['nom']);
    assertSameValue('alerte Sonnez.', $result['clean']['message']);
});

runTest('route exclusivement chaque formulaire vers sa boîte fixe', function (): void {
    assertSameValue('info@cabinetinfirmierdutournaisis.be', routeFor('patient')['to']);
    assertSameValue('direction@cabinetinfirmierdutournaisis.be', routeFor('professionnel')['to']);
    assertThrows(fn() => routeFor('info@attaquant.example'));
});

runTest('refuse un type de soin hors liste', function () use ($now): void {
    $result = validateSubmission(validPatient(['type_soin' => 'Soin arbitraire']), $now);
    assertSameValue('Type de soin non valide.', $result['errors']['type_soin']);
});

runTest('refuse un type de demande professionnelle hors liste', function () use ($now): void {
    $result = validateSubmission(validProfessional(['type_demande' => 'Demande arbitraire']), $now);
    assertSameValue('Type de demande non valide.', $result['errors']['type_demande']);
});

runTest('refuse une date patient passée', function () use ($now): void {
    $result = validateSubmission(validPatient(['date_souhaitee' => '2026-08-31']), $now);
    assertSameValue('Choisissez une date à partir du 1er septembre 2026.', $result['errors']['date_souhaitee']);
});

runTest('refuse une demande sans accord de confidentialité', function () use ($now): void {
    $result = validateSubmission(validPatient(['accord' => '']), $now);
    assertSameValue('Votre accord est nécessaire.', $result['errors']['accord']);
});

runTest('refuse un téléphone trop court', function () use ($now): void {
    $result = validateSubmission(validPatient(['telephone' => '123']), $now);
    assertSameValue('Numéro de téléphone non valide.', $result['errors']['telephone']);
});

runTest('refuse une adresse e-mail invalide', function () use ($now): void {
    $result = validateSubmission(validPatient(['email' => 'adresse-invalide']), $now);
    assertSameValue('Adresse e-mail non valide.', $result['errors']['email']);
});

runTest('refuse une tentative d’injection dans l’adresse e-mail', function () use ($now): void {
    $result = validateSubmission(validPatient([
        'email' => "patient@example.be\r\nBcc: attaquant@example.be",
    ]), $now);
    assertSameValue('Adresse e-mail non valide.', $result['errors']['email']);
});

runTest('refuse un message patient de plus de 500 caractères', function () use ($now): void {
    $result = validateSubmission(validPatient(['message' => str_repeat('a', 501)]), $now);
    assertSameValue('Le message est limité à 500 caractères.', $result['errors']['message']);
});

runTest('refuse un message professionnel de plus de 1000 caractères', function () use ($now): void {
    $result = validateSubmission(validProfessional(['message' => str_repeat('a', 1001)]), $now);
    assertSameValue('Le message est limité à 1000 caractères.', $result['errors']['message']);
});

runTest('refuse une soumission remplie par un robot', function () use ($now): void {
    $result = validateSubmission(validPatient(['website' => 'https://robot.example']), $now);
    assertSameValue('Votre demande ne peut pas être traitée.', $result['errors']['formulaire']);
});

runTest('refuse une soumission JavaScript trop rapide', function () use ($now): void {
    $result = validateSubmission(validPatient(['started_at' => '1788263999']), $now);
    assertSameValue('Votre demande ne peut pas être traitée.', $result['errors']['formulaire']);
});

runTest('accepte le secours sans JavaScript sans horodatage', function () use ($now): void {
    $result = validateSubmission(validPatient(['started_at' => '']), $now);
    assertSameValue([], $result['errors']);
});

runTest('crée une notification patient complète pour le cabinet', function () use ($now): void {
    $result = validateSubmission(validPatient(['email' => 'marie@example.be']), $now);
    $notification = buildNotification($result['clean']);
    assertSameValue('info@cabinetinfirmierdutournaisis.be', $notification['to']);
    assertSameValue('marie@example.be', $notification['reply_to']);
    assertContainsText('Pansement / Plaie', $notification['body']);
    assertContainsText('Sonnez deux fois.', $notification['body']);
});

runTest('ne crée aucune confirmation si l’e-mail est absent', function () use ($now): void {
    $result = validateSubmission(validPatient(), $now);
    assertSameValue(null, buildConfirmation($result['clean']));
});

runTest('la confirmation patient ne recopie aucune donnée médicale', function () use ($now): void {
    $result = validateSubmission(validPatient(['email' => 'marie@example.be']), $now);
    $confirmation = buildConfirmation($result['clean']);
    assertSameValue('marie@example.be', $confirmation['to']);
    assertSameValue('info@cabinetinfirmierdutournaisis.be', $confirmation['reply_to']);
    assertContainsText("contactera par téléphone dans l'heure", $confirmation['body']);
    assertContainsText('appelez le 112', $confirmation['body']);
    assertNotContainsText('Pansement / Plaie', $confirmation['body']);
    assertNotContainsText('Domicile', $confirmation['body']);
    assertNotContainsText('2026-09-02', $confirmation['body']);
    assertNotContainsText('Sonnez deux fois.', $confirmation['body']);
});

runTest('la confirmation professionnelle reste générique', function () use ($now): void {
    $result = validateSubmission(validProfessional(['email' => 'jean@example.be']), $now);
    $confirmation = buildConfirmation($result['clean']);
    assertSameValue('direction@cabinetinfirmierdutournaisis.be', $confirmation['reply_to']);
    assertContainsText('dans les meilleurs délais', $confirmation['body']);
    assertNotContainsText('Remplacement régulier', $confirmation['body']);
    assertNotContainsText('Disponibilités en septembre.', $confirmation['body']);
});

runTest('autorise cinq tentatives puis bloque la sixième pendant quinze minutes', function (): void {
    $directory = sys_get_temp_dir() . '/cit-rate-' . bin2hex(random_bytes(6));
    $secret = bin2hex(random_bytes(32));
    $config = [
        'rate_limit_attempts' => 5,
        'rate_limit_window_seconds' => 900,
        'rate_file_lifetime_seconds' => 3600,
    ];

    try {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            assertSameValue(true, allowAttempt('192.0.2.10', $secret, $directory, 1788264000, $config));
        }
        assertSameValue(false, allowAttempt('192.0.2.10', $secret, $directory, 1788264000, $config));
        assertSameValue(true, allowAttempt('192.0.2.10', $secret, $directory, 1788264961, $config));
        assertFileDoesNotContain($directory, '192.0.2.10');
    } finally {
        removeTestDirectory($directory);
    }
});

runTest('répond 204 à la préparation CORS du site CIT', function (): void {
    $config = httpConfig();
    try {
        $response = handleRequest(
            validServer(['REQUEST_METHOD' => 'OPTIONS']),
            [],
            $config,
            fn(array $message): bool => true
        );
        assertSameValue(204, $response['status']);
        assertSameValue(
            'https://cabinetinfirmierdutournaisis.be',
            $response['headers']['Access-Control-Allow-Origin']
        );
    } finally {
        removeTestDirectory($config['rate_dir']);
    }
});

runTest('refuse les méthodes autres que POST et OPTIONS', function (): void {
    $config = httpConfig();
    try {
        $response = handleRequest(
            validServer(['REQUEST_METHOD' => 'GET']),
            [],
            $config,
            fn(array $message): bool => true
        );
        assertSameValue(405, $response['status']);
    } finally {
        removeTestDirectory($config['rate_dir']);
    }
});

runTest('refuse une origine extérieure au site CIT', function (): void {
    $config = httpConfig();
    try {
        $response = handleRequest(
            validServer(['HTTP_ORIGIN' => 'https://attaquant.example']),
            validPatient(['date_souhaitee' => '2099-01-01', 'started_at' => '']),
            $config,
            fn(array $message): bool => true
        );
        assertSameValue(403, $response['status']);
    } finally {
        removeTestDirectory($config['rate_dir']);
    }
});

runTest('transmet une demande patient valide au transport injecté', function (): void {
    $config = httpConfig();
    $messages = [];
    $mailer = function (array $message) use (&$messages): bool {
        $messages[] = $message;
        return true;
    };

    try {
        $response = handleRequest(
            validServer(),
            validPatient(['date_souhaitee' => '2099-01-01', 'started_at' => '']),
            $config,
            $mailer
        );
        assertSameValue(200, $response['status']);
        assertSameValue(true, $response['payload']['ok']);
        assertSameValue(1, count($messages));
        assertSameValue('info@cabinetinfirmierdutournaisis.be', $messages[0]['to']);
    } finally {
        removeTestDirectory($config['rate_dir']);
    }
});

runTest('envoie une confirmation distincte uniquement avec un e-mail valide', function (): void {
    $config = httpConfig();
    $messages = [];
    $mailer = function (array $message) use (&$messages): bool {
        $messages[] = $message;
        return true;
    };

    try {
        $response = handleRequest(
            validServer(),
            validPatient([
                'date_souhaitee' => '2099-01-01',
                'started_at' => '',
                'email' => 'marie@example.be',
            ]),
            $config,
            $mailer
        );
        assertSameValue(200, $response['status']);
        assertSameValue(2, count($messages));
        assertSameValue('marie@example.be', $messages[1]['to']);
        assertNotContainsText('Pansement / Plaie', $messages[1]['body']);
        assertNotContainsText('Sonnez deux fois.', $messages[1]['body']);
    } finally {
        removeTestDirectory($config['rate_dir']);
    }
});

runTest('bloque tout transport lorsque les e-mails sont désactivés', function (): void {
    $config = httpConfig(['mail_enabled' => false]);
    $calls = 0;

    try {
        $response = handleRequest(
            validServer(),
            validPatient(['date_souhaitee' => '2099-01-01', 'started_at' => '']),
            $config,
            function (array $message) use (&$calls): bool {
                $calls++;
                return true;
            }
        );
        assertSameValue(503, $response['status']);
        assertSameValue(0, $calls);
    } finally {
        removeTestDirectory($config['rate_dir']);
    }
});

runTest('la réponse HTML de secours reste générique et indique le téléphone', function (): void {
    $response = [
        'status' => 500,
        'headers' => [],
        'payload' => [
            'ok' => false,
            'message' => "Votre demande n'a pas pu être envoyée. Appelez-nous au (+32) 069 30 41 33.",
        ],
    ];
    $rendered = renderResponse($response, 'text/html');
    assertSameValue('text/html; charset=UTF-8', $rendered['content_type']);
    assertContainsText('(+32) 069 30 41 33', $rendered['body']);
    assertNotContainsText('/home/', $rendered['body']);
    assertNotContainsText('FormService.php', $rendered['body']);
});

fwrite(STDOUT, "\nRésultat : {$passed} test(s) réussi(s), {$failed} échec(s).\n");
exit($failed === 0 ? 0 : 1);

<?php
declare(strict_types=1);

$serviceFile = dirname(__DIR__) . '/lib/FormService.php';
if (!is_file($serviceFile)) {
    fwrite(STDERR, "FAIL: FormService.php n'existe pas encore.\n");
    exit(1);
}

require $serviceFile;

use function CitForm\buildConfirmation;
use function CitForm\buildNotification;
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
    assertContainsText('dans les meilleurs délais', $confirmation['body']);
    assertNotContainsText('Remplacement régulier', $confirmation['body']);
    assertNotContainsText('Disponibilités en septembre.', $confirmation['body']);
});

fwrite(STDOUT, "\nRésultat : {$passed} test(s) réussi(s), {$failed} échec(s).\n");
exit($failed === 0 ? 0 : 1);

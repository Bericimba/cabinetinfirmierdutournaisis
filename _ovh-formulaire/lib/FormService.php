<?php
declare(strict_types=1);

namespace CitForm;

use DateTimeImmutable;
use InvalidArgumentException;

const PATIENT_CARE_TYPES = [
    'Injection / Perfusion / Vaccin',
    'Pansement / Plaie',
    'Prise de sang',
    'Suivi maladie chronique',
    'Soins post-opératoires',
    'Soins palliatifs',
    'Soins esthétiques (Léa)',
    'Remplacement infirmier',
    'Tarification infirmière',
    'Autre',
];

const PROFESSIONAL_REQUEST_TYPES = [
    "Remplacement d'urgence",
    'Remplacement congé planifié',
    'Remplacement régulier',
    'Service de tarification INAMI',
    'Autre',
];

const CARE_LOCATIONS = ['Domicile', 'Dispensaire'];

function cleanSingleLine(mixed $value): string
{
    if (!is_string($value)) {
        return '';
    }

    $clean = trim(strip_tags($value));
    return preg_replace('/\s+/u', ' ', $clean) ?? '';
}

function cleanMessage(mixed $value): string
{
    if (!is_string($value)) {
        return '';
    }

    $clean = trim(strip_tags(str_replace(["\r\n", "\r"], "\n", $value)));
    return preg_replace('/[ \t]+/u', ' ', $clean) ?? '';
}

function textLength(string $value): int
{
    $result = preg_match_all('/./us', $value, $characters);
    return $result === false ? strlen($value) : $result;
}

function frenchDate(DateTimeImmutable $date): string
{
    $months = [
        1 => 'janvier', 2 => 'février', 3 => 'mars', 4 => 'avril',
        5 => 'mai', 6 => 'juin', 7 => 'juillet', 8 => 'août',
        9 => 'septembre', 10 => 'octobre', 11 => 'novembre', 12 => 'décembre',
    ];

    $day = (int) $date->format('j');
    $dayLabel = $day === 1 ? '1er' : (string) $day;
    return $dayLabel . ' ' . $months[(int) $date->format('n')] . ' ' . $date->format('Y');
}

function validateSubmission(array $input, DateTimeImmutable $now): array
{
    $formId = cleanSingleLine($input['form_id'] ?? '');
    $clean = [
        'form_id' => $formId,
        'nom' => cleanSingleLine($input['nom'] ?? ''),
        'telephone' => cleanSingleLine($input['telephone'] ?? ''),
        'email' => cleanSingleLine($input['email'] ?? ''),
        'message' => cleanMessage($input['message'] ?? ''),
    ];
    $errors = [];

    if (!in_array($formId, ['patient', 'professionnel'], true)) {
        $errors['formulaire'] = 'Votre demande ne peut pas être traitée.';
    }

    if (textLength($clean['nom']) < 2 || textLength($clean['nom']) > 100) {
        $errors['nom'] = 'Indiquez un nom et un prénom valides.';
    }

    $phoneLength = textLength($clean['telephone']);
    if (
        $phoneLength < 6
        || $phoneLength > 30
        || preg_match('/^[0-9+().\/\s-]+$/u', $clean['telephone']) !== 1
    ) {
        $errors['telephone'] = 'Numéro de téléphone non valide.';
    }

    if ($clean['email'] !== '') {
        if (
            textLength($clean['email']) > 254
            || str_contains($clean['email'], "\r")
            || str_contains($clean['email'], "\n")
            || filter_var($clean['email'], FILTER_VALIDATE_EMAIL) === false
        ) {
            $errors['email'] = 'Adresse e-mail non valide.';
        }
    }

    if (($input['accord'] ?? '') !== '1') {
        $errors['accord'] = 'Votre accord est nécessaire.';
    }

    if (cleanSingleLine($input['website'] ?? '') !== '') {
        $errors['formulaire'] = 'Votre demande ne peut pas être traitée.';
    }

    $startedAt = cleanSingleLine($input['started_at'] ?? '');
    if ($startedAt !== '') {
        if (!ctype_digit($startedAt)) {
            $errors['formulaire'] = 'Votre demande ne peut pas être traitée.';
        } else {
            $formAge = $now->getTimestamp() - (int) $startedAt;
            if ($formAge < 3 || $formAge > 7200) {
                $errors['formulaire'] = 'Votre demande ne peut pas être traitée.';
            }
        }
    }

    if ($formId === 'patient') {
        $clean['type_soin'] = cleanSingleLine($input['type_soin'] ?? '');
        if (!in_array($clean['type_soin'], PATIENT_CARE_TYPES, true)) {
            $errors['type_soin'] = 'Type de soin non valide.';
        }

        $locations = is_array($input['lieu'] ?? null) ? $input['lieu'] : [];
        $clean['lieu'] = array_values(array_unique(array_filter(
            array_map('CitForm\\cleanSingleLine', $locations),
            fn(string $location): bool => in_array($location, CARE_LOCATIONS, true)
        )));
        if ($clean['lieu'] === [] || count($clean['lieu']) !== count($locations)) {
            $errors['lieu'] = 'Choisissez le domicile, le dispensaire ou les deux.';
        }

        $clean['date_souhaitee'] = cleanSingleLine($input['date_souhaitee'] ?? '');
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $clean['date_souhaitee']);
        $today = $now->setTime(0, 0);
        if ($date === false || $date->format('Y-m-d') !== $clean['date_souhaitee'] || $date < $today) {
            $errors['date_souhaitee'] = 'Choisissez une date à partir du ' . frenchDate($today) . '.';
        }

        if (textLength($clean['message']) > 500) {
            $errors['message'] = 'Le message est limité à 500 caractères.';
        }
    }

    if ($formId === 'professionnel') {
        $clean['type_demande'] = cleanSingleLine($input['type_demande'] ?? '');
        if (!in_array($clean['type_demande'], PROFESSIONAL_REQUEST_TYPES, true)) {
            $errors['type_demande'] = 'Type de demande non valide.';
        }

        if (textLength($clean['message']) > 1000) {
            $errors['message'] = 'Le message est limité à 1000 caractères.';
        }
    }

    return ['clean' => $clean, 'errors' => $errors];
}

function routeFor(string $formId): array
{
    return match ($formId) {
        'patient' => [
            'to' => 'info@cabinetinfirmierdutournaisis.be',
            'subject' => 'CIT - Nouvelle demande de soins',
        ],
        'professionnel' => [
            'to' => 'direction@cabinetinfirmierdutournaisis.be',
            'subject' => 'CIT - Nouvelle demande professionnelle',
        ],
        default => throw new InvalidArgumentException('Formulaire non reconnu.'),
    };
}

function buildNotification(array $clean): array
{
    $route = routeFor($clean['form_id']);
    $lines = [
        'Nom : ' . $clean['nom'],
        'Téléphone : ' . $clean['telephone'],
        'E-mail : ' . ($clean['email'] !== '' ? $clean['email'] : 'Non renseigné'),
    ];

    if ($clean['form_id'] === 'patient') {
        $lines[] = 'Type de soin : ' . $clean['type_soin'];
        $lines[] = 'Lieu : ' . implode(' + ', $clean['lieu']);
        $lines[] = 'Date souhaitée : ' . $clean['date_souhaitee'];
    } else {
        $lines[] = 'Type de demande : ' . $clean['type_demande'];
    }

    $lines[] = 'Message : ' . ($clean['message'] !== '' ? $clean['message'] : 'Aucun');

    return [
        'to' => $route['to'],
        'subject' => $route['subject'],
        'body' => implode("\n", $lines),
        'reply_to' => $clean['email'] !== '' ? $clean['email'] : null,
    ];
}

function buildConfirmation(array $clean): ?array
{
    if ($clean['email'] === '') {
        return null;
    }

    $body = $clean['form_id'] === 'patient'
        ? "Votre demande a bien été reçue. Notre équipe vous contactera par téléphone dans l'heure. En cas d'urgence vitale, appelez le 112."
        : "Votre demande a bien été reçue. L'équipe responsable des remplacements et de la tarification vous répondra dans les meilleurs délais.";

    return [
        'to' => $clean['email'],
        'subject' => 'CIT — Votre demande a bien été reçue',
        'body' => $body,
        'reply_to' => null,
    ];
}

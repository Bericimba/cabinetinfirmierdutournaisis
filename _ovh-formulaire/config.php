<?php
declare(strict_types=1);

return [
    'allowed_origins' => [
        'https://cabinetinfirmierdutournaisis.be',
        'https://www.cabinetinfirmierdutournaisis.be',
    ],
    'from' => 'formulaire@cabinetinfirmierdutournaisis.be',
    'patient_to' => 'info@cabinetinfirmierdutournaisis.be',
    'professionnel_to' => 'direction@cabinetinfirmierdutournaisis.be',
    'min_fill_seconds' => 3,
    'max_form_age_seconds' => 7200,
    'rate_limit_attempts' => 5,
    'rate_limit_window_seconds' => 900,
    'rate_file_lifetime_seconds' => 3600,
];

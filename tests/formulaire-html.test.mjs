import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const patientSection = index.match(/<!-- RDV -->([\s\S]*?)<\/section>/)?.[1] ?? '';

test('le formulaire patient dispose d’un secours HTML vers OVH', () => {
  assert.match(patientSection, /<form[^>]+id="rdv-form"/);
  assert.match(
    patientSection,
    /action="https:\/\/formulaire\.cabinetinfirmierdutournaisis\.be\/envoyer\.php"/
  );
  assert.match(patientSection, /method="post"/);
  assert.match(patientSection, /name="form_id"\s+value="patient"/);
});

test('le téléphone reste obligatoire et l’e-mail reste facultatif', () => {
  assert.match(patientSection, /id="rdv-tel"[^>]+name="telephone"[^>]+required/);
  assert.match(patientSection, /id="rdv-email"[^>]+name="email"/);
  assert.doesNotMatch(patientSection, /id="rdv-email"[^>]+required/);
  assert.match(patientSection, /autocomplete="tel"/);
  assert.match(patientSection, /autocomplete="email"/);
});

test('les données utiles et l’accord sont encadrés', () => {
  assert.match(patientSection, /name="type_soin"[^>]+required/);
  assert.match(patientSection, /name="lieu\[\]"\s+value="Domicile"/);
  assert.match(patientSection, /name="lieu\[\]"\s+value="Dispensaire"/);
  assert.match(patientSection, /name="date_souhaitee"[^>]+required/);
  assert.match(patientSection, /name="message"[^>]+maxlength="500"/);
  assert.match(patientSection, /name="accord"[^>]+required/);
  assert.match(patientSection, /mentions\.html#donnees/);
});

test('l’avertissement médical et le résultat accessible sont présents', () => {
  assert.match(patientSection, /N'indiquez aucune information médicale dans ce champ\./);
  assert.match(patientSection, /data-form-result/);
  assert.match(patientSection, /tabindex="-1"/);
});

test('le bouton patient ne déclenche plus de redirection mailto', () => {
  assert.doesNotMatch(patientSection, /window\.location\.href='mailto:info@/);
  assert.match(index, /<script type="module" src="formulaire\.js"><\/script>/);
});

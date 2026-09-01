import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const patientSection = index.match(/<!-- RDV -->([\s\S]*?)<\/section>/)?.[1] ?? '';
const replacement = readFileSync(new URL('../remplacement.html', import.meta.url), 'utf8');
const professionalSection = replacement.match(/<!-- CTA CONTACT -->([\s\S]*?)<\/section>/)?.[1] ?? '';
const mentions = readFileSync(new URL('../mentions.html', import.meta.url), 'utf8');
const hostingSection = mentions.match(/id="hebergement"([\s\S]*?)id="propriete"/)?.[1] ?? '';
const privacySection = mentions.match(/id="donnees"([\s\S]*?)id="droits"/)?.[1] ?? '';

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

test('le formulaire professionnel dispose du même secours HTML vers OVH', () => {
  assert.match(professionalSection, /<form[^>]+id="remplacement-form"/);
  assert.match(
    professionalSection,
    /action="https:\/\/formulaire\.cabinetinfirmierdutournaisis\.be\/envoyer\.php"/
  );
  assert.match(professionalSection, /method="post"/);
  assert.match(professionalSection, /name="form_id"\s+value="professionnel"/);
});

test('le contact professionnel conserve téléphone obligatoire et e-mail facultatif', () => {
  assert.match(professionalSection, /id="r-tel"[^>]+name="telephone"[^>]+required/);
  assert.match(professionalSection, /id="r-email"[^>]+name="email"/);
  assert.doesNotMatch(professionalSection, /id="r-email"[^>]+required/);
  assert.match(professionalSection, /autocomplete="tel"/);
  assert.match(professionalSection, /autocomplete="email"/);
});

test('la demande professionnelle et son accord sont encadrés', () => {
  assert.match(professionalSection, /name="type_demande"[^>]+required/);
  assert.match(professionalSection, /name="message"[^>]+maxlength="1000"/);
  assert.match(professionalSection, /name="accord"[^>]+required/);
  assert.match(professionalSection, /mentions\.html#donnees/);
  assert.match(
    professionalSection,
    /N'indiquez aucun nom de patient ni aucune information médicale dans ce champ\./
  );
});

test('le résultat professionnel est accessible sans ancien bouton mailto', () => {
  assert.match(professionalSection, /data-form-result/);
  assert.match(professionalSection, /tabindex="-1"/);
  assert.doesNotMatch(professionalSection, /window\.location\.href='mailto:direction@/);
  assert.match(replacement, /<script type="module" src="formulaire\.js"><\/script>/);
});

test('les hébergeurs du site et des formulaires sont nommés précisément', () => {
  assert.match(hostingSection, /GitHub Pages/);
  assert.match(hostingSection, /OVHcloud/);
  assert.doesNotMatch(hostingSection, /hébergé par un prestataire externe/);
});

test('les mentions décrivent exactement les données et le routage des formulaires', () => {
  assert.match(privacySection, /adresse e-mail (?:est )?facultative/i);
  assert.match(privacySection, /type de soin/i);
  assert.match(privacySection, /info@cabinetinfirmierdutournaisis\.be/);
  assert.match(privacySection, /direction@cabinetinfirmierdutournaisis\.be/);
  assert.match(privacySection, /confirmation générique/i);
});

test('les mentions décrivent la protection anti-abus et la conservation réelle', () => {
  assert.match(privacySection, /empreinte[^<]*adresse IP/i);
  assert.match(privacySection, /une heure/i);
  assert.match(privacySection, /aucune base de données/i);
  assert.match(privacySection, /maximum 1 an/i);
  assert.match(privacySection, /href="#droits"/);
});

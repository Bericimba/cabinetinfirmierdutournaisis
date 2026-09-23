import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function file(name) {
  return readFile(new URL(name, root), 'utf8');
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1];
}

test('les attributs HTML restent séparés sur la page équipe', async () => {
  const html = await file('equipe.html');
  assert.doesNotMatch(html, /class="nav-btn"onclick=/);
});

test('les six profils dépliables exposent leur état et leur contenu', async () => {
  const html = await file('equipe.html');
  const names = ['celine', 'louise', 'melissa', 'jordan', 'peter', 'lea'];

  for (const name of names) {
    assert.match(html, new RegExp(`<div id="${name}-plus"[^>]*style="display:none;"`));
    const button = html.match(new RegExp(`<button\\b[^>]*aria-controls="${name}-plus"[^>]*>`))?.[0];
    assert.ok(button, `${name}: bouton absent`);
    assert.equal(attribute(button, 'type'), 'button');
    assert.equal(attribute(button, 'aria-expanded'), 'false');
  }

  assert.match(html, /setAttribute\('aria-expanded','true'\)/);
  assert.match(html, /setAttribute\('aria-expanded','false'\)/);
});

test('les filtres du blog et de l équipe annoncent la sélection', async () => {
  for (const [name, className, count] of [
    ['blog.html', 'cat-btn', 3],
    ['equipe.html', 'filtre-btn', 5],
  ]) {
    const html = await file(name);
    const buttons = [...html.matchAll(new RegExp(`<button\\b[^>]*class="[^"]*${className}[^"]*"[^>]*>`, 'g'))]
      .map((match) => match[0]);
    assert.equal(buttons.length, count, name);
    assert.ok(buttons.every((button) => attribute(button, 'type') === 'button'), name);
    assert.equal(buttons.filter((button) => attribute(button, 'aria-pressed') === 'true').length, 1, name);
    assert.equal(buttons.filter((button) => attribute(button, 'aria-pressed') === 'false').length, count - 1, name);
    assert.match(html, /setAttribute\('aria-pressed','true'\)/, name);
    assert.match(html, /setAttribute\('aria-pressed','false'\)/, name);
  }
});

test('les cinq boutons audio ont un nom et un état accessibles', async () => {
  for (const name of ['index.html', 'blog.html', 'dispensaire.html', 'equipe.html', 'remplacement.html']) {
    const html = await file(name);
    const button = html.match(/<button\b[^>]*id="audio-btn"[^>]*>/)?.[0];
    assert.ok(button, name);
    assert.equal(attribute(button, 'type'), 'button', name);
    assert.equal(attribute(button, 'aria-label'), 'Activer la musique', name);
    assert.equal(attribute(button, 'aria-pressed'), 'false', name);
    assert.match(html, /setAttribute\('aria-label','Désactiver la musique'\)/, name);
    assert.match(html, /setAttribute\('aria-label','Activer la musique'\)/, name);
    assert.match(html, /setAttribute\('aria-pressed','true'\)/, name);
    assert.match(html, /setAttribute\('aria-pressed','false'\)/, name);
  }
});

test('le résumé destiné aux assistants correspond aux seize questions de la FAQ', async () => {
  const llms = await file('llms.txt');
  const faq = await file('faq-soins-infirmiers.html');
  assert.equal([...faq.matchAll(/class="faq-question"/g)].length, 16);
  assert.match(llms, /16 questions-réponses/);
  assert.doesNotMatch(llms, /14 questions-réponses/);
});

test('la FAQ décrit correctement les prescriptions et remboursements belges', async () => {
  const faq = await file('faq-soins-infirmiers.html');
  const prescription = 'Une prescription est nécessaire pour les actes qui l’exigent légalement. Elle n’est plus exigée pour les soins de plaies remboursables, sauf pour certains actes connexes qui restent soumis à prescription. Contactez le cabinet pour vérifier les documents requis pour votre soin.';
  const reimbursement = 'Les prestations infirmières reprises dans la nomenclature de l’INAMI et réalisées selon ses conditions sont remboursées par l’assurance obligatoire soins de santé. Selon le soin, une part peut rester à charge du patient. Le cabinet peut vérifier votre situation avec votre mutualité.';

  assert.equal(faq.split(prescription).length - 1, 2);
  assert.equal(faq.split(reimbursement).length - 1, 2);
  assert.doesNotMatch(faq, /pansements, injections, perfusions, soins de plaies ou soins post-opératoires/);
  assert.doesNotMatch(faq, /La majorité des soins prescrits peuvent être pris en charge/);
});

test('les fichiers locaux et anti-abus du formulaire OVH restent exclus de Git', async () => {
  const ignore = await file('_ovh-formulaire/.gitignore');
  assert.match(ignore, /^config\.local\.php$/m);
  assert.match(ignore, /^var\/rate-\*$/m);
  assert.match(ignore, /^var\/rate-secret$/m);
});

test('les mentions légales décrivent l entreprise et les traitements réels', async () => {
  const mentions = await file('mentions.html');

  assert.match(mentions, /<strong>Forme juridique :<\/strong> Société à responsabilité limitée \(SRL\)/);
  assert.match(mentions, /<strong>Numéro d'entreprise BCE :<\/strong> 0832\.195\.365/);
  assert.match(mentions, /<strong>Numéro de TVA :<\/strong> BE0832\.195\.365/);
  assert.match(mentions, /<strong>Siège social :<\/strong> Rue du Banc de Pierre \(Bas\), 78 — 7971 Beloeil, Belgique/);
  assert.match(mentions, /<strong>Établissement de Quevaucamps :<\/strong> Avenue de l'Europe, 68 — 7972 Quevaucamps, Belgique/);
  assert.match(mentions, /<strong>Administratrice :<\/strong> Céline Lhoir/);
  assert.doesNotMatch(mentions, /Entreprise individuelle \/ Cabinet infirmier indépendant/);

  assert.match(mentions, /article 9, paragraphe 2, point h du RGPD/);
  assert.match(mentions, /articles 6, paragraphe 1, point a et 9, paragraphe 2, point a du RGPD/);
  assert.match(mentions, /fenêtre de 15 minutes/);
  assert.match(mentions, /au minimum 30 ans et au maximum 50 ans à compter du dernier contact/);
  assert.match(mentions, /<strong>Données de facturation :<\/strong> conservées 10 ans/);
  assert.doesNotMatch(mentions, /conservées 7 ans/);

  assert.match(mentions, /<h2>7\. Stockage local<\/h2>/);
  assert.match(mentions, /stockage local du navigateur \(<code>localStorage<\/code>\)/);
  assert.doesNotMatch(mentions, /Cookie de préférence musicale/);
  assert.match(mentions, /Dernière mise à jour : septembre 2026/);
  assert.match(mentions, /Page mise à jour en septembre 2026/);
  assert.match(mentions, /© <span id="annee-actuelle"><\/span> Cabinet Infirmier du Tournaisis/);
});

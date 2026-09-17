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

test('les fichiers locaux et anti-abus du formulaire OVH restent exclus de Git', async () => {
  const ignore = await file('_ovh-formulaire/.gitignore');
  assert.match(ignore, /^config\.local\.php$/m);
  assert.match(ignore, /^var\/rate-\*$/m);
  assert.match(ignore, /^var\/rate-secret$/m);
});

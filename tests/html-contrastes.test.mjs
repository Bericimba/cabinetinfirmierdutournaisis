import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const files = (await readdir(root)).filter((name) => name.endsWith('.html')).sort();

async function page(name) {
  return readFile(new URL(name, root), 'utf8');
}

function contrast(foreground, background) {
  const luminance = (hex) => {
    const rgb = hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16) / 255);
    const linear = rgb.map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function structuralErrors(html) {
  const voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
    'meta', 'param', 'source', 'track', 'wbr'
  ]);
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const stack = [];
  const errors = [];

  for (const match of cleaned.matchAll(/<\/?([a-z][a-z\d-]*)\b[^>]*>/gi)) {
    const token = match[0];
    const tag = match[1].toLowerCase();
    if (voidElements.has(tag) || token.endsWith('/>')) continue;
    if (!token.startsWith('</')) {
      stack.push(tag);
    } else if (stack.at(-1) === tag) {
      stack.pop();
    } else {
      errors.push(`fermeture ${tag}, ouverture ${stack.at(-1) ?? 'absente'}`);
    }
  }
  return [...errors, ...stack.map((tag) => `non fermé ${tag}`)];
}

test('les petits textes turquoise et du pied de page atteignent le contraste requis', async () => {
  assert.ok(contrast('#0B6F65', '#E0F5F3') >= 4.5);
  assert.ok(contrast('#B8A8B5', '#1E1A1D') >= 4.5);

  for (const name of files) {
    const html = await page(name);
    assert.doesNotMatch(html, /background:var\(--teal-light\);color:var\(--teal\)/, name);
    assert.doesNotMatch(html, /color:#706070/, name);
  }
});

test('les petits textes et les liens tactiles de l accueil restent accessibles', async () => {
  const index = await page('index.html');

  assert.ok(contrast('#9A0F57', '#FBEAF3') >= 4.5);
  assert.ok(contrast('#0B6F65', '#FFFFFF') >= 4.5);
  assert.match(index, /\.hero-tag\{[^}]*color:var\(--pink-dark\)/);
  assert.match(index, /\.tag-pink\{[^}]*color:var\(--pink-dark\)/);
  assert.match(index, /\.role-teal\{color:#0B6F65;\}/);
  assert.match(index, /\.horaire-row \.time\{[^}]*color:#0B6F65;/);
  assert.match(index, /footer li a\{display:inline-flex;align-items:center;min-height:28px;\}/);
});

test('les textes colorés du dispensaire gardent un contraste suffisant', async () => {
  const dispensary = await page('dispensaire.html');

  assert.ok(contrast('#9A0F57', '#FBEAF3') >= 4.5);
  assert.ok(contrast('#0B6F65', '#E0F5F3') >= 4.5);
  assert.ok(contrast('#0B6F65', '#FFFFFF') >= 4.5);
  assert.match(dispensary, /\.tag-pink\{[^}]*color:var\(--pink-dark\)/);
  assert.match(dispensary, /\.nav-links a\.active\{color:#0B6F65;/);
  assert.match(dispensary, /\.btn-white\{[^}]*color:#0B6F65;/);
  assert.match(dispensary, /<h3 style="color:#0B6F65;">📦 Centre de dépôt<\/h3>/);
});

test('les seize pages gardent une structure HTML équilibrée', async () => {
  assert.equal(files.length, 16);
  for (const name of files) {
    assert.deepEqual(structuralErrors(await page(name)), [], name);
  }
});

test('aucun titre ne saute directement un niveau', async () => {
  for (const name of files) {
    const html = await page(name);
    const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
    levels.forEach((level, index) => {
      if (index > 0) assert.ok(level <= levels[index - 1] + 1, `${name}: h${levels[index - 1]} vers h${level}`);
    });
  }
});

test('les styles restent dans l entête et les attributs sont séparés', async () => {
  const index = await page('index.html');
  const body = index.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? '';
  assert.doesNotMatch(body, /<style\b/i);
  assert.doesNotMatch(index, /class="nav-btn"onclick=/);
});

test('les deux listes obligatoires commencent par un choix neutre', async () => {
  const index = await page('index.html');
  const replacement = await page('remplacement.html');
  assert.match(index, /<select id="rdv-soin"[^>]*required>\s*<option value="" selected disabled>Choisissez un type de soin<\/option>/);
  assert.match(replacement, /<select id="r-type"[^>]*required>\s*<option value="" selected disabled>Choisissez un type de demande<\/option>/);
});

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const files = (await readdir(root)).filter((name) => name.endsWith('.html')).sort();

const dimensions = {
  'celine-lhoir.webp': [1123, 1400],
  'jordan-daubie.webp': [1086, 1448],
  'lea-beaufays.webp': [1086, 1448],
  'logo-cit.webp': [884, 860],
  'louise-joiffroy.webp': [1024, 1536],
  'melissa-devos.webp': [1402, 1122],
  'peter-andries.webp': [1407, 1118],
  'soins-esthetiques-lea.webp': [1536, 1024]
};

async function page(name) {
  return readFile(new URL(name, root), 'utf8');
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [match[1], match[2]])
  );
}

test('les images locales réservent leur espace avant le chargement', async () => {
  let count = 0;
  for (const name of files) {
    for (const match of (await page(name)).matchAll(/<img\b[^>]*>/gi)) {
      count += 1;
      const attrs = attributes(match[0]);
      const expected = dimensions[attrs.src];
      assert.ok(expected, `${name}: dimensions inconnues pour ${attrs.src}`);
      assert.equal(attrs.width, String(expected[0]), `${name}: largeur de ${attrs.src}`);
      assert.equal(attrs.height, String(expected[1]), `${name}: hauteur de ${attrs.src}`);
      assert.equal(attrs.decoding, 'async', `${name}: décodage de ${attrs.src}`);
    }
  }
  assert.equal(count, 49);
});

test('seules les images situées après le premier écran sont différées', async () => {
  const deferredFrom = new Map([
    ['blog.html', 2],
    ['equipe.html', 2],
    ['index.html', 2]
  ]);

  let lazyCount = 0;
  for (const name of files) {
    const images = [...(await page(name)).matchAll(/<img\b[^>]*>/gi)].map((match) => attributes(match[0]));
    const threshold = deferredFrom.get(name) ?? images.length;
    images.forEach((attrs, index) => {
      const expected = index >= threshold ? 'lazy' : undefined;
      assert.equal(attrs.loading, expected, `${name}: image ${index + 1} (${attrs.src})`);
      if (attrs.loading === 'lazy') lazyCount += 1;
    });
  }
  assert.equal(lazyCount, 23);
});

test('les lecteurs audio et vidéo n utilisent pas le réseau avant une action', async () => {
  let audioCount = 0;
  for (const name of files) {
    const html = await page(name);
    for (const match of html.matchAll(/<audio\b[^>]*>/gi)) {
      audioCount += 1;
      assert.equal(attributes(match[0]).preload, 'none', name);
    }
  }
  assert.equal(audioCount, 5);

  const dispensaire = await page('dispensaire.html');
  const video = attributes(dispensaire.match(/<video\b[^>]*>/i)?.[0] ?? '');
  assert.equal(video.preload, 'none');
  assert.equal(video.poster, 'dispensaire-salle-attente.webp');
  assert.doesNotMatch(dispensaire, /<img\b[^>]*src="logo-cit\.png"/i);
});

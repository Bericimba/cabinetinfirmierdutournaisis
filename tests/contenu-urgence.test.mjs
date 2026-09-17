import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function page(name) {
  return readFile(new URL(`../${name}`, import.meta.url), 'utf8');
}

test('les alertes diabete distinguent le 112 de l avis medical urgent', async () => {
  const html = await page('blog-diabete-soins-domicile.html');

  assert.match(html, /Appelez immédiatement le 112/i);
  assert.match(html, /Ne lui donnez rien à boire ni à manger/i);
  assert.match(html, /Demandez un avis médical urgent/i);
  assert.doesNotMatch(html, /Quand appeler son infirmier en urgence/i);
});

test('le coup de chaleur indique clairement le 112 et limite la boisson', async () => {
  const html = await page('blog-fortes-chaleurs-conseils.html');

  assert.match(html, /Appelez immédiatement le 112/i);
  assert.match(html, /uniquement si elle est pleinement consciente/i);
});

test('l oedeme avec essoufflement indique clairement le 112', async () => {
  const html = await page('blog-oedeme-membres-inferieurs.html');

  assert.match(html, /Appelez immédiatement le 112/i);
  assert.match(html, /avis médical urgent le jour même/i);
});

test('la page maltraitance donne les contacts wallons concrets', async () => {
  const html = await page('blog-maltraitance-domicile.html');

  assert.match(html, /0800 30 330/);
  assert.match(html, /Danger immédiat/i);
  assert.match(html, /appelez le 112/i);
});

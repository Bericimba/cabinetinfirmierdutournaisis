import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const files = (await readdir(root))
  .filter((name) => name.endsWith('.html'))
  .sort();
const contentFiles = files.filter((name) => name !== 'blog-cystocath-sonde-urienne.html');

async function page(name) {
  return readFile(new URL(name, root), 'utf8');
}

test('les quinze pages proposent un accès direct au contenu principal', async () => {
  assert.equal(contentFiles.length, 15);

  for (const name of contentFiles) {
    const html = await page(name);
    assert.match(html, /<a class="skip-link" href="#main-content">Aller au contenu principal<\/a>/, name);
    assert.equal((html.match(/<main id="main-content" tabindex="-1">/g) ?? []).length, 1, name);
    assert.equal((html.match(/<\/main>/g) ?? []).length, 1, name);
    assert.ok(html.indexOf('<main id="main-content"') > html.indexOf('</nav>'), name);
    assert.ok(html.indexOf('</main>') < html.indexOf('<footer'), name);
  }
});

test('les quinze menus mobiles utilisent un bouton accessible', async () => {
  for (const name of contentFiles) {
    const html = await page(name);
    assert.match(
      html,
      /<button type="button" class="hamburger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="mobileMenu">/,
      name
    );
    assert.match(html, /<div class="mobile-menu" id="mobileMenu">/, name);
    assert.match(html, /<script src="accessibilite\.js"><\/script>/, name);
  }
});

test('le script synchronise le menu et permet sa fermeture au clavier', async () => {
  const script = await readFile(new URL('accessibilite.js', root), 'utf8');

  assert.match(script, /aria-expanded/);
  assert.match(script, /Ouvrir le menu/);
  assert.match(script, /Fermer le menu/);
  assert.match(script, /Escape/);
  assert.match(script, /\.focus\(\)/);
});

test('les seize questions de FAQ exposent leur état et leur réponse', async () => {
  const html = await page('faq-soins-infirmiers.html');
  const questions = html.match(/<button class="faq-question"[^>]*>/g) ?? [];
  const answers = html.match(/<div class="faq-answer"[^>]*>/g) ?? [];

  assert.equal(questions.length, 16);
  assert.equal(answers.length, 16);

  questions.forEach((button, index) => {
    const number = index + 1;
    assert.match(button, new RegExp(`id="faq-question-${number}"`));
    assert.match(button, new RegExp(`aria-controls="faq-answer-${number}"`));
    assert.match(button, /aria-expanded="(?:true|false)"/);
  });

  answers.forEach((answer, index) => {
    const number = index + 1;
    assert.match(answer, new RegExp(`id="faq-answer-${number}"`));
    assert.match(answer, new RegExp(`aria-labelledby="faq-question-${number}"`));
    assert.match(answer, /role="region"/);
  });

  assert.equal((html.match(/<span aria-hidden="true">\+<\/span>/g) ?? []).length, 16);
  assert.match(html, /button\.setAttribute\('aria-expanded', String\(isOpen\)\)/);
  assert.match(html, /answer\.hidden = !isOpen/);
});

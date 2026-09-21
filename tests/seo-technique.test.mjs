import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const base = 'https://cabinetinfirmierdutournaisis.be/';
const files = (await readdir(root)).filter((name) => name.endsWith('.html')).sort();
const legacyRedirect = 'blog-cystocath-sonde-urienne.html';
const cystocathArticle = `${base}blog-cystocath-sonde-urinaire.html`;
const indexableFiles = files.filter((name) => !['mentions.html', legacyRedirect].includes(name));

async function page(name) {
  return readFile(new URL(name, root), 'utf8');
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1];
}

function jsonLd(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(nodes)];
}

test('chaque page publie une canonique unique et annonce le flux RSS', async () => {
  assert.equal(files.length, 16);
  for (const name of files) {
    const html = await page(name);
    const canonicals = [...html.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi)];
    const feeds = [...html.matchAll(/<link\b[^>]*rel=["']alternate["'][^>]*type=["']application\/rss\+xml["'][^>]*>/gi)];
    assert.equal(canonicals.length, 1, `${name}: canonique`);
    const expectedCanonical = name === 'index.html' ? base : name === legacyRedirect ? cystocathArticle : `${base}${name}`;
    assert.equal(attribute(canonicals[0][0], 'href'), expectedCanonical, name);
    assert.equal(feeds.length, name === legacyRedirect ? 0 : 1, `${name}: annonce RSS`);
    if (feeds.length) assert.equal(attribute(feeds[0][0], 'href'), `${base}rss.xml`, name);
  }
});

test('l ancienne URL Cystocath redirige les visiteurs vers l article canonique', async () => {
  const html = await page(legacyRedirect);
  const refresh = html.match(/<meta\b[^>]*http-equiv=["']refresh["'][^>]*>/i)?.[0];
  const fallback = html.match(/<a\b[^>]*href=["'][^"']+["'][^>]*>/i)?.[0];

  assert.ok(refresh, 'redirection automatique absente');
  assert.equal(attribute(refresh, 'content'), `0; url=${cystocathArticle}`);
  assert.equal(attribute(fallback ?? '', 'href'), cystocathArticle);
});

test('le sitemap contient les quatorze pages indexables avec une date exacte', async () => {
  const xml = await readFile(new URL('sitemap.xml', root), 'utf8');
  const entries = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>[\s\S]*?<\/url>/g)]
    .map((match) => ({ url: match[1], lastmod: match[2] }));
  const expected = indexableFiles.map((name) => name === 'index.html' ? base : `${base}${name}`).sort();
  assert.deepEqual(entries.map((entry) => entry.url).sort(), expected);
  for (const entry of entries) {
    const expectedLastmod = entry.url.startsWith(`${base}blog-`) ? '2026-09-19' : '2026-09-17';
    assert.equal(entry.lastmod, expectedLastmod, entry.url);
  }
});

test('les données structurées utilisent des URL absolues et datent les articles modifiés', async () => {
  for (const name of files) {
    const schemas = jsonLd(await page(name));
    for (const schema of schemas) {
      for (const node of nodes(schema)) {
        for (const key of ['url', 'logo', 'image', '@id', 'mainEntityOfPage', 'item']) {
          if (typeof node[key] === 'string') {
            assert.match(node[key], /^https:\/\//, `${name}: ${key}=${node[key]}`);
          }
        }
      }
    }
    if (name.startsWith('blog-') && name !== legacyRedirect) {
      const article = schemas.find((schema) => schema['@type'] === 'Article');
      assert.equal(article?.dateModified, '2026-09-19', name);
    }
  }
});

test('le RSS classe ses éléments, corrige leurs liens et fournit des identifiants permanents', async () => {
  const xml = await readFile(new URL('rss.xml', root), 'utf8');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  assert.equal(items.length, 9);

  const links = items.map((item) => item.match(/<link>([^<]+)<\/link>/)?.[1]);
  const guids = items.map((item) => item.match(/<guid isPermaLink="true">([^<]+)<\/guid>/)?.[1]);
  const dates = items.map((item) => new Date(item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]).getTime());
  assert.deepEqual(guids, links);
  assert.equal(new Set(guids).size, items.length);
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
  assert.ok(links.includes(`${base}#biologie`));
  assert.ok(!links.includes(`${base}blog.html`));
});

test('robots autorise le site et indique le sitemap canonique', async () => {
  const robots = await readFile(new URL('robots.txt', root), 'utf8');
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${base.replaceAll('.', '\\.') }sitemap\\.xml$`, 'm'));
});

test('tous les liens internes et leurs ancres existent', async () => {
  const contents = Object.fromEntries(await Promise.all(files.map(async (name) => [name, await page(name)])));
  const ids = Object.fromEntries(files.map((name) => [name, new Set([...contents[name].matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]))]));

  for (const name of files) {
    for (const match of contents[name].matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
      const href = match[1];
      if (/^(?:https?:|mailto:|tel:)/i.test(href)) continue;
      const [path, fragment] = href.split('#');
      const target = path || name;
      assert.ok(contents[target], `${name}: fichier absent ${href}`);
      if (fragment) assert.ok(ids[target].has(fragment), `${name}: ancre absente ${href}`);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const moduleUrl = new URL('../formulaire.js', import.meta.url);

async function loadFormModule() {
  assert.equal(
    existsSync(fileURLToPath(moduleUrl)),
    true,
    'formulaire.js doit exister avant de tester son comportement'
  );
  return import(moduleUrl.href);
}

test('conserve les deux lieux sélectionnés dans la demande', async () => {
  const { formDataToPayload } = await loadFormModule();
  const data = new FormData();
  data.append('lieu[]', 'Domicile');
  data.append('lieu[]', 'Dispensaire');

  const payload = formDataToPayload(data);

  assert.deepEqual(payload.getAll('lieu[]'), ['Domicile', 'Dispensaire']);
});

test('annonce une réussite et place le focus sur le résultat', async () => {
  const { applyResult } = await loadFormModule();
  const classes = new Set(['form-result--error']);
  const attributes = new Map();
  let focused = false;
  const element = {
    hidden: true,
    textContent: '',
    classList: {
      add: (name) => classes.add(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
    },
    setAttribute: (name, value) => attributes.set(name, value),
    focus: () => { focused = true; },
  };

  applyResult(element, {
    ok: true,
    message: "Votre demande a bien été reçue.",
  });

  assert.equal(element.hidden, false);
  assert.equal(element.textContent, "Votre demande a bien été reçue.");
  assert.equal(attributes.get('role'), 'status');
  assert.equal(classes.has('form-result--success'), true);
  assert.equal(classes.has('form-result--error'), false);
  assert.equal(focused, true);
});

test('annonce une erreur sans dépendre uniquement de la couleur', async () => {
  const { applyResult } = await loadFormModule();
  const attributes = new Map();
  const element = {
    hidden: true,
    textContent: '',
    classList: { add: () => {}, remove: () => {} },
    setAttribute: (name, value) => attributes.set(name, value),
    focus: () => {},
  };

  applyResult(element, { ok: false, message: 'Envoi impossible.' });

  assert.equal(attributes.get('role'), 'alert');
  assert.equal(element.textContent, 'Envoi impossible.');
});

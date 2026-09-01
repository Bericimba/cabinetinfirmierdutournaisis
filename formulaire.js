export const ENDPOINT = 'https://formulaire.cabinetinfirmierdutournaisis.be/envoyer.php';

const NETWORK_ERROR_MESSAGE = "Votre demande n'a pas pu être envoyée. Appelez-nous au (+32) 069 30 41 33.";

export function formDataToPayload(formData) {
  const payload = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    payload.append(key, String(value));
  }
  return payload;
}

export function applyResult(element, result) {
  element.hidden = false;
  element.textContent = result.message;
  element.classList.remove('form-result--success', 'form-result--error');
  element.classList.add(result.ok ? 'form-result--success' : 'form-result--error');
  element.setAttribute('role', result.ok ? 'status' : 'alert');
  element.focus();
}

export function setFormOverlayState(body, visible) {
  body.classList.toggle('cit-form-in-view', visible);
}

function watchFormVisibility(form) {
  if (typeof IntersectionObserver === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    setFormOverlayState(document.body, entries.some((entry) => entry.isIntersecting));
  }, { threshold: 0.15 });

  observer.observe(form);
}

function localDateValue(date = new Date()) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 10);
}

function refreshDynamicFields(form) {
  const startedAt = form.querySelector('[name="started_at"]');
  if (startedAt) {
    startedAt.value = String(Math.floor(Date.now() / 1000));
  }

  const dateInput = form.querySelector('[name="date_souhaitee"]');
  if (dateInput) {
    dateInput.min = localDateValue();
  }
}

function validateCareLocation(form) {
  const locations = [...form.querySelectorAll('[name="lieu[]"]')];
  if (locations.length === 0) {
    return true;
  }

  const valid = locations.some((location) => location.checked);
  locations[0].setCustomValidity(valid ? '' : 'Choisissez le domicile, le dispensaire ou les deux.');
  return valid;
}

export async function submitCitForm(form, fetchImpl = globalThis.fetch) {
  const button = form.querySelector('[type="submit"]');
  const resultElement = form.querySelector('[data-form-result]');
  const originalLabel = button.textContent;

  button.disabled = true;
  button.textContent = 'Envoi en cours…';
  resultElement.hidden = true;

  try {
    const response = await fetchImpl(form.action || ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formDataToPayload(new FormData(form)),
    });
    const data = await response.json();
    const result = {
      ok: response.ok && data.ok === true,
      message: typeof data.message === 'string' ? data.message : NETWORK_ERROR_MESSAGE,
    };

    applyResult(resultElement, result);
    if (result.ok) {
      form.reset();
      refreshDynamicFields(form);
    }
    return result;
  } catch {
    const result = { ok: false, message: NETWORK_ERROR_MESSAGE };
    applyResult(resultElement, result);
    return result;
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

export function prepareCitForm(form) {
  refreshDynamicFields(form);
  watchFormVisibility(form);

  for (const location of form.querySelectorAll('[name="lieu[]"]')) {
    location.addEventListener('change', () => validateCareLocation(form));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateCareLocation(form)) {
      form.reportValidity();
      return;
    }
    await submitCitForm(form);
  });
}

if (typeof document !== 'undefined') {
  const initialize = () => {
    document.querySelectorAll('[data-cit-form]').forEach(prepareCitForm);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}

import { escapeHtml } from '../format.js';
import { MEDICAL_NOTICE } from './shared.js';

export function renderOnboarding({ timeZone }) {
  return `
    <h1 class="page-title">Bienvenue</h1>
    <section class="card">
      <p>CigaCount transforme chaque cigarette non fumée en épargne vers un objectif que vous choisissez.</p>
      <p class="muted small">Chaque jour, le budget correspondant à votre consommation habituelle est crédité&nbsp;;
        chaque cigarette déclarée le débite. Le solde alimente votre cagnotte.</p>
    </section>

    <form data-form="onboarding" class="card form" aria-labelledby="onboarding-title">
      <h2 id="onboarding-title" class="card-title">Votre consommation habituelle</h2>
      <label>Cigarettes par jour
        <input name="cigarettesPerDay" type="number" min="1" max="200" step="1" inputmode="numeric" required value="20" data-preview />
      </label>
      <label>Prix du paquet (€)
        <input name="packPrice" type="number" min="0.01" step="0.01" inputmode="decimal" required value="12.50" data-preview />
      </label>
      <label>Cigarettes par paquet
        <input name="cigarettesPerPack" type="number" min="1" step="1" inputmode="numeric" required value="20" data-preview />
      </label>
      <p class="preview" data-onboarding-preview aria-live="polite"></p>

      <h2 class="card-title">Votre premier objectif (facultatif)</h2>
      <label>Libellé
        <input name="goalLabel" type="text" maxlength="60" placeholder="Console" />
      </label>
      <label>Montant (€)
        <input name="goalAmount" type="number" min="1" step="0.01" inputmode="decimal" placeholder="450" />
      </label>

      <p class="muted small">Fuseau horaire détecté&nbsp;: ${escapeHtml(timeZone)} (modifiable dans les réglages).</p>
      <button type="submit" class="button">Commencer</button>
    </form>
    ${MEDICAL_NOTICE}`;
}

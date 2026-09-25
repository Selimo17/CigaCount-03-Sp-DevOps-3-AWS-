import { barChart, lineChart } from '../charts.js';
import { formatMoney, formatNumber, formatShortDateKey, formatSignedMoney } from '../format.js';
import { MEDICAL_NOTICE } from './shared.js';

const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function rateHistoryTable(periods) {
  const rows = [...periods]
    .reverse()
    .map(
      (period) => `
        <tr>
          <td>${formatShortDateKey(period.startDateKey)} → ${formatShortDateKey(period.endDateKey)}</td>
          <td class="numeric">${formatSignedMoney(period.rate)}${period.bootstrap ? '*' : ''}</td>
          <td class="numeric">${period.closed ? formatSignedMoney(period.net) : 'en cours'}</td>
        </tr>`,
    )
    .join('');
  return `
    <div class="table-wrapper">
      <table>
        <caption class="sr-only">Historique des taux de progression par période de 14 jours</caption>
        <thead><tr><th scope="col">Période</th><th scope="col" class="numeric">Taux appliqué / jour</th><th scope="col" class="numeric">Net épargné</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted small">* Première période&nbsp;: amorçage à 20&nbsp;% du budget quotidien.</p>`;
}

export function renderStats({ ledger }) {
  const balanceChart = lineChart({
    points: ledger.balanceSeries.map((point) => ({ label: point.dateKey, value: point.balance })),
    label: 'Évolution du solde en fin de journée',
    formatValue: formatMoney,
    formatLabel: formatShortDateKey,
  });

  const hourChart = barChart({
    bars: ledger.distributions.averageByHour.map((value, hour) => ({
      label: `${hour}h`,
      fullLabel: `${hour}h – ${hour + 1}h`,
      value,
    })),
    label: 'Consommation moyenne par heure',
    formatValue: (value) => `${formatNumber(value)} cigarette(s) par jour`,
    tickEvery: 6,
  });

  const weekdayChart = barChart({
    bars: ledger.distributions.averageByWeekday.map((value, index) => ({
      label: WEEKDAYS[index].slice(0, 3),
      fullLabel: WEEKDAYS[index],
      value,
    })),
    label: 'Consommation moyenne par jour de la semaine',
    formatValue: (value) => `${formatNumber(value)} cigarette(s)`,
  });

  const peakHour = ledger.distributions.averageByHour.indexOf(Math.max(...ledger.distributions.averageByHour));
  const hasData = ledger.cost.totalCigarettes > 0;

  return `
    <h1 class="page-title">Statistiques</h1>
    <section class="card" aria-labelledby="balance-chart-title">
      <h2 id="balance-chart-title" class="card-title">Évolution du solde</h2>
      ${balanceChart}
      <p class="muted small">Solde en fin de journée. En dessous de la ligne zéro, le solde est une dette.</p>
    </section>

    <section class="card" aria-labelledby="hour-chart-title">
      <h2 id="hour-chart-title" class="card-title">Consommation par heure</h2>
      ${hourChart}
      <p class="muted small">${hasData ? `Moyenne par jour. Heure la plus fréquente&nbsp;: ${peakHour}h – ${peakHour + 1}h.` : 'Aucune donnée pour le moment.'}</p>
    </section>

    <section class="card" aria-labelledby="weekday-chart-title">
      <h2 id="weekday-chart-title" class="card-title">Consommation par jour de la semaine</h2>
      ${weekdayChart}
      <p class="muted small">Moyenne par jour de la semaine écoulé.</p>
    </section>

    <section class="card" aria-labelledby="rates-title">
      <h2 id="rates-title" class="card-title">Historique des taux</h2>
      ${rateHistoryTable(ledger.rate.periods)}
    </section>
    ${MEDICAL_NOTICE}`;
}

/**
 * Tiny dependency-free SVG charts (single series): a line chart for the
 * balance and a bar chart for distributions. Each mark has an accessible
 * tooltip (<title>) and every chart has a text alternative.
 */

import { escapeHtml } from './format.js';

const WIDTH = 320;
const HEIGHT = 160;
const PADDING = { top: 12, right: 8, bottom: 22, left: 8 };

function scale(value, domainMin, domainMax, rangeMin, rangeMax) {
  if (domainMax === domainMin) {
    return (rangeMin + rangeMax) / 2;
  }
  return rangeMin + ((value - domainMin) / (domainMax - domainMin)) * (rangeMax - rangeMin);
}

/**
 * Line chart. The zero line is drawn when the series crosses it, because a
 * negative balance means a debt.
 */
export function lineChart({ points, label, formatValue, formatLabel }) {
  if (points.length === 0) {
    return '';
  }
  const values = points.map((point) => point.value);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const innerRight = WIDTH - PADDING.right;
  const innerBottom = HEIGHT - PADDING.bottom;
  const x = (index) => scale(index, 0, Math.max(points.length - 1, 1), PADDING.left, innerRight);
  const y = (value) => scale(value, min, max, innerBottom, PADDING.top);

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(' ');
  const hitWidth = Math.max((innerRight - PADDING.left) / points.length, 2);
  const hits = points
    .map(
      (point, index) => `
        <g class="chart-hit">
          <rect x="${(x(index) - hitWidth / 2).toFixed(1)}" y="${PADDING.top}" width="${hitWidth.toFixed(1)}" height="${innerBottom - PADDING.top}" />
          <circle cx="${x(index).toFixed(1)}" cy="${y(point.value).toFixed(1)}" r="4" />
          <title>${escapeHtml(`${formatLabel(point.label)} : ${formatValue(point.value)}`)}</title>
        </g>`,
    )
    .join('');
  const first = points[0];
  const last = points[points.length - 1];

  return `
    <svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(label)}">
      <line class="chart-baseline" x1="${PADDING.left}" x2="${innerRight}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" />
      <path class="chart-line" d="${path}" />
      <circle class="chart-last" cx="${x(points.length - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="4" />
      ${hits}
      <text class="chart-axis" x="${PADDING.left}" y="${HEIGHT - 6}">${escapeHtml(formatLabel(first.label))}</text>
      <text class="chart-axis" x="${innerRight}" y="${HEIGHT - 6}" text-anchor="end">${escapeHtml(formatLabel(last.label))}</text>
    </svg>`;
}

/** Vertical bar chart with rounded data ends anchored to the baseline. */
export function barChart({ bars, label, formatValue, tickEvery = 1 }) {
  const max = Math.max(...bars.map((bar) => bar.value), 0);
  const innerRight = WIDTH - PADDING.right;
  const innerBottom = HEIGHT - PADDING.bottom;
  const slot = (innerRight - PADDING.left) / bars.length;
  const gap = Math.min(2, slot * 0.2);
  const barWidth = slot - gap;

  const marks = bars
    .map((bar, index) => {
      const height = max > 0 ? (bar.value / max) * (innerBottom - PADDING.top) : 0;
      const left = PADDING.left + index * slot + gap / 2;
      const tick =
        index % tickEvery === 0
          ? `<text class="chart-axis" x="${(left + barWidth / 2).toFixed(1)}" y="${HEIGHT - 6}" text-anchor="middle">${escapeHtml(bar.label)}</text>`
          : '';
      return `
        <g class="chart-hit">
          <rect class="chart-hit-area" x="${left.toFixed(1)}" y="${PADDING.top}" width="${barWidth.toFixed(1)}" height="${innerBottom - PADDING.top}" />
          <rect class="chart-bar" x="${left.toFixed(1)}" y="${(innerBottom - height).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="${Math.min(4, barWidth / 2).toFixed(1)}" />
          <title>${escapeHtml(`${bar.fullLabel ?? bar.label} : ${formatValue(bar.value)}`)}</title>
          ${tick}
        </g>`;
    })
    .join('');

  return `
    <svg class="chart" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeHtml(label)}">
      <line class="chart-baseline" x1="${PADDING.left}" x2="${innerRight}" y1="${innerBottom}" y2="${innerBottom}" />
      ${marks}
    </svg>`;
}

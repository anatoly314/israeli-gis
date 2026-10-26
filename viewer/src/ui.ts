import { basemap } from './config.ts';
import { isOrdered, layerUnit, legendEntries, textOn } from './classify.ts';
import { LANGS, t, type Lang } from './i18n.ts';
import { isChoropleth, layerForMeasure, type Layer, type LayerGroup, type LayerItem, type Manifest } from './manifest.ts';
import { esc, swatch } from './html.ts';
import type { Source } from '../../pipeline/lib/contract.ts';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const LANG_LABEL: Record<Lang, string> = { he: 'עב', en: 'EN', ru: 'РУ' };
const LANG_NAME: Record<Lang, string> = { he: 'עברית', en: 'English', ru: 'Русский' };

export function renderLang(el: HTMLElement, lang: Lang, onPick: (l: Lang) => void) {
  el.setAttribute('aria-label', t('language', lang));
  el.replaceChildren(
    ...LANGS.map((l) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = LANG_LABEL[l];
      b.lang = l;
      b.title = LANG_NAME[l];
      b.setAttribute('aria-label', LANG_NAME[l]);
      b.setAttribute('aria-pressed', String(l === lang));
      b.addEventListener('click', () => onPick(l));
      return b;
    }),
  );
}

/** The official CBS term as small secondary text, unless it says the same as the plain name. */
const officialHtml = ({ label, official }: LayerItem, lang: Lang) =>
  official && official[lang] !== label[lang] ? `<small class="official">${esc(official[lang])}</small>` : '';

const radio = (value: string, checked: boolean, body: string) =>
  `<label class="layer-item"><input type="radio" name="layer" value="${esc(value)}"${checked ? ' checked' : ''}>` +
  `<span class="layer-name">${body}</span></label>`;

/**
 * Multi-measure dataset: one radio per measure (it switches to that measure on the current level when it has it),
 * and under the selected measure its levels as a small segmented choice (or the one level's name, if it has one).
 */
function measuresHtml(g: LayerGroup, current: Layer | undefined, lang: Lang): string {
  // Every measure on the same single level (census on localities): name the level once, not under each measure.
  const levelIds = new Set(g.measures!.flatMap((m) => m.items.map((i) => (isChoropleth(i.layer) ? i.layer.level : i.layer.id))));
  const oneLevel = levelIds.size === 1 && g.measures!.every((m) => m.items.length === 1);
  const header = oneLevel ? `<p class="official dataset-level">${esc(g.measures![0].items[0].label[lang])}</p>` : '';
  return (
    header +
    g
    .measures!.map((m) => {
      const active = m.items.some((i) => i.layer.id === current?.id);
      const target = layerForMeasure(m, current).id;
      let levels = '';
      if (active && m.items.length > 1) {
        levels =
          `<div class="levels" role="group" aria-label="${esc(t('level', lang))}">` +
          m.items
            .map((i) => {
              const on = i.layer.id === current?.id;
              const tip = i.official && i.official[lang] !== i.label[lang] ? ` title="${esc(i.official[lang])}"` : '';
              return `<button type="button" data-layer="${esc(i.layer.id)}" aria-pressed="${on}"${tip}>${esc(i.label[lang])}</button>`;
            })
            .join('') +
          `</div>`;
      }
      const only = m.items.length === 1 && !oneLevel ? `<small class="official">${esc(m.items[0].label[lang])}</small>` : '';
      return `<div class="measure${active ? ' active' : ''}">${radio(target, active, `<span>${esc(m.title[lang])}</span>${only}`)}${levels}</div>`;
    })
    .join('')
  );
}

/** Dataset sections the user opened by hand; the current layer's dataset is always open. */
const openDatasets = new Set<string>();

/**
 * The layer switcher: one collapsible section per dataset (only the current one open, so three or more datasets
 * stay short), each with one radio per level, or per measure for multi-measure datasets.
 */
export function renderLayers(el: HTMLElement, groups: LayerGroup[], current: Layer | undefined, lang: Lang, onPick: (id: string) => void) {
  el.innerHTML =
    `<h2>${esc(t('layers', lang))}</h2>` +
    groups
      .map((g) => {
        const active = g.dataset === current?.dataset;
        return (
          `<details class="dataset" data-dataset="${esc(g.dataset)}"${active || openDatasets.has(g.dataset) ? ' open' : ''}>` +
          `<summary>${esc(g.title[lang])}</summary>` +
          `<div role="radiogroup" aria-label="${esc(g.title[lang])}">` +
          (g.description
            ? `<details class="dataset-desc"><summary>${esc(t('aboutData', lang))}</summary><p>${esc(g.description[lang])}</p></details>`
            : '') +
          (g.measures
            ? measuresHtml(g, current, lang)
            : g.items.map((i) => radio(i.layer.id, i.layer.id === current?.id, `<span>${esc(i.label[lang])}</span>${officialHtml(i, lang)}`)).join('')) +
          `</div></details>`
        );
      })
      .join('');
  el.querySelectorAll<HTMLDetailsElement>('details.dataset').forEach((d) =>
    d.addEventListener('toggle', () => {
      if (d.open) openDatasets.add(d.dataset.dataset!);
      else openDatasets.delete(d.dataset.dataset!);
    }),
  );
  el.querySelectorAll<HTMLInputElement>('input[name=layer]').forEach((i) => i.addEventListener('change', () => onPick(i.value)));
  el.querySelectorAll<HTMLButtonElement>('.levels [data-layer]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.layer!)));
}

export interface LegendHandlers {
  toggle: (key: string) => void;
  set: (keys: string[]) => void;
}

export function renderLegend(el: HTMLElement, strip: HTMLElement, layer: Layer, hl: readonly string[], lang: Lang, h: LegendHandlers) {
  const c = layer.classification;
  const { classes, missing } = legendEntries(c, lang, layerUnit(layer));
  const on = (k: string) => hl.includes(k);
  const item = (e: { key: string; color: string; label: string; description?: string }, isMissing = false) =>
    `<li><button type="button" data-key="${esc(e.key)}" aria-pressed="${on(e.key)}"${e.description ? ` title="${esc(e.description)}"` : ''}>` +
    `${swatch(e.color, isMissing)}<span>${esc(e.label)}</span></button></li>`;

  const ordered = isOrdered(c);
  el.innerHTML =
    (c.note ? `<p class="note">${esc(c.note[lang])}</p>` : '') +
    // Nominal swatches carry no text on the strip, so the compact sheet shows this list for them (CSS).
    `<ul class="legend-list${hl.length ? ' filtering' : ''}${ordered ? '' : ' nominal'}">${classes.map((e) => item(e)).join('')}${item(missing, true)}</ul>` +
    // Nominal classes have no range slider, which holds "Clear": it sits here instead.
    (ordered ? '' : `<div class="legend-actions"><button type="button" class="range-clear" data-clear ${hl.length ? '' : 'disabled'}>${esc(t('clear', lang))}</button></div>`) +
    `<p class="hint">${esc(t(ordered ? 'legendHint' : 'legendHintNominal', lang))}</p>`;

  // One grid: the class cells, the "not calculated" cell, the clear button; the low/high caption spans the classes only.
  strip.innerHTML =
    `<div class="strip-row${hl.length ? ' filtering' : ''}" style="grid-template-columns: repeat(${classes.length}, minmax(0, 1fr)) minmax(0, 0.9fr) auto">` +
    [...classes.map((e) => ({ e, m: false })), { e: missing, m: true }]
      .map(
        ({ e, m }) =>
          `<button type="button" data-key="${esc(e.key)}" aria-pressed="${on(e.key)}" aria-label="${esc(e.label)}" title="${esc(e.label)}"` +
          ` class="${m ? 'swatch-missing' : ''}" style="--c:${e.color};--fg:${textOn(e.color)}"><span>${esc(e.short)}</span></button>`,
      )
      .join('') +
    `<button type="button" class="strip-clear" data-clear aria-label="${esc(t('clear', lang))}" ${hl.length ? '' : 'hidden'}>×</button>` +
    // Low/high only reads on an ordered scale.
    (ordered
      ? `<div class="strip-caption" style="grid-column: 1 / span ${classes.length}"><span>${esc(t('low', lang))}</span><span>${esc(t('high', lang))}</span></div>`
      : '') +
    `</div>`;

  for (const root of [el, strip]) {
    root.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) => b.addEventListener('click', () => h.toggle(b.dataset.key!)));
    root.querySelectorAll<HTMLButtonElement>('[data-clear]').forEach((b) => b.addEventListener('click', () => h.set([])));
  }
}

export function renderAbout(dialog: HTMLDialogElement, m: Manifest, lang: Lang) {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const s of [...m.layers.map((l) => l.source), ...m.sources]) {
    if (seen.has(s.citation)) continue;
    seen.add(s.citation);
    sources.push(s);
  }
  dialog.innerHTML =
    `<form method="dialog" class="about-head"><h2>${esc(t('about', lang))}</h2>` +
    `<button class="close" aria-label="${esc(t('close', lang))}">×</button></form>` +
    `<ul class="sources">` +
    sources
      .map(
        (s) =>
          `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name[lang])}</a>` +
          `<p class="citation" dir="auto" lang="${/[א-ת]/.test(s.citation) ? 'he' : 'en'}">${esc(s.citation)}</p>` +
          `<p class="licence">${esc(t('licence', lang))}: <a href="${esc(s.licenseUrl)}" target="_blank" rel="noopener">${esc(s.license)}</a></p></li>`,
      )
      .join('') +
    `<li><b>${esc(t('basemap', lang))}</b><p dir="ltr">${basemap.attribution}</p></li>` +
    `</ul><p class="disclaimer">${esc(t('noEndorsement', lang))}</p>`;
}

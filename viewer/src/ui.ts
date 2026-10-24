import { basemap } from './config.ts';
import { legendEntries, presets, textOn } from './classify.ts';
import { LANGS, t, type Lang } from './i18n.ts';
import type { Layer, LayerGroup, Manifest } from './manifest.ts';
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

export function renderLayers(el: HTMLElement, groups: LayerGroup[], current: string, lang: Lang, onPick: (id: string) => void) {
  el.innerHTML =
    `<h2>${esc(t('layers', lang))}</h2>` +
    groups
      .map(
        (g) =>
          `<fieldset><legend>${esc(g.title[lang])}</legend>` +
          g.items
            .map(
              ({ layer, label }) =>
                `<label class="layer-item"><input type="radio" name="layer" value="${esc(layer.id)}"${layer.id === current ? ' checked' : ''}>` +
                `<span>${esc(label[lang])}</span></label>`,
            )
            .join('') +
          `</fieldset>`,
      )
      .join('');
  el.querySelectorAll<HTMLInputElement>('input[name=layer]').forEach((i) => i.addEventListener('change', () => onPick(i.value)));
}

export interface LegendHandlers {
  toggle: (key: string) => void;
  set: (keys: string[]) => void;
}

export function renderLegend(el: HTMLElement, strip: HTMLElement, layer: Layer, hl: readonly string[], lang: Lang, h: LegendHandlers) {
  const c = layer.classification;
  const { classes, missing } = legendEntries(c, lang);
  const on = (k: string) => hl.includes(k);
  const p = presets(c, lang);
  const isPreset = (keys: string[]) => hl.length === keys.length && keys.every(on);
  const item = (e: { key: string; color: string; label: string; description?: string }, isMissing = false) =>
    `<li><button type="button" data-key="${esc(e.key)}" aria-pressed="${on(e.key)}"${e.description ? ` title="${esc(e.description)}"` : ''}>` +
    `${swatch(e.color, isMissing)}<span>${esc(e.label)}</span></button></li>`;

  el.innerHTML =
    `<h2>${esc(t('legend', lang))}</h2>` +
    (c.note ? `<p class="note">${esc(c.note[lang])}</p>` : '') +
    `<ul class="legend-list${hl.length ? ' filtering' : ''}">${classes.map((e) => item(e)).join('')}${item(missing, true)}</ul>` +
    `<div class="legend-actions">` +
    (p
      ? `<button type="button" data-preset="low" aria-pressed="${isPreset(p.low.keys)}">${esc(t('presetLow', lang))} ${esc(p.low.range)}</button>` +
        `<button type="button" data-preset="high" aria-pressed="${isPreset(p.high.keys)}">${esc(t('presetHigh', lang))} ${esc(p.high.range)}</button>`
      : '') +
    `<button type="button" data-clear ${hl.length ? '' : 'disabled'}>${esc(t('clear', lang))}</button>` +
    `</div><p class="hint">${esc(t('legendHint', lang))}</p>`;

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
    `<div class="strip-caption" style="grid-column: 1 / span ${classes.length}"><span>${esc(t('low', lang))}</span><span>${esc(t('high', lang))}</span></div></div>`;

  for (const root of [el, strip]) {
    root.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((b) => b.addEventListener('click', () => h.toggle(b.dataset.key!)));
    root.querySelectorAll<HTMLButtonElement>('[data-clear]').forEach((b) => b.addEventListener('click', () => h.set([])));
    root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => {
        const keys = (b.dataset.preset === 'low' ? p!.low : p!.high).keys;
        h.set(isPreset(keys) ? [] : keys);
      }),
    );
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

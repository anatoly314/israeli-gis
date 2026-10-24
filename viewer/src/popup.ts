import type { PopupField } from '../../pipeline/lib/contract.ts';
import { CLASS_PROP, MISSING, classLabel, colorOf } from './classify.ts';
import type { Props } from './data.ts';
import { formatNumber } from './format.ts';
import { extraFieldsHtml, extraTooltipHtml } from './extras.ts';
import { esc, swatch } from './html.ts';
import { featureName, fillTemplate, t, type Lang } from './i18n.ts';
import type { Layer, Level } from './manifest.ts';

export function formatField(f: PopupField, v: number, lang: Lang): string {
  switch (f.format.type) {
    case 'integer':
      return formatNumber(v, lang);
    case 'decimal':
      return formatNumber(v, lang, f.format.decimals);
    case 'rank':
      return `${formatNumber(v, lang)} ${t('of', lang)} ${formatNumber(f.format.total, lang)}`;
  }
}

/** Title of a feature in `lang`: the level's label template if it has one, else the name. */
export function featureTitle(p: Props, level: Level | undefined, lang: Lang): { text: string; fallback: boolean } {
  if (level?.featureLabel) return { text: fillTemplate(level.featureLabel[lang], p, lang), fallback: false };
  return featureName(p, lang);
}

/** "City", "Regional council", "Statistical area"…, from the level's feature types. */
export function featureType(p: Props, level: Level | undefined, lang: Lang): string {
  const types = level?.featureTypes;
  const own = types && types.labels[String(p[types.property])];
  return (own ?? level?.featureType)?.[lang] ?? '';
}

/**
 * Secondary lines under the popup title: "Area · CBS statistical areas" (feature type, then the level's
 * official term when it differs). More per-feature lines go here.
 */
export function headerLines(p: Props, level: Level | undefined, lang: Lang): string[] {
  const type = featureType(p, level, lang);
  const official = level?.officialTerm?.[lang];
  return [[type, official !== type ? official : ''].filter(Boolean).join(' · ')].filter(Boolean);
}

const keyOf = (p: Props) => String(p[CLASS_PROP] ?? MISSING);

/**
 * The value a feature is coloured by, as HTML: the class label for categorical layers ("Cluster 7"); for stepped
 * ones the actual value, formatted like its popup field, with the bin as secondary text.
 */
export function valueHtml(layer: Layer, p: Props, lang: Lang): string {
  const key = keyOf(p);
  const c = layer.classification;
  const chip = swatch(colorOf(c, key), key === MISSING);
  const label = esc(classLabel(c, key, lang));
  const v = p[layer.valueField];
  if (c.type === 'categorical' || key === MISSING || typeof v !== 'number') return `${chip}<span>${label}</span>`;
  const field = layer.popup.find((f) => f.field === layer.valueField);
  const value = field ? formatField(field, v, lang) : formatNumber(v, lang);
  return `${chip}<span>${esc(value)}</span><span class="bin">${label}</span>`;
}

export function popupHtml(layer: Layer, level: Level | undefined, p: Props, lang: Lang): string {
  const title = featureTitle(p, level, lang);
  const missing = keyOf(p) === MISSING;
  const rows = missing
    ? `<p class="popup-missing">${swatch(layer.classification.missing.color, true)}<b>${esc(layer.classification.missing.label[lang])}</b><br>${esc(layer.classification.missing.description[lang])}</p>`
    : `<dl>${layer.popup
        .filter((f) => typeof p[f.field] === 'number')
        .map((f) => {
          const value = f.field === layer.valueField ? valueHtml(layer, p, lang) : esc(formatField(f, p[f.field] as number, lang));
          return `<div><dt>${esc(f.label[lang])}</dt><dd>${value}</dd></div>`;
        })
        .join('')}</dl>`;
  const note = p.placeholder ? `<p class="popup-note">${esc(t('placeholderNote', lang))}</p>` : '';
  const fallback = title.fallback && t('noRuName', lang) ? ` title="${esc(t('noRuName', lang))}"` : '';
  return (
    `<div class="popup" lang="${lang}">` +
    `<h3 dir="auto"${fallback}>${esc(title.text)}</h3>` +
    headerLines(p, level, lang)
      .map((line) => `<p class="popup-type">${esc(line)}</p>`)
      .join('') +
    extraFieldsHtml(level, p, lang) +
    rows +
    note +
    `</div>`
  );
}

/** Hover tooltip: name and value. */
export function tooltipHtml(layer: Layer, level: Level | undefined, p: Props, lang: Lang): string {
  return `<b dir="auto">${esc(featureTitle(p, level, lang).text)}</b>${extraTooltipHtml(level, p)}<span>${valueHtml(layer, p, lang)}</span>`;
}

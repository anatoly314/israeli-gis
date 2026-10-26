import type { PopupField } from '../../pipeline/lib/contract.ts';
import { CLASS_PROP, MISSING, classLabel, colorOf, layerUnit } from './classify.ts';
import type { Props } from './data.ts';
import { countText, formatCurrency, formatNumber, formatPercent } from './format.ts';
import { extraFieldsHtml, extraTooltipHtml } from './extras.ts';
import { esc, swatch } from './html.ts';
import { featureName, fillTemplate, t, type I18n, type Lang } from './i18n.ts';
import type { Layer, Level, PointsLayer } from './manifest.ts';

export function formatField(f: PopupField, v: number, lang: Lang): string {
  const format = f.format;
  switch (format.type) {
    case 'integer':
      return formatNumber(v, lang);
    case 'decimal':
      return formatNumber(v, lang, format.decimals);
    case 'rank':
      return `${formatNumber(v, lang)} ${t('of', lang)} ${formatNumber(format.total, lang)}`;
    case 'percent':
      return formatPercent(v, lang, format.decimals, format.signed);
    case 'category':
      return format.labels[String(v)]?.[lang] ?? formatNumber(v, lang);
    case 'currency':
      return formatCurrency(v, lang, format.currency, format.decimals);
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
  // `popupOfficialTerm: false`: the term stays in the switcher but would only repeat itself on every popup.
  const official = level?.popupOfficialTerm === false ? undefined : level?.officialTerm?.[lang];
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
  const label = esc(classLabel(c, key, lang, layerUnit(layer)));
  const v = p[layer.valueField];
  if (c.type === 'categorical' || key === MISSING || typeof v !== 'number') return `${chip}<span>${label}</span>`;
  const field = layer.popup.find((f) => f.field === layer.valueField);
  const value = field ? formatField(field, v, lang) : formatNumber(v, lang);
  return `${chip}<span>${esc(value)}</span><span class="bin">${label}</span>`;
}

/**
 * Popup: title, type line, extra fields, then the layer's popup fields that the feature's record has (absent fields
 * are skipped). Without the layer's own value the feature is "not calculated" for this layer: the missing note
 * comes first, and the record's other fields still follow (one dataset file serves all its measures).
 */
export function popupHtml(layer: Layer, level: Level | undefined, p: Props, lang: Lang, featureNote?: I18n): string {
  // The dataset's note on this feature (`notes`) comes before the figures it explains (a combined SA's population is
  // the group's); the placeholder caveat, about the shape only, stays at the end.
  const featureNoteHtml = featureNote ? `<p class="popup-note feature-note">${esc(featureNote[lang])}</p>` : '';
  const note = p.placeholder ? `<p class="popup-note">${esc(t('placeholderNote', lang))}</p>` : '';
  return (
    `<div class="popup" lang="${lang}">` +
    titleHtml(featureTitle(p, level, lang), lang) +
    headerLines(p, level, lang)
      .map((line) => `<p class="popup-type">${esc(line)}</p>`)
      .join('') +
    featureNoteHtml +
    extraFieldsHtml(level, p, lang) +
    rowsHtml(layer, p, lang) +
    note +
    `</div>`
  );
}

function titleHtml(title: { text: string; fallback: boolean }, lang: Lang) {
  const fallback = title.fallback && t('noRuName', lang) ? ` title="${esc(t('noRuName', lang))}"` : '';
  return `<h3 dir="auto"${fallback}>${esc(title.text)}</h3>`;
}

/** The "not calculated" note when the layer's own value is absent, then the popup fields the feature has. */
function rowsHtml(layer: Layer, p: Props, lang: Lang): string {
  const missing = keyOf(p) === MISSING;
  const fields = layer.popup.filter((f) => typeof p[f.field] === 'number' && !(missing && f.field === layer.valueField));
  const missingNote = missing
    ? `<p class="popup-missing">${swatch(layer.classification.missing.color, true)}<b>${esc(layer.classification.missing.label[lang])}</b><br>${esc(layer.classification.missing.description[lang])}</p>`
    : '';
  const list = fields.length
    ? `<dl>${fields
        .map((f) => {
          const value = f.field === layer.valueField ? valueHtml(layer, p, lang) : esc(formatField(f, p[f.field] as number, lang));
          return `<div${f.field === layer.valueField ? ' class="current"' : ''}><dt>${esc(f.label[lang])}</dt><dd>${value}</dd></div>`;
        })
        .join('')}</dl>`
    : '';
  return missingNote + list;
}

/**
 * Popup of a points layer, for every point at the clicked location (schools on one campus share coordinates and
 * never separate when zoomed). Type line: "School · <parent place>". One point: its fields as a table. Several: a
 * list, each with its class and the other fields on one line.
 */
export function pointsPopupHtml(layer: PointsLayer, items: Props[], lang: Lang, place?: string): string {
  if (items.length === 1) {
    const p = items[0];
    const type = `<p class="popup-type">${esc([layer.featureType[lang], place].filter(Boolean).join(' · '))}</p>`;
    return `<div class="popup" lang="${lang}">${titleHtml(featureName(p, lang), lang)}${type}${rowsHtml(layer, p, lang)}</div>`;
  }
  // Under "15 schools at this location" the type would repeat itself: the place alone.
  const type = place ? `<p class="popup-type">${esc(place)}</p>` : '';
  // A value every point here has (often the stream on a campus) is said once, under the title, not on each item.
  const same = (f: PopupField) => typeof items[0][f.field] === 'number' && items.every((p) => p[f.field] === items[0][f.field]);
  const shared = layer.popup.filter(same);
  const own = layer.popup.filter((f) => !same(f));
  const isValue = (f: PopupField) => f.field === layer.valueField;
  const line = (p: Props, fields: PopupField[]) => fields.filter((f) => !isValue(f) && typeof p[f.field] === 'number').map((f) => formatField(f, p[f.field] as number, lang));
  const sharedRest = line(items[0], shared);
  const sharedHtml =
    (shared.some(isValue) ? `<span class="spot-value">${valueHtml(layer, items[0], lang)}</span>` : '') +
    (sharedRest.length ? `<small>${esc(sharedRest.join(' · '))}</small>` : '');
  const list = items
    .map((p) => {
      const rest = line(p, own);
      return (
        `<li><b dir="auto">${esc(featureName(p, lang).text)}</b>` +
        (own.some(isValue) ? `<span class="spot-value">${valueHtml(layer, p, lang)}</span>` : '') +
        (rest.length ? `<small>${esc(rest.join(' · '))}</small>` : '') +
        `</li>`
      );
    })
    .join('');
  return (
    `<div class="popup popup-spot" lang="${lang}">` +
    `<h3>${esc(spotTitle(layer, items.length, lang))}</h3>${type}` +
    (sharedHtml ? `<div class="spot-shared">${sharedHtml}</div>` : '') +
    `<ul class="spot-list">${list}</ul></div>`
  );
}

/**
 * "15 schools at this location", from the layer's plural phrases (`countForms`, as on levels) when it has them;
 * else "15 at this location".
 */
function spotTitle(layer: PointsLayer, n: number, lang: Lang): string {
  if (layer.countForms) return t('atOneSpot', lang, { count: countText(layer.countForms, n, lang) });
  return t('atOneSpotN', lang, { n: formatNumber(n, lang) });
}

/** Hover tooltip: name and value. */
export function tooltipHtml(layer: Layer, level: Level | undefined, p: Props, lang: Lang): string {
  return `<b dir="auto">${esc(featureTitle(p, level, lang).text)}</b>${extraTooltipHtml(level, p)}<span>${valueHtml(layer, p, lang)}</span>`;
}

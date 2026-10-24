import type { ExtraField } from '../../pipeline/lib/contract.ts';
import type { Props } from './data.ts';
import { formatNumber } from './format.ts';
import { esc } from './html.ts';
import { inLangNote, t, type Lang } from './i18n.ts';
import type { Level } from './manifest.ts';

/** Items of a `list` extra field on a feature, or [] when the feature doesn't have it. */
export function fieldItems(f: ExtraField, p: Props): string[] {
  const v = p[f.property];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
}

/** Values in their own language and direction; the separators come from that language too ("," also in Hebrew). */
const values = (f: ExtraField, items: string[], lead = '') =>
  `<span class="extra-items" lang="${f.textLang}" dir="${f.textLang === 'he' ? 'rtl' : 'auto'}">${esc(lead + items.join(', '))}</span>`;

/**
 * Popup lines for `levels[*].extraFields`, in manifest order, each "Label (in Hebrew): a, b, c"; fields absent on
 * the feature are skipped. Lists longer than `max` show the first `max` items and a "+N more" disclosure.
 */
export function extraFieldsHtml(level: Level | undefined, p: Props, lang: Lang, max = 8): string {
  return (level?.extraFields ?? [])
    .map((f) => {
      const items = fieldItems(f, p);
      if (!items.length) return '';
      const note = inLangNote(f.textLang, lang);
      const label = `<span class="extra-label">${esc(f.label[lang])}${note ? ` <span class="extra-note">${esc(note)}</span>` : ''}</span>`;
      const rest = items.slice(max);
      // No space before the disclosure (CSS spaces the summary): opened, ", i, j" follows the last item directly.
      const more = rest.length
        ? `<details class="extra-more"><summary>${esc(t('more', lang, { n: formatNumber(rest.length, lang) }))}</summary>${values(f, rest, ', ')}</details>`
        : '';
      return `<p class="extra" data-field="${esc(f.property)}">${label} ${values(f, items.slice(0, max))}${more}</p>`;
    })
    .join('');
}

/**
 * Tooltip line: the level's first declared extra field, its first `n` items, "…" when there are more. Nothing when
 * the feature lacks that field (the tooltip has no labels, so another field would be unexplained).
 */
export function extraTooltipHtml(level: Level | undefined, p: Props, n = 3): string {
  const f = level?.extraFields?.[0];
  const items = f ? fieldItems(f, p) : [];
  if (!f || !items.length) return '';
  const text = items.slice(0, n).join(', ') + (items.length > n ? '…' : '');
  return `<span class="extra-items tip-extra" lang="${f.textLang}" dir="${f.textLang === 'he' ? 'rtl' : 'auto'}">${esc(text)}</span>`;
}

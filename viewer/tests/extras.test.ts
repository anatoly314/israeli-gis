import { describe, expect, it } from 'vitest';
import type { Props } from '../src/data.ts';
import { extraFieldsHtml, extraTooltipHtml, fieldItems } from '../src/extras.ts';
import { popupHtml, tooltipHtml } from '../src/popup.ts';
import { layer } from './fixtures.ts';

const areas = layer('ses-2021-statistical-areas');
const props = (code: string) => areas.data.features.get(code)!.props;
const bare = (s: string) => s.replace(/[⁦⁩]/g, '');

describe('extra fields (levels[*].extraFields)', () => {
  it('renders every field the feature has, in manifest order, values marked with their language', () => {
    const html = extraFieldsHtml(areas.level, props('50000813'), 'he');
    expect(html.indexOf('data-field="neighborhoods_he"')).toBeLessThan(html.indexOf('data-field="streets_he"'));
    expect(html).toContain('<span class="extra-label">שכונות באזור</span> <span class="extra-items" lang="he" dir="rtl">שכ פלורנטין');
    expect(html).not.toContain('extra-note'); // values are Hebrew, the UI too
  });

  it('notes the values language in en and ru', () => {
    expect(extraFieldsHtml(areas.level, props('50000813'), 'en')).toContain('Neighborhoods in this area <span class="extra-note">(in Hebrew)</span>');
    expect(extraFieldsHtml(areas.level, props('50000813'), 'ru')).toContain('Кварталы на участке <span class="extra-note">(на иврите)</span>');
  });

  it('skips fields the feature lacks, and renders nothing for a level without extra fields', () => {
    const none = { ...props('50000813') } as Props;
    delete none.neighborhoods_he;
    const html = extraFieldsHtml(areas.level, none, 'en');
    expect(html).not.toContain('neighborhoods_he');
    expect(html).toContain('streets_he');
    delete none.streets_he;
    expect(extraFieldsHtml(areas.level, none, 'en')).toBe('');
    const authorities = layer('ses-2021-local-authorities');
    expect(extraFieldsHtml(authorities.level, authorities.data.features.get('5000')!.props, 'en')).toBe('');
    expect(fieldItems(areas.level.extraFields![0], { ...none, neighborhoods_he: 'not a list' } as Props)).toEqual([]);
  });

  it('caps long lists at 8 items with a "+N more" disclosure', () => {
    const many = { ...props('50000813'), neighborhoods_he: Array.from({ length: 12 }, (_, i) => `שכונה ${i + 1}`) } as Props;
    const html = bare(extraFieldsHtml(areas.level, many, 'en'));
    expect(html).toContain('שכונה 1, שכונה 2, שכונה 3, שכונה 4, שכונה 5, שכונה 6, שכונה 7, שכונה 8</span><details class="extra-more"><summary>+4 more</summary>');
    expect(html).toContain('>, שכונה 9, שכונה 10, שכונה 11, שכונה 12</span></details>');
    expect(bare(extraFieldsHtml(areas.level, many, 'ru'))).toContain('<summary>ещё 4</summary>');
  });

  it('puts the first field, up to three items, on the tooltip', () => {
    const many = { ...props('50000813'), neighborhoods_he: ['א', 'ב', 'ג', 'ד'] } as Props;
    expect(extraTooltipHtml(areas.level, many)).toBe('<span class="extra-items tip-extra" lang="he" dir="rtl">א, ב, ג…</span>');
    expect(extraTooltipHtml(areas.level, { ...many, neighborhoods_he: ['א'] } as Props)).toContain('>א</span>');
    expect(tooltipHtml(areas.layer, areas.level, { ...props('50000813'), _k: 'na' }, 'ru')).toContain('שכ פלורנטין');
  });

  it('puts only the first declared field on the tooltip: none when the area lacks it (SA 812 has only streets)', () => {
    expect(props('50000812').neighborhoods_he).toBeUndefined();
    expect(extraTooltipHtml(areas.level, props('50000812'))).toBe('');
  });

  it('opens the "+N more" list right after the last item, without a stray space before its comma', () => {
    const many = { ...props('50000813'), neighborhoods_he: Array.from({ length: 10 }, (_, i) => `n${i}`) } as Props;
    const html = extraFieldsHtml(areas.level, many, 'en');
    expect(html).toContain('n7</span><details class="extra-more">');
    expect(html).toContain('>, n8, n9</span></details>');
  });

  it('shows the fields in the popup between the header and the values', () => {
    const html = popupHtml(areas.layer, areas.level, { ...props('50000813'), ...areas.values['50000813'], _k: '7' }, 'ru');
    expect(html.indexOf('popup-type')).toBeLessThan(html.indexOf('data-field="neighborhoods_he"'));
    expect(html.indexOf('data-field="streets_he"')).toBeLessThan(html.indexOf('<dl>'));
  });
});

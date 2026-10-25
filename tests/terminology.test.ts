import { describe, expect, it } from 'vitest';
import { LANGS, LevelKind, type I18n, type Manifest } from '../pipeline/lib/contract.ts';
import { DATASET_TITLE } from '../pipeline/datasets/ses-2021/index.ts';
import { assertTerminology, missingCountForms, pluralCategories } from '../pipeline/run.ts';
import { LevelTerms, TERMINOLOGY, TITLE_SEP, layerTitle, levelKind, termsFor } from '../pipeline/terminology.ts';
import { manifest } from './dist.ts';

const complete = (t: I18n | undefined) => LANGS.every((l) => typeof t?.[l] === 'string' && t[l].trim() !== '');

describe('terminology', () => {
  it('has a complete entry (he/en/ru, non-empty) for every level kind', () => {
    for (const kind of LevelKind.options) {
      const t = LevelTerms.parse(TERMINOLOGY[kind]);
      for (const field of [t.title, t.officialTerm, t.featureType, ...Object.values(t.featureTypes ?? {})]) expect(complete(field)).toBe(true);
      if (t.featureLabel) expect(complete(t.featureLabel)).toBe(true);
    }
  });

  it('resolves every manifest level, in all three languages, and the build applied it', () => {
    const m = manifest();
    for (const [id, level] of Object.entries(m.levels)) {
      const t = termsFor(id);
      expect(level.kind).toBe(levelKind(id));
      expect(level.title).toEqual(t.title);
      expect(level.officialTerm).toEqual(t.officialTerm);
      expect(level.featureType).toEqual(t.featureType);
      expect(complete(level.title) && complete(level.officialTerm) && complete(level.featureType)).toBe(true);
    }
    expect(() => assertTerminology(m)).not.toThrow();
  });

  it('resolves a future vintage to the same wording', () => {
    expect(levelKind('statistical-areas-2022')).toBe('statistical-areas');
    expect(termsFor('statistical-areas-2022')).toEqual(termsFor('statistical-areas-2011'));
    expect(levelKind('rc-localities-2030')).toBe('rc-localities');
  });

  it('refuses level ids without a known kind or vintage', () => {
    expect(() => termsFor('schools-2025')).toThrow(/kind/);
    expect(() => termsFor('statistical-areas')).toThrow(/vintage/);
  });

  it('fails the build check when a level carries wording that is not the terminology', () => {
    const m = structuredClone(manifest()) as Manifest;
    m.levels['statistical-areas-2011'].title = { he: 'x', en: 'x', ru: 'x' };
    expect(() => assertTerminology(m)).toThrow(/terminology/);
  });

  it('lists every dataset with its title, the single source of the layer-title prefix', () => {
    const m = manifest();
    expect(m.datasets).toEqual({ 'ses-2021': { title: DATASET_TITLE } });
    for (const layer of m.layers) expect(m.datasets[layer.dataset]).toBeDefined();
    const broken = structuredClone(m) as Manifest;
    broken.datasets['ses-2021'].title = { he: 'א', en: 'A', ru: 'А' };
    expect(() => assertTerminology(broken)).toThrow(/datasets\["ses-2021"\]\.title/);
  });

  it('composes every layer title from the dataset title and the level name', () => {
    const m = manifest();
    for (const layer of m.layers) {
      if (layer.kind !== 'choropleth') continue;
      expect(layer.title).toEqual(layerTitle(m.datasets[layer.dataset].title, layer.level));
      expect(layer.title).toEqual(layerTitle(DATASET_TITLE, layer.level));
      for (const l of LANGS) expect(layer.title[l]).toBe(`${DATASET_TITLE[l]}${TITLE_SEP}${m.levels[layer.level].title[l]}`);
    }
    expect(m.layers.find((l) => l.id === 'ses-2021-statistical-areas')?.title.ru).toBe('Социально-экономический индекс 2021 – Кварталы');
  });
});

describe('approved wording', () => {
  it.each([
    ['local-authorities', ['רשויות מקומיות', 'Municipalities', 'Муниципалитеты'], ['רשויות מקומיות', 'Local authorities', 'органы местного самоуправления']],
    [
      'rc-localities',
      ['קיבוצים, מושבים ויישובים', 'Kibbutzim, moshavim & villages', 'Кибуцы, мошавы и посёлки'],
      ['יישובים במועצות אזוריות', 'Localities in regional councils', 'населённые пункты в региональных советах'],
    ],
    ['statistical-areas', ['שכונות', 'Neighborhoods', 'Кварталы'], ['אזורים סטטיסטיים של הלמ"ס', 'CBS statistical areas', 'статистические районы ЦСБ']],
    ['localities', ['יישובים', 'Localities', 'Населённые пункты'], null],
  ] as const)('%s', (kind, title, official) => {
    const t = TERMINOLOGY[kind];
    expect([t.title.he, t.title.en, t.title.ru]).toEqual(title);
    if (official) expect([t.officialTerm.he, t.officialTerm.en, t.officialTerm.ru]).toEqual(official);
  });

  it('names feature types plainly', () => {
    const sa = TERMINOLOGY['statistical-areas'];
    expect(sa.title).toEqual({ he: 'שכונות', en: 'Neighborhoods', ru: 'Кварталы' });
    expect(sa.featureType).toEqual({ he: 'אזור', en: 'Area', ru: 'Участок' });
    expect(sa.featureLabel).toEqual({ he: '{name} – אזור {sa}', en: '{name} – area {sa}', ru: '{name} – участок {sa}' });
    expect(TERMINOLOGY['local-authorities'].featureTypes).toEqual({
      city: { he: 'עירייה', en: 'City', ru: 'Город' },
      'local-council': { he: 'מועצה מקומית', en: 'Local council', ru: 'Местный совет' },
      'regional-council': { he: 'מועצה אזורית', en: 'Regional council', ru: 'Региональный совет' },
    });
    expect(TERMINOLOGY.localities.featureType.ru).toBe('Населённый пункт');
    expect(TERMINOLOGY['rc-localities'].featureType.ru).toBe('Населённый пункт');
  });

  it('uses one Russian CBS term, "статистические районы", across the manifest', () => {
    const text = JSON.stringify(manifest());
    expect(text).toMatch(/статистические районы ЦСБ/);
    expect(text).not.toMatch(/статистическ\p{L}* участк/iu);
    const mixed = structuredClone(manifest()) as Manifest;
    mixed.sources[0].name.ru = 'ЦСБ, слой статистических участков 2011';
    expect(() => assertTerminology(mixed)).toThrow(/статистические районы/);
  });

  it('counts a place\'s parts with a phrase for every plural category of every language', () => {
    const sa = manifest().levels['statistical-areas-2011'];
    expect(sa.countForms).toEqual(TERMINOLOGY['statistical-areas'].countForms);
    for (const lang of LANGS) for (const c of pluralCategories(lang)) expect(sa.countForms![lang][c], `${lang} ${c}`).toBeTruthy();
    expect(pluralCategories('ru').sort()).toEqual(['few', 'many', 'one']);
    expect(sa.extraFields?.find((f) => f.searchable)?.searchTerm).toEqual({ he: 'שכונה', en: 'neighborhood', ru: 'квартал' });
  });

  it('fails the build when a counted level lacks a plural form or a searchable field lacks its search term', () => {
    const forms = structuredClone(TERMINOLOGY['statistical-areas'].countForms!);
    expect(missingCountForms(forms)).toEqual([]);
    delete forms.ru.few;
    delete forms.he.two;
    expect(missingCountForms(forms)).toEqual(['he.two', 'ru.few']);
    const noFew = structuredClone(manifest()) as Manifest;
    delete noFew.levels['statistical-areas-2011'].countForms!.ru.few;
    expect(() => assertTerminology(noFew)).toThrow(/countForms/);
    const noTerm = structuredClone(manifest()) as Manifest;
    delete noTerm.levels['statistical-areas-2011'].extraFields![0].searchTerm;
    expect(() => assertTerminology(noTerm)).toThrow(/neighborhoods_he/);
    const noForms = structuredClone(manifest()) as Manifest;
    delete noForms.levels['statistical-areas-2011'].countForms;
    expect(() => assertTerminology(noForms)).toThrow(/countForms/);
  });

  it('keeps the dataset title', () => {
    expect(DATASET_TITLE).toEqual({ he: 'מדד חברתי-כלכלי 2021', en: 'Socio-economic index 2021', ru: 'Социально-экономический индекс 2021' });
  });
});

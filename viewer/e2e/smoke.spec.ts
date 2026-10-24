import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Frame, type Page } from '@playwright/test';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/data');

/** Console errors and uncaught exceptions seen by the page. */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const ready = (page: Page | Frame, layer: string) => expect(page.locator('body')).toHaveAttribute('data-layer', layer);
const bare = (s: string | null) => (s ?? '').replace(/[⁦⁩]/g, '');

/** Characters of each matched element in visual left-to-right order (what the user actually sees). */
function visualText(page: Page, selector: string) {
  return page.$$eval(selector, (els) =>
    els.map((el) => {
      const chars: { c: string; x: number; y: number }[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const t = n as Text;
        for (let i = 0; i < t.length; i++) {
          const r = document.createRange();
          r.setStart(t, i);
          r.setEnd(t, i + 1);
          const b = r.getBoundingClientRect();
          if (b.width > 0) chars.push({ c: t.data[i], x: b.left, y: Math.round(b.top) });
        }
      }
      chars.sort((a, b) => a.y - b.y || a.x - b.x);
      return chars.map((c) => c.c).join('');
    }),
  );
}

async function searchAndOpen(page: Page, query: string, expected: RegExp) {
  const box = page.getByRole('combobox');
  await box.fill(query);
  const first = page.getByRole('option').first();
  await expect(first).toContainText(expected);
  await box.press('Enter');
  const popup = page.locator('.maplibregl-popup');
  await expect(popup).toBeVisible();
  await expect(popup.locator('h3')).toContainText(expected);
}

test('loads, switches layers, searches in three scripts, flips direction', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./?lang=he');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await ready(page, 'ses-2021-local-authorities');
  await expect(page.locator('#legend [data-key]')).toHaveCount(11);

  await searchAndOpen(page, 'תל אביב', /תל אביב/);
  await expect(page.locator('.maplibregl-popup')).toContainText('עירייה');

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await searchAndOpen(page, 'Tel Aviv', /Tel Aviv/);

  await page.getByRole('button', { name: 'Русский' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('.maplibregl-ctrl-zoom-in')).toHaveAttribute('aria-label', 'Приблизить');
  await searchAndOpen(page, 'Тель-Авив', /Тель-Авив/);
  await expect(page).toHaveURL(/f=5000/);

  // On the statistical-areas layer the same query offers the city's areas first and stays on that layer.
  await page.getByRole('radio', { name: 'Статистические районы' }).check();
  await ready(page, 'ses-2021-statistical-areas');
  await expect(page).toHaveURL(/layer=ses-2021-statistical-areas/);
  await page.getByRole('combobox').fill('Тель-Авив');
  await expect(page.getByRole('option').first()).toContainText(/Статистические районы/);
  await page.getByRole('combobox').press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-layer', 'ses-2021-statistical-areas');

  await page.getByRole('button', { name: 'עברית' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.maplibregl-ctrl-zoom-in')).toHaveAttribute('aria-label', 'הגדלת התצוגה');

  await page.locator('#legend [data-key="1"]').click();
  await expect(page).toHaveURL(/hl=1/);

  expect(errors).toEqual([]);
});

test('keyboard: search → pick → Escape closes the popup and returns to the search box', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./?lang=en');
  await ready(page, 'ses-2021-local-authorities');
  await page.keyboard.press('Tab'); // first stop: the language switch or search, both in the panel before the map
  const box = page.getByRole('combobox');
  await box.focus();
  await page.keyboard.type('Haifa');
  await expect(page.getByRole('option').first()).toContainText('Haifa');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('.maplibregl-popup')).toBeVisible();
  await expect(page.locator('.maplibregl-popup-close-button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
  await expect(box).toBeFocused();
  // Escape also closes a popup when focus sits on a layer radio.
  await box.fill('Haifa');
  await box.press('Enter');
  await expect(page.locator('.maplibregl-popup')).toBeVisible();
  await page.getByRole('radio', { name: 'Local authorities' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('embed mode is compact and links to the full map', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 720, height: 640 });
  await page.goto('./?embed=1&lang=en&layer=ses-2021-localities&hl=8,9,10');
  await ready(page, 'ses-2021-localities');
  await expect(page.locator('body')).toHaveClass(/compact/);
  await expect(page.locator('#strip [aria-pressed=true]')).toHaveCount(3);
  await expect(page.locator('[data-preset=high]')).toHaveAttribute('aria-pressed', 'true');
  const full = page.locator('#fullscreen');
  await expect(full).toHaveAttribute('href', /layer=ses-2021-localities/);
  expect(await full.getAttribute('href')).not.toContain('embed');
  expect(errors).toEqual([]);
});

const blogPost = (src: string) => {
  const para = `<p>${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(12)}</p>`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
    body{font:16px/1.6 Georgia,serif;max-width:760px;margin:0 auto;padding:16px} iframe{width:100%;height:650px;border:0;display:block}
  </style></head><body><h1>Post</h1>${para.repeat(3)}<iframe id="m" src="${src}" title="map"></iframe>${para.repeat(8)}</body></html>`;
};

test('650 px iframe in a blog post: frames Israel, and the wheel scrolls the page', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.setContent(blogPost(`${baseURL}?embed=1&lang=he`));
  await page.evaluate(() => document.getElementById('m')!.scrollIntoView({ block: 'center' }));
  const frame = (await (await page.$('#m'))!.contentFrame())!;
  const frameErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && frameErrors.push(m.text()));
  await ready(frame, 'ses-2021-local-authorities');
  await page.waitForTimeout(1500);
  if (process.env.SCREENS) await page.screenshot({ path: path.join(process.env.SCREENS, 'embed-650.png') });
  const hash = await frame.evaluate(() => location.hash);
  const [zoom, lat, lon] = hash.slice(1).split('/').map(Number);
  expect(zoom).toBeGreaterThan(6); // was 5.57 when the sheet was counted twice
  expect(lat).toBeGreaterThan(30.5);
  expect(lat).toBeLessThan(32.5);
  expect(lon).toBeGreaterThan(34.5);
  expect(lon).toBeLessThan(35.5);

  const box = (await (await page.$('#m'))!.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const y0 = await page.evaluate(() => scrollY);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(y0);
  expect(await frame.evaluate(() => location.hash)).toBe(hash);
  expect(frameErrors).toEqual([]);
});

test('mobile 390×844: no horizontal scroll, the sheet and popup are usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto('./?lang=ru');
  await ready(page, 'ses-2021-local-authorities');
  await expect(page.locator('body')).toHaveClass(/compact/);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  // Strip buttons are finger-sized.
  const cell = (await page.locator('#strip [data-key="1"]').boundingBox())!;
  expect(cell.height).toBeGreaterThanOrEqual(40);

  await page.locator('#sheet-toggle').tap();
  await expect(page.getByRole('radio', { name: 'Населённые пункты региональных советов' })).toBeVisible();
  await page.getByRole('radio', { name: 'Населённые пункты региональных советов' }).tap();
  await ready(page, 'ses-2021-localities');
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.getByRole('combobox').fill('Кфар-Сава');
  await page.getByRole('option').first().tap();
  const popup = page.locator('.maplibregl-popup');
  await expect(popup).toBeVisible();
  const b = (await popup.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(390);
  await page.locator('.maplibregl-popup-close-button').tap();
  await expect(popup).toHaveCount(0);
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  await context.close();
});

test('search placeholder sits clear of the icon at 358 and 390 px in every language', async ({ browser }) => {
  for (const width of [358, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 700 } });
    const page = await context.newPage();
    for (const lang of ['he', 'en', 'ru'] as const) {
      await page.goto(`./?lang=${lang}&embed=1`);
      const input = page.getByRole('combobox');
      await expect(input).toHaveAttribute('placeholder', /.+/);
      const s = await input.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { direction: cs.direction, left: cs.paddingLeft, right: cs.paddingRight, overflow: cs.textOverflow, bg: cs.backgroundPositionX };
      });
      const rtl = lang === 'he';
      expect(s.direction, `${lang} ${width}`).toBe(rtl ? 'rtl' : 'ltr');
      // The 34 px padding is on the icon's side.
      expect([s.left, s.right]).toEqual(rtl ? ['10px', '34px'] : ['34px', '10px']);
      expect(s.bg.startsWith('calc')).toBe(rtl);
      expect(s.overflow).toBe('ellipsis');
      // Typed Latin text in the Hebrew UI takes its own direction.
      if (rtl) {
        await input.fill('Tel Aviv');
        expect(await input.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
        await input.fill('');
      }
      if (process.env.SCREENS && width === 358) await page.locator('#top').screenshot({ path: path.join(process.env.SCREENS, `top-358-${lang}.png`) });
    }
    await context.close();
  }
});

test('popup close button is finger-sized on touch', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('./?lang=en&f=5000');
  await ready(page, 'ses-2021-local-authorities');
  const b = (await page.locator('.maplibregl-popup-close-button').boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(40);
  expect(b.height).toBeGreaterThanOrEqual(40);
  await context.close();
});

/** A hypothetical stepped layer (crime rate, negative bounds) injected into the manifest, as in the review. */
function steppedFixture() {
  const manifest = JSON.parse(fs.readFileSync(path.join(DATA, 'layers.json'), 'utf8'));
  const topo = JSON.parse(fs.readFileSync(path.join(DATA, 'geometry/localities-2011.topo.json'), 'utf8'));
  const codes: string[] = topo.objects['localities-2011'].geometries.map((g: { properties: { code: string } }) => g.properties.code);
  const values: Record<string, { rate: number; count: number }> = {};
  codes.forEach((c, i) => {
    if (i % 7 !== 0) values[c] = { rate: Math.round(((i * 37) % 300) / 10 - 3) + 0.25 * (i % 4) - 0.5, count: (i * 13) % 500 };
  });
  values['6900'] = { rate: -1.5, count: 42 }; // Kfar Saba: below the first break
  manifest.layers.push({
    ...manifest.layers[0],
    id: 'crime-2024-localities',
    dataset: 'crime-2024',
    title: { he: 'שיעור פשיעה 2024', en: 'Crime rate 2024', ru: 'Уровень преступности 2024' },
    data: 'datasets/crime-2024/localities-2011.json',
    valueField: 'rate',
    level: 'localities-2011',
    classification: {
      type: 'stepped',
      breaks: [-1, 0, 5, 10, 20],
      colors: ['#2166ac', '#67a9cf', '#d1e5f0', '#fddbc7', '#ef8a62', '#b2182b'],
      missing: manifest.layers[0].classification.missing,
    },
    popup: [
      { field: 'rate', label: { he: 'שיעור', en: 'Rate', ru: 'Уровень' }, format: { type: 'decimal', decimals: 2 } },
      { field: 'count', label: { he: 'מספר תיקים', en: 'Cases', ru: 'Дела' }, format: { type: 'integer' } },
    ],
  });
  return { manifest, values, topo };
}

test('a stepped layer: legend, presets and popup read correctly in Hebrew', async ({ page }) => {
  const errors = collectErrors(page);
  const { manifest, values, topo } = steppedFixture();
  await page.route('**/data/layers.json', (r) => r.fulfill({ json: manifest }));
  await page.route('**/data/datasets/crime-2024/localities-2011.json', (r) => r.fulfill({ json: values }));
  // localities-2011 is not shipped in dist/site (no layer uses it yet), so serve it for the injected layer.
  await page.route('**/data/geometry/localities-2011.topo.json', (r) => r.fulfill({ json: topo }));
  await page.goto('./?lang=he&layer=crime-2024-localities');
  await ready(page, 'crime-2024-localities');

  expect(await visualText(page, '#legend .legend-list button span:last-child')).toEqual([
    '< -1',
    '-1 – 0',
    '0 – 5',
    '5 – 10',
    '10 – 20',
    '≥ 20',
    'בשוח אל', // "לא חושב", Hebrew in visual (right-to-left) order
  ]);
  expect((await page.locator('.legend-actions button').allTextContents()).map(bare).slice(0, 2)).toEqual(['נמוכים < 5', 'גבוהים ≥ 5']);
  // Visual order in RTL: the isolated range sits left of the Hebrew word and reads "< 5", not "5 >".
  expect(await visualText(page, '[data-preset]')).toEqual(['< 5 םיכומנ', '≥ 5 םיהובג']);

  await page.getByRole('combobox').fill('כפר סבא');
  await expect(page.getByRole('option').first()).toContainText('כפר סבא');
  await page.getByRole('combobox').press('Enter');
  const dd = page.locator('.popup dd').first();
  await expect(dd).toBeVisible();
  // The actual value, then the bin as secondary text; both read left-to-right inside the RTL popup.
  expect(await visualText(page, '.popup dd >> nth=0 >> span:not(.swatch)')).toEqual(['-1.50', '< -1']);
  expect(bare(await dd.locator('.bin').textContent())).toBe('< -1');
  expect(bare(await page.locator('.popup dd').nth(1).textContent())).toBe('42');
  expect(errors).toEqual([]);
});

// SCREENS=<dir> npm run test:e2e also saves screenshots of the main views (plus embed-650.png above).
test('screenshots', async ({ page }) => {
  const dir = process.env.SCREENS;
  test.skip(!dir, 'set SCREENS=<dir> to capture');
  const shot = async (name: string) => {
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(dir!, name) });
  };
  await page.goto('./?lang=he#7.2/31.6/34.95');
  await ready(page, 'ses-2021-local-authorities');
  await shot('desktop-he.png');
  await page.getByRole('combobox').fill('באר שבע');
  await page.getByRole('combobox').press('Enter');
  await shot('desktop-he-popup.png');

  await page.goto('./?lang=en&layer=ses-2021-statistical-areas&hl=1,2,3#11/32.08/34.8');
  await ready(page, 'ses-2021-statistical-areas');
  await page.mouse.move(640, 420);
  await shot('desktop-en.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?lang=ru&layer=ses-2021-localities#8.6/32.75/35.3');
  await ready(page, 'ses-2021-localities');
  await page.getByRole('combobox').fill('Кфар');
  await shot('mobile-ru.png');
  await page.getByRole('combobox').press('Enter');
  await shot('mobile-ru-popup.png');
  await page.locator('#sheet-toggle').click();
  await shot('mobile-ru-sheet.png');
});

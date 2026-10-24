import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { contrast } from '../src/classify.ts';

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

/** A one-finger drag through CDP touch events (Playwright has no touch-drag helper). */
async function touchDrag(page: Page, x0: number, y: number, x1: number) {
  const cdp = await page.context().newCDPSession(page);
  const at = (x: number) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(x0) });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(x0 + ((x1 - x0) * i) / 8) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Centre of the thumb for class index `v` of an `n`-class slider (thumb centres run from t/2 to width - t/2). */
async function thumbX(page: Page, v: number, n: number) {
  const input = page.locator('#range .hi');
  const b = (await input.boundingBox())!;
  const t = b.height;
  const rtl = (await page.locator('html').getAttribute('dir')) === 'rtl';
  const offset = t / 2 + (v * (b.width - t)) / (n - 1);
  return { x: rtl ? b.x + b.width - offset : b.x + offset, y: b.y + b.height / 2 };
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
  await page.getByRole('radio', { name: 'Кварталы' }).check();
  await ready(page, 'ses-2021-statistical-areas');
  await expect(page).toHaveURL(/layer=ses-2021-statistical-areas/);
  await page.getByRole('combobox').fill('Тель-Авив');
  await expect(page.getByRole('option').first()).toContainText(/Кварталы/);
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
  await page.getByRole('radio', { name: 'Municipalities' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.maplibregl-popup')).toHaveCount(0);
  expect(errors).toEqual([]);
});

const pressed = (page: Page) => page.locator('#legend .legend-list [aria-pressed=true]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key));

for (const lang of ['en', 'he'] as const) {
  test(`range slider (${lang}): keyboard and drag set a contiguous highlight; legend clicks make it custom`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`./?lang=${lang}`);
    await ready(page, 'ses-2021-local-authorities');
    const rtl = lang === 'he';
    const down = rtl ? 'ArrowRight' : 'ArrowLeft'; // towards class 1, which is on the right in Hebrew
    const up = rtl ? 'ArrowLeft' : 'ArrowRight';
    const out = page.locator('#range output');

    // Class 1 is at the start of the reading direction, like the strip and the legend.
    const x1 = (await page.locator('#range .range-scale span[data-key="1"]').boundingBox())!.x;
    const x10 = (await page.locator('#range .range-scale span[data-key="10"]').boundingBox())!.x;
    expect(rtl ? x1 > x10 : x1 < x10).toBe(true);
    await expect(page.locator('#range .lo')).toHaveAttribute('aria-label', rtl ? 'הקבוצה הנמוכה בטווח' : 'Minimum class');

    await page.locator('#range .hi').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press(down);
    await expect(page).toHaveURL(/hl=1-7(&|#|$)/);
    expect(await pressed(page)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    await expect(page.locator('#range .hi')).toHaveAttribute('aria-valuetext', rtl ? 'אשכול 7' : 'Cluster 7');
    await page.locator('#range .lo').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press(up);
    await expect(page).toHaveURL(/hl=4-7(&|#|$)/);
    expect(bare(await out.textContent())).toBe('4–7');
    // Handles can't cross, and may meet.
    for (let i = 0; i < 6; i++) await page.keyboard.press(up);
    await expect(page).toHaveURL(/hl=7(&|#|$)/);
    expect(await pressed(page)).toEqual(['7']);

    // Drag the max handle (mouse) from 7 to 9.
    const from = await thumbX(page, 6, 10);
    const to = await thumbX(page, 8, 10);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await expect(page).toHaveURL(/hl=7-9(&|#|$)/);
    expect(await pressed(page)).toEqual(['7', '8', '9']);

    // Legend clicks make a non-contiguous ("custom") selection; the handles frame it.
    await page.locator('#range .range-clear').click();
    await expect(page).not.toHaveURL(/hl=/);
    for (const k of ['1', '5', '9']) await page.locator(`#legend [data-key="${k}"]`).click();
    await expect(page).toHaveURL(/hl=1,5,9(&|#|$)/);
    await expect(page.locator('#range')).toHaveClass(/custom/);
    expect(bare(await out.textContent())).toBe(`1, 5, 9 · ${rtl ? 'בחירה חופשית' : 'custom'}`);
    await expect(page.locator('#range .lo')).toHaveValue('0');
    await expect(page.locator('#range .hi')).toHaveValue('8');
    // Moving a handle turns it back into a contiguous range.
    await page.locator('#range .hi').focus();
    await page.keyboard.press(down);
    await expect(page).toHaveURL(/hl=1-8(&|#|$)/);
    await expect(page.locator('#range')).not.toHaveClass(/custom/);
    if (process.env.SCREENS && test.info().project.name === 'chromium') {
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(process.env.SCREENS, `slider-${lang}.png`) });
    }
    expect(errors).toEqual([]);
  });

  test(`range slider (${lang}): collapsed handles widen both ways; a tap on the scale moves the nearer handle`, async ({ page, browserName }) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1280, height: 700 });
    const drag = async (from: number, to: number) => {
      const a = await thumbX(page, from, 10);
      const b = await thumbX(page, to, 10);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 10 });
      await page.mouse.up();
    };
    for (const [to, expected] of [
      [1, '2-5'], // towards lower classes: the low handle follows
      [7, '5-8'], // towards higher classes: the high one
    ] as const) {
      await page.goto(`./?lang=${lang}&hl=5`);
      await ready(page, 'ses-2021-local-authorities');
      // On a 700 px window the slider is visible without scrolling the panel.
      const box = (await page.locator('#range .range-track').boundingBox())!;
      expect(box.y + box.height).toBeLessThan(700);
      await expect(page.locator('#range .range-track')).toBeInViewport();
      await drag(4, to);
      await expect(page).toHaveURL(new RegExp(`hl=${expected}(&|#|$)`));
    }
    // A tap on the colour scale moves the nearer handle (here the high one, 8 → 10).
    const ten = await page.locator('#range .range-scale span[data-key="10"]').boundingBox();
    await page.mouse.click(ten!.x + ten!.width / 2, ten!.y + ten!.height / 2);
    await expect(page).toHaveURL(/hl=5-10(&|#|$)/);
    // Focus order: handles, then Clear (in the DOM; WebKit on macOS doesn't Tab to buttons by default).
    expect(await page.locator('#range .hi').evaluate((hi) => Boolean(hi.compareDocumentPosition(document.querySelector('#range .range-clear')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    if (browserName !== 'webkit') {
      await page.locator('#range .hi').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('#range .range-clear')).toBeFocused();
    }
    // The full range is no highlight at all, however it is reached.
    const one = await page.locator('#range .range-scale span[data-key="1"]').boundingBox();
    await page.mouse.click(one!.x + one!.width / 2, one!.y + one!.height / 2);
    await expect(page).not.toHaveURL(/hl=/);
    await expect(page.locator('#range')).toHaveClass(/empty/);
    expect(errors).toEqual([]);
  });
}

test('a full selection made in the legend, or a full-range link, means no highlight', async ({ page }) => {
  await page.goto('./?lang=en&hl=1-10');
  await ready(page, 'ses-2021-local-authorities');
  await expect(page).not.toHaveURL(/hl=/);
  for (let k = 1; k <= 10; k++) await page.locator(`#legend [data-key="${k}"]`).click();
  await expect(page).not.toHaveURL(/hl=/);
  await expect(page.locator('#legend .legend-list')).not.toHaveClass(/filtering/);
});

for (const lang of ['he', 'ru'] as const) {
  test(`neighborhood search (${lang}): "פלורנטין" finds its statistical area and the popup lists the neighborhood`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`./?lang=${lang}`);
    await ready(page, 'ses-2021-local-authorities');
    const box = page.getByRole('combobox');
    // With no match, the en/ru empty state says which fields are searched in Hebrew.
    await box.fill('qqqzzz');
    await expect(page.locator('#results .empty')).toBeVisible();
    if (lang === 'ru') await expect(page.locator('#results .empty-hint')).toHaveText('Также ищутся: Кварталы (на иврите)');
    else await expect(page.locator('#results .empty-hint')).toHaveCount(0);
    await box.fill('פלורנטין');
    const first = page.getByRole('option').first();
    await expect(first.locator('.result-via')).toHaveText('שכ פלורנטין');
    // The level has one feature type, so the row shows only the level title (no "Квартал · Кварталы").
    await expect(first.locator('.result-meta')).toHaveText(lang === 'he' ? 'שכונות' : 'Кварталы');
    await expect(first).toContainText(lang === 'he' ? 'תל אביב -יפו – אזור 813' : 'Тель-Авив – участок 813');
    if (process.env.SCREENS && lang === 'he' && test.info().project.name === 'chromium') {
      await page.screenshot({ path: path.join(process.env.SCREENS, 'sa-search-neighborhood.png') });
    }
    await box.press('Enter');
    await ready(page, 'ses-2021-statistical-areas');
    await expect(page).toHaveURL(/f=50000813/);
    const line = page.locator('.popup [data-field="neighborhoods_he"]');
    await expect(line).toContainText('שכ פלורנטין');
    await expect(line.locator('.extra-items')).toHaveAttribute('lang', 'he');
    await expect(line.locator('.extra-label')).toHaveText(lang === 'he' ? 'שכונות באזור' : 'Кварталы на участке (на иврите)');
    await expect(page.locator('.popup [data-field="streets_he"]')).toBeVisible();
    if (process.env.SCREENS && test.info().project.name === 'chromium') {
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(process.env.SCREENS, `sa-popup-${lang}.png`) });
    }
    expect(errors).toEqual([]);
  });
}

test('statistical-area tooltip shows the first neighborhoods on a second line', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./?lang=en&layer=ses-2021-statistical-areas&f=50000813');
  await ready(page, 'ses-2021-statistical-areas');
  await expect(page.locator('.maplibregl-popup')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  // The area is framed in the part of the map the panel leaves free; sweep that centre until its tooltip shows.
  const tip = page.locator('#tooltip');
  let found = false;
  for (let dy = -60; dy <= 60 && !found; dy += 20) {
    for (let dx = -80; dx <= 80 && !found; dx += 20) {
      await page.mouse.move(790 + dx, 400 + dy);
      await page.waitForTimeout(60);
      found = (await tip.isVisible()) && (await tip.textContent())!.includes('area 813');
    }
  }
  expect(found).toBe(true);
  await expect(tip.locator('.tip-extra')).toHaveText(/שכ פלורנטין/);
  await expect(tip.locator('.tip-extra')).toHaveAttribute('lang', 'he');
  expect(errors).toEqual([]);
});

test('embed mode is compact and links to the full map', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 720, height: 640 });
  await page.goto('./?embed=1&lang=en&layer=ses-2021-localities&hl=8,9,10');
  await ready(page, 'ses-2021-localities');
  await expect(page.locator('body')).toHaveClass(/compact/);
  await expect(page.locator('#strip [aria-pressed=true]')).toHaveCount(3);
  // An old list link still works, and is rewritten in the compact range form.
  await expect(page.locator('#range output')).toHaveText(/8–10/);
  await expect(page).toHaveURL(/hl=8-10/);
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
  await expect(frame.locator('#range .range-track')).toBeVisible();
  expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
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

  // The range slider sits right under the strip, finger-sized, and works by touch.
  const track = page.locator('#range .range-track');
  await expect(track).toBeVisible();
  const tb = (await track.boundingBox())!;
  expect(tb.height).toBeGreaterThanOrEqual(40);
  expect(tb.x + tb.width).toBeLessThanOrEqual(390);
  // Drag the max handle from the end to about the middle with a finger.
  const tx = (v: number) => tb.x + 20 + (v * (tb.width - 40)) / 9;
  await touchDrag(page, tx(9), tb.y + tb.height / 2, tx(4));
  await expect(page).toHaveURL(/hl=1-[4-6](&|#|$)/);
  const n = Number(/hl=1-(\d+)/.exec(page.url())![1]);
  await expect(page.locator('#strip [aria-pressed=true]')).toHaveCount(n);
  expect(await overflow()).toBeLessThanOrEqual(0);

  await page.locator('#sheet-toggle').tap();
  await expect(page.getByRole('radio', { name: 'Кибуцы, мошавы и посёлки' })).toBeVisible();
  await page.getByRole('radio', { name: 'Кибуцы, мошавы и посёлки' }).tap();
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
  manifest.datasets['crime-2024'] = { title: { he: 'שיעור פשיעה 2024', en: 'Crime rate 2024', ru: 'Уровень преступности 2024' } };
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

test('a stepped layer: legend, range slider and popup read correctly in Hebrew', async ({ page }) => {
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
  await expect(page.locator('[data-preset]')).toHaveCount(0); // the slider replaced the presets
  // The slider covers the six bins, not "not calculated"; its label reads left-to-right inside Hebrew.
  await expect(page.locator('#range .range-scale span')).toHaveCount(6);
  await page.locator('#range .hi').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); // RTL: right lowers the value
  await expect(page).toHaveURL(/hl=s0-s2/);
  expect(await visualText(page, '#range output')).toEqual(['< 5']);
  await page.locator('#range .lo').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/hl=s1-s2/);
  expect(await visualText(page, '#range output')).toEqual(['-1 – 5']);
  await page.locator('#range .range-clear').click();

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
  await expect(page.getByRole('option').first()).toContainText('באר שבע');
  await page.getByRole('combobox').press('Enter');
  await expect(page.locator('.maplibregl-popup')).toBeVisible();
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

  await page.goto('./?lang=ru&layer=ses-2021-localities&hl=3-6#8.6/32.75/35.3');
  await ready(page, 'ses-2021-localities');
  await shot('slider-mobile-ru.png');
});

// Colour-vision deficiency, simulated with Machado et al. (2009) matrices at full severity, applied in linear RGB
// to the whole page (the map canvas included) through an SVG filter.
const CVD = {
  deuteranopia: '0.367322 0.860646 -0.227968 0 0  0.280085 0.672501 0.047413 0 0  -0.011820 0.042940 0.968881 0 0  0 0 0 1 0',
  protanopia: '0.152286 1.052583 -0.204868 0 0  0.114503 0.786281 0.099216 0 0  -0.003882 -0.048116 1.051998 0 0  0 0 0 1 0',
};

const RDYLBU = ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'];
const toHex = (css: string) => {
  const [r, g, b] = css.match(/\d+(\.\d+)?/g)!.map(Number);
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
};

for (const lang of ['he', 'en', 'ru'] as const) {
  test(`palette (${lang}): legend, slider and strip show RdYlBu, strip numbers at ≥ 4.5:1`, async ({ page }) => {
    await page.goto(`./?lang=${lang}`);
    await ready(page, 'ses-2021-local-authorities');
    const bg = (sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    expect((await bg('#legend .legend-list li:not(:last-child) .swatch')).map(toHex)).toEqual(RDYLBU);
    expect((await bg('#range .range-scale span')).map(toHex)).toEqual(RDYLBU);

    // The compact strip (embed): every number readable on its colour.
    await page.setViewportSize({ width: 390, height: 760 });
    await page.goto(`./?lang=${lang}&embed=1`);
    await ready(page, 'ses-2021-local-authorities');
    const cells = await page
      .locator('#strip .strip-row button[data-key]:not(.swatch-missing)')
      .evaluateAll((els) => els.map((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]));
    expect(cells.map(([b]) => toHex(b))).toEqual(RDYLBU);
    for (const [b, fg] of cells) expect(contrast(toHex(b), toHex(fg)), `${b} / ${fg}`).toBeGreaterThanOrEqual(4.5);
  });
}

test('palette screenshots: zoom 7 and 12, and under simulated colour-vision deficiency', async ({ page }) => {
  const dir = process.env.SCREENS;
  test.skip(!dir || test.info().project.name !== 'chromium', 'set SCREENS=<dir> to capture (Chromium)');
  const shot = async (name: string) => {
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(dir!, name) });
  };
  await page.goto('./?lang=en#7/31.75/35.0');
  await ready(page, 'ses-2021-local-authorities');
  await shot('palette-z7.png');
  for (const [name, matrix] of Object.entries(CVD)) {
    await page.evaluate(([id, m]) => {
      document.getElementById('cvd')?.remove();
      document.body.insertAdjacentHTML(
        'beforeend',
        `<svg id="cvd" width="0" height="0" style="position:absolute"><filter id="cvd-${id}" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="${m}"/></filter></svg>`,
      );
      document.documentElement.style.filter = `url(#cvd-${id})`;
    }, [name, matrix]);
    await shot(`palette-${name}.png`);
  }
  await page.evaluate(() => (document.documentElement.style.filter = ''));
  await page.goto('./?lang=he&layer=ses-2021-statistical-areas#12.3/32.07/34.79');
  await ready(page, 'ses-2021-statistical-areas');
  await shot('palette-z12.png');
  // West Bank placeholder markers (Rimmonim, Pesagot…), pale classes included, on the localities layer.
  await page.goto('./?lang=en&layer=ses-2021-localities#10/31.92/35.27');
  await ready(page, 'ses-2021-localities');
  await shot('palette-z10-westbank.png');
});

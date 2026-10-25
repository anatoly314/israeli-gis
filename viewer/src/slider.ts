import { MISSING, classKeys, isOrdered, layerUnit, legendEntries, spanText } from './classify.ts';
import { esc } from './html.ts';
import { t, type Lang } from './i18n.ts';
import type { Layer } from './manifest.ts';
import { rangeToSelection, selectionToRange } from './range.ts';

/**
 * Two-handle range over the layer's classes (scale order, "not calculated" left out).
 *
 * The two native range inputs draw the thumbs and carry focus, ARIA and keyboard; pointer input is handled on the
 * track instead, so it behaves the same in every engine: a press moves the nearer handle to the class under it (a tap
 * on the colour scale works too), and when the handles sit on one class the first movement decides which one follows
 * (towards lower classes: the low one). The slider runs in the page direction, so in Hebrew class 1 is on the right
 * and ←/→ step the way they point.
 *
 * `onChange(keys, done)` fires on every move (one per animation frame) and with `done` once the move ends.
 */
export function createSlider(root: HTMLElement, onChange: (keys: string[], done: boolean) => void) {
  let built = '';
  let keys: string[] = [];
  let labels: string[] = [];
  let layer: Layer | null = null;
  let lang: Lang = 'he';
  let lo: HTMLInputElement;
  let hi: HTMLInputElement;
  let track: HTMLElement;
  let frame = 0;

  const rtl = () => getComputedStyle(track).direction === 'rtl';
  const val = (el: HTMLInputElement) => Number(el.value);

  function emit(done: boolean) {
    const sel = rangeToSelection(keys, val(lo), val(hi));
    cancelAnimationFrame(frame);
    if (done) onChange(sel, true);
    else frame = requestAnimationFrame(() => onChange(sel, false));
  }

  /** Moves one handle, never past the other. Returns whether anything changed. */
  function set(el: HTMLInputElement, v: number): boolean {
    const clamped = el === lo ? Math.min(Math.max(v, 0), val(hi)) : Math.max(Math.min(v, keys.length - 1), val(lo));
    if (clamped === val(el)) return false;
    el.value = String(clamped);
    return true;
  }

  /** Class index under a pointer x (thumb centres run from t/2 to width - t/2). */
  function valueAt(x: number): number {
    const r = track.getBoundingClientRect();
    const t = lo.getBoundingClientRect().height;
    const from = rtl() ? r.right - t / 2 - x : x - r.left - t / 2;
    const f = from / Math.max(1, r.width - t);
    return Math.max(0, Math.min(keys.length - 1, Math.round(f * (keys.length - 1))));
  }

  function bindPointer() {
    let handle: HTMLInputElement | null = null;
    let start = 0;
    track.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const v = valueAt(ev.clientX);
      start = v;
      const [a, b] = [val(lo), val(hi)];
      // Same class: wait for the first move to pick the handle; otherwise the nearer one (ties go outward).
      handle = a === b ? (v < a ? lo : v > b ? hi : null) : v <= a ? lo : v >= b ? hi : v - a < b - v ? lo : hi;
      (handle ?? hi).focus({ preventScroll: true });
      track.setPointerCapture(ev.pointerId);
      if (handle && set(handle, v)) emit(false);
    });
    track.addEventListener('pointermove', (ev) => {
      if (!track.hasPointerCapture(ev.pointerId)) return;
      const v = valueAt(ev.clientX);
      if (!handle) {
        if (v === start) return;
        handle = v < start ? lo : hi;
        handle.focus({ preventScroll: true });
      }
      if (set(handle, v)) emit(false);
    });
    const end = (ev: PointerEvent) => {
      if (!track.hasPointerCapture(ev.pointerId)) return;
      track.releasePointerCapture(ev.pointerId);
      handle = null;
      emit(true);
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
  }

  function build() {
    const { classes } = legendEntries(layer!.classification, lang, layerUnit(layer!));
    keys = classKeys(layer!.classification);
    labels = classes.map((c) => c.label);
    const last = keys.length - 1;
    const input = (cls: string, label: string, value: number) =>
      `<input type="range" class="${cls}" min="0" max="${last}" step="1" value="${value}" aria-label="${esc(label)}">`;
    // Nominal categories have no order, so no range to drag.
    root.hidden = keys.length < 2 || !isOrdered(layer!.classification);
    root.innerHTML =
      `<div class="range-head"><span class="range-title">${esc(t('range', lang))}</span>` +
      `<output class="range-value" aria-live="off"></output></div>` +
      `<div class="range-row"><div class="range-track" style="--n:${keys.length}">` +
      `<div class="range-scale" aria-hidden="true">${classes.map((c) => `<span data-key="${esc(c.key)}" style="--c:${esc(c.color)}"></span>`).join('')}</div>` +
      input('lo', t('rangeMin', lang), 0) +
      input('hi', t('rangeMax', lang), last) +
      `</div><button type="button" class="range-clear">${esc(t('clear', lang))}</button></div>`;
    lo = root.querySelector('.lo')!;
    hi = root.querySelector('.hi')!;
    track = root.querySelector('.range-track')!;
    for (const el of [lo, hi]) {
      // Native keys (↑/↓, Home/End, PgUp/PgDn) may push past the other handle: clamp.
      el.addEventListener('input', () => {
        set(el, val(el));
        emit(false);
      });
      el.addEventListener('change', () => emit(true));
      // ←/→ step the way they point on screen. Engines disagree on RTL ranges (WebKit reverses), so do it here.
      el.addEventListener('keydown', (ev) => {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        ev.preventDefault();
        const step = (ev.key === 'ArrowRight' ? 1 : -1) * (rtl() ? -1 : 1);
        if (set(el, val(el) + step)) emit(true);
      });
    }
    bindPointer();
    root.querySelector('.range-clear')!.addEventListener('click', () => onChange([], true));
  }

  return {
    /** Shows `hl` on the slider; rebuilds only when the layer or language changed, so a drag is never interrupted. */
    update(next: Layer, hl: readonly string[], nextLang: Lang) {
      const id = `${next.id}|${nextLang}`;
      layer = next;
      lang = nextLang;
      if (id !== built) {
        built = id;
        build();
      }
      const { min, max, custom } = selectionToRange(keys, hl);
      const empty = hl.length === 0;
      if (val(lo) !== min) lo.value = String(min);
      if (val(hi) !== max) hi.value = String(max);
      lo.setAttribute('aria-valuetext', labels[min]);
      hi.setAttribute('aria-valuetext', labels[max]);

      const c = layer.classification;
      const unit = layerUnit(layer);
      let text = spanText(c, keys[0], keys[keys.length - 1], lang, unit);
      if (!empty && !custom) text = spanText(c, keys[min], keys[max], lang, unit);
      if (custom) {
        const { classes, missing } = legendEntries(c, lang, unit);
        const picked = classes.filter((x) => hl.includes(x.key)).map((x) => x.short);
        if (hl.includes(MISSING)) picked.push(missing.label);
        text = `${picked.join(', ')} · ${t('rangeCustom', lang)}`;
      }
      root.querySelector('output')!.textContent = empty ? `${text} · ${t('rangeAll', lang)}` : text;
      root.classList.toggle('custom', custom);
      root.classList.toggle('empty', empty);
      root.querySelector<HTMLButtonElement>('.range-clear')!.disabled = empty;
      root.querySelectorAll<HTMLElement>('.range-scale span').forEach((s, i) => s.classList.toggle('off', !empty && !hl.includes(keys[i])));
    },
  };
}

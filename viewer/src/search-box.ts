import { formatNumber } from './format.ts';
import { esc } from './html.ts';
import { t, type Lang } from './i18n.ts';
import type { SearchEntry } from './search.ts';

export interface ResultView {
  name: string;
  meta: string;
  /** Trusted HTML (swatch + value) for results on the current layer. */
  value?: string;
}

export interface SearchBoxOptions {
  /** Builds the index; called on first focus/input. */
  ensureIndex: () => Promise<void>;
  find: (query: string) => SearchEntry[];
  view: (e: SearchEntry, lang: Lang) => ResultView;
  onSelect: (e: SearchEntry) => void;
}

/** WAI-ARIA combobox with a listbox popup: arrows move, Enter picks, Escape closes then clears. */
export function createSearchBox(root: HTMLElement, o: SearchBoxOptions) {
  let lang: Lang = 'he';
  let results: SearchEntry[] = [];
  let active = -1;
  let loading = false;

  root.innerHTML =
    `<label class="sr-only" for="q"></label>` +
    `<input id="q" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="results" autocomplete="off" spellcheck="false" enterkeyhint="search" dir="auto">` +
    `<ul id="results" role="listbox" hidden></ul>` +
    `<div class="sr-only" role="status" aria-live="polite"></div>`;
  const input = root.querySelector('input')!;
  const list = root.querySelector('ul')!;
  const label = root.querySelector('label')!;
  const live = root.querySelector<HTMLElement>('[role=status]')!;

  const open = (on: boolean) => {
    list.hidden = !on;
    input.setAttribute('aria-expanded', String(on));
  };

  function render() {
    const q = input.value.trim();
    if (!q) {
      open(false);
      live.textContent = '';
      return;
    }
    if (!results.length) {
      const msg = t(loading ? 'searching' : 'noResults', lang);
      list.innerHTML = `<li class="empty" role="presentation">${esc(msg)}</li>`;
      live.textContent = msg;
      open(true);
      input.removeAttribute('aria-activedescendant');
      return;
    }
    list.innerHTML = results
      .map((e, i) => {
        const v = o.view(e, lang);
        return (
          `<li role="option" id="opt-${i}" aria-selected="${i === active}" data-i="${i}">` +
          `<span class="result-name" dir="auto">${esc(v.name)}</span>` +
          `<span class="result-meta"><span>${esc(v.meta)}</span>${v.value ? `<span class="result-class">${v.value}</span>` : ''}</span></li>`
        );
      })
      .join('');
    live.textContent = t('results', lang, { n: formatNumber(results.length, lang) });
    if (active >= 0) input.setAttribute('aria-activedescendant', `opt-${active}`);
    else input.removeAttribute('aria-activedescendant');
    list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
    open(true);
  }

  function update() {
    results = o.find(input.value);
    active = results.length ? 0 : -1;
    render();
  }

  async function warm() {
    if (loading) return;
    loading = true;
    try {
      await o.ensureIndex();
    } finally {
      loading = false;
      if (input.value.trim()) update();
    }
  }

  function choose(i: number) {
    const e = results[i];
    if (!e) return;
    input.value = o.view(e, lang).name;
    open(false);
    // Focus stays here unless the caller moves it (to the popup it opens).
    o.onSelect(e);
  }

  input.addEventListener('focus', () => void warm());
  input.addEventListener('input', () => {
    void warm();
    update();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!results.length) return;
      if (list.hidden) open(true);
      const step = ev.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + results.length) % results.length;
      render();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      choose(active >= 0 ? active : 0);
    } else if (ev.key === 'Escape') {
      if (!list.hidden) open(false);
      else input.value = '';
    }
  });
  input.addEventListener('blur', () => setTimeout(() => open(false), 150));
  // Keep focus in the input on press; pick on click, so the click can't fall through to the map once the list closes.
  list.addEventListener('pointerdown', (ev) => ev.preventDefault());
  list.addEventListener('click', (ev) => {
    const li = (ev.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (li) choose(Number(li.dataset.i));
  });

  return {
    setLang(l: Lang) {
      lang = l;
      input.placeholder = t('searchPlaceholder', l);
      label.textContent = t('searchLabel', l);
      list.setAttribute('aria-label', t('resultsLabel', l));
      if (!list.hidden) render();
    },
  };
}

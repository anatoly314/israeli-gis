export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const swatch = (color: string, missing = false) =>
  `<span class="swatch${missing ? ' swatch-missing' : ''}" style="--c:${esc(color)}"></span>`;

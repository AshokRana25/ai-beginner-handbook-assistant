import { icon } from './icons.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function formatDate(iso) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function href(path, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null));
  const s = qs.toString();
  return `#${path}${s ? `?${s}` : ''}`;
}

export function terms(query) {
  return String(query ?? '').toLowerCase().split(/\s+/).map(t => t.replace(/[^\p{L}\p{N}+#.-]/gu, '')).filter(t => t.length > 1);
}

// Escapes text, then wraps matched query terms in <mark>.
export function highlight(text, query) {
  const t = terms(query);
  if (!t.length) return esc(text);
  const pattern = new RegExp(`(${t.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return String(text).split(pattern).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join('');
}

export const levelBadge = level => `<span class="badge badge-${esc(level.toLowerCase())}">${esc(level)}</span>`;

export function emptyState(title, body, action = '') {
  return `<div class="state state-empty" role="status">${icon('search', 28)}<h3>${esc(title)}</h3><p>${esc(body)}</p>${action}</div>`;
}

export function debounce(fn, ms = 150) {
  let t;
  const debounced = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  debounced.cancel = () => clearTimeout(t);
  return debounced;
}

export function options(list, selected, allLabel) {
  return `<option value="">${esc(allLabel)}</option>` + list.map(o => {
    const [value, label] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

let toastTimer;
export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

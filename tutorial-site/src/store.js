// Progress, bookmarks, and quiz results are stored only in this browser.
const KEY = 'ai-learning-hub:v1';
const empty = () => ({ completed: {}, bookmarks: [], quizzes: {} });
let state = empty();
let available = true;
const listeners = new Set();

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = id => typeof id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const entries = value => record(value) ? Object.entries(value) : [];

function restore(raw) {
  let saved;
  try { saved = JSON.parse(raw); } catch { return empty(); }
  if (!record(saved)) return empty();
  const completed = Object.fromEntries(entries(saved.completed).filter(([id, at]) => validId(id) && validDate(at)));
  const seen = new Set();
  const bookmarks = (Array.isArray(saved.bookmarks) ? saved.bookmarks : []).filter(b => {
    if (!record(b) || !['lesson', 'question'].includes(b.type) || !validId(b.id) || !validDate(b.at)) return false;
    const key = `${b.type}:${b.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ type, id, at }) => ({ type, id, at }));
  const quizzes = Object.fromEntries(entries(saved.quizzes).filter(([id, q]) =>
    validId(id) && record(q) && validDate(q.at) &&
    ['score', 'total', 'best', 'attempts'].every(key => Number.isInteger(q[key])) &&
    q.total > 0 && q.score >= 0 && q.score <= q.total && q.best >= q.score && q.best <= q.total && q.attempts > 0
  ).map(([id, { score, total, best, attempts, at }]) => [id, { score, total, best, attempts, at }]));
  return { completed, bookmarks, quizzes };
}

try {
  const raw = localStorage.getItem(KEY);
  if (raw) state = restore(raw);
} catch {
  available = false;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    available = false;
  }
  listeners.forEach(fn => fn());
}

export const store = {
  get available() { return available; },
  onChange(fn) { listeners.add(fn); },

  isCompleted: id => Boolean(state.completed[id]),
  completedIds: () => Object.keys(state.completed),
  completedAt: id => state.completed[id],
  toggleCompleted(id) {
    if (state.completed[id]) delete state.completed[id];
    else state.completed[id] = new Date().toISOString();
    save();
    return Boolean(state.completed[id]);
  },

  isBookmarked: (type, id) => state.bookmarks.some(b => b.type === type && b.id === id),
  bookmarks: () => [...state.bookmarks],
  toggleBookmark(type, id) {
    const i = state.bookmarks.findIndex(b => b.type === type && b.id === id);
    if (i >= 0) state.bookmarks.splice(i, 1);
    else state.bookmarks.unshift({ type, id, at: new Date().toISOString() });
    save();
    return i < 0;
  },

  quiz: id => state.quizzes[id],
  quizzes: () => ({ ...state.quizzes }),
  saveQuiz(id, score, total) {
    const prev = state.quizzes[id];
    state.quizzes[id] = { score, total, at: new Date().toISOString(), best: Math.max(score, prev?.best ?? 0), attempts: (prev?.attempts ?? 0) + 1 };
    save();
  },

  reset() {
    state = empty();
    save();
  }
};

const THEME_KEY = 'ai-learning-hub:theme';
export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* theme still applies for this visit */ }
}

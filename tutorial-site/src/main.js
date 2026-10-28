import './styles.css';
import { icon } from './icons.js';
import { store, getTheme, setTheme } from './store.js';
import { esc, toast } from './utils.js';
import { loadContent } from './data.js';
import { homeView } from './views/home.js';
import { libraryView } from './views/library.js';
import { lessonView } from './views/lesson.js';
import { questionsView } from './views/questions.js';
import { searchView } from './views/search.js';
import { pathsView, pathView, projectsView, projectView } from './views/paths.js';
import { myLearningView } from './views/mylearning.js';
import { notFoundView } from './views/notfound.js';

const NAV = [
  ['/', 'Home', 'house'], ['/library', 'Topics', 'library'], ['/questions', 'Q&A', 'circle-help'],
  ['/paths', 'Paths', 'route'], ['/projects', 'Projects', 'hammer'], ['/my-learning', 'My learning', 'graduation-cap']
];

const app = document.getElementById('app');
let cleanup = null;

function shell() {
  app.innerHTML = `
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="#/" aria-label="AI Learning Hub home"><span class="brand-mark" aria-hidden="true">${icon('sparkles', 18)}</span><span>AI Learning Hub</span></a>
      <nav class="main-nav" id="main-nav" aria-label="Main">
        <ul>${NAV.map(([path, label, ic]) => `<li><a href="#${path}" data-nav="${path}">${icon(ic, 18)}<span>${label}</span></a></li>`).join('')}</ul>
      </nav>
      <form class="header-search" role="search" aria-label="Site search">
        <label for="site-q" class="visually-hidden">Search tutorials and questions</label>
        <input id="site-q" name="q" type="search" placeholder="Search…" autocomplete="off">
        <button type="submit" class="icon-btn" aria-label="Search">${icon('search', 18)}</button>
      </form>
      <button type="button" class="icon-btn theme-toggle" aria-label="Switch to dark mode" data-theme-toggle></button>
      <button type="button" class="icon-btn menu-toggle" aria-expanded="false" aria-controls="main-nav" aria-label="Menu">${icon('menu', 22)}</button>
    </div>
  </header>
  <main id="main" tabindex="-1"></main>
  <footer class="site-footer"><div class="container footer-inner">
    <p><strong>AI Learning Hub</strong> · Original explanations with links to official documentation.</p>
    <p class="muted">Progress and bookmarks stay in this browser. No account, no tracking.</p>
  </div></footer>`;
  updateThemeButton();
}

function updateThemeButton() {
  const btn = app.querySelector('[data-theme-toggle]');
  const dark = getTheme() === 'dark';
  btn.innerHTML = icon(dark ? 'sun' : 'moon', 20);
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const split = raw.indexOf('?');
  const pathPart = split < 0 ? raw : raw.slice(0, split);
  const query = split < 0 ? '' : raw.slice(split + 1);
  try {
    const segments = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    return { segments, params: new URLSearchParams(query), path: `/${segments[0] ?? ''}` };
  } catch {
    return { segments: ['not-found'], params: new URLSearchParams(), path: '/not-found' };
  }
}

function resolve({ segments, params }) {
  const [page, id] = segments;
  const detail = ['lesson', 'paths', 'projects'].includes(page);
  if (segments.length > (detail ? 2 : 1)) return notFoundView();
  switch (page) {
    case undefined: return homeView();
    case 'library': return libraryView(params);
    case 'lesson': return lessonView(id);
    case 'questions': return questionsView(params);
    case 'search': return searchView(params);
    case 'paths': return id ? pathView(id) : pathsView();
    case 'projects': return id ? projectView(id) : projectsView();
    case 'my-learning': return myLearningView();
    default: return notFoundView();
  }
}

function render({ focus = true } = {}) {
  cleanup?.();
  cleanup = null;
  const route = parseHash();
  const view = resolve(route);
  const main = document.getElementById('main');
  main.innerHTML = view.html;
  document.title = `${view.title} · AI Learning Hub`;
  app.querySelectorAll('[data-nav]').forEach(a => {
    const active = a.dataset.nav === route.path;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  closeMenu();
  cleanup = view.mount?.(main, { rerender: () => render({ focus: false }) }) ?? null;
  if (focus) {
    window.scrollTo(0, 0);
    (main.querySelector('h1') ?? main).focus({ preventScroll: true });
  }
}

function closeMenu() {
  const btn = app.querySelector('.menu-toggle');
  btn?.setAttribute('aria-expanded', 'false');
  app.querySelector('.main-nav')?.classList.remove('open');
}

function bindGlobal() {
  window.addEventListener('hashchange', () => render());

  app.addEventListener('submit', e => {
    if (!e.target.matches('.header-search')) return;
    e.preventDefault();
    const q = e.target.q.value.trim();
    location.hash = `#/search${q ? `?q=${encodeURIComponent(q)}` : ''}`;
    e.target.reset();
  });

  app.addEventListener('click', async e => {
    const bm = e.target.closest('[data-bookmark]');
    if (bm) {
      e.preventDefault();
      const { type, id } = bm.dataset;
      const on = store.toggleBookmark(type, id);
      app.querySelectorAll(`[data-bookmark][data-type="${CSS.escape(type)}"][data-id="${CSS.escape(id)}"]`).forEach(b => {
        b.setAttribute('aria-pressed', on);
        b.title = on ? 'Remove bookmark' : 'Bookmark';
        b.innerHTML = icon(on ? 'bookmark-check' : 'bookmark', 18);
      });
      toast(on ? 'Bookmarked. Find it in My learning.' : 'Bookmark removed');
      if (parseHash().path === '/my-learning') {
        render({ focus: false });
        const heading = document.getElementById('ml-bm');
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
      return;
    }

    const copy = e.target.closest('[data-copy]');
    if (copy) {
      const code = document.getElementById(copy.dataset.copy)?.textContent ?? '';
      const label = copy.querySelector('span');
      try {
        await navigator.clipboard.writeText(code);
        label.textContent = 'Copied';
        toast('Code copied to clipboard');
      } catch {
        label.textContent = 'Copy failed';
        toast('Copy failed. Select the code and copy it manually.');
      }
      setTimeout(() => { label.textContent = 'Copy'; }, 2000);
      return;
    }

    const scroll = e.target.closest('[data-scroll]');
    if (scroll) {
      e.preventDefault();
      // Collapse the mobile menu first so the layout is final before scrolling.
      scroll.closest('details')?.removeAttribute('open');
      const target = document.getElementById(scroll.dataset.scroll);
      if (target) {
        target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        const heading = target.querySelector('h2');
        heading?.setAttribute('tabindex', '-1');
        heading?.focus({ preventScroll: true });
      }
      return;
    }

    if (e.target.closest('[data-theme-toggle]')) {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
      updateThemeButton();
      return;
    }

    const menu = e.target.closest('.menu-toggle');
    if (menu) {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', open);
      app.querySelector('.main-nav').classList.toggle('open', open);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && app.querySelector('.menu-toggle[aria-expanded="true"]')) {
      closeMenu();
      app.querySelector('.menu-toggle').focus();
    }
  });
}

async function start() {
  app.innerHTML = `<div class="state state-loading" role="status"><span class="spinner" aria-hidden="true"></span><p>Loading lessons…</p></div>`;
  try {
    await loadContent();
  } catch (err) {
    app.innerHTML = `<div class="state state-error" role="alert">${icon('triangle-alert', 32)}<h1>We could not load the lessons</h1>
      <p>${esc(err.message)}. Check your connection and try again.</p><button type="button" class="btn btn-primary" id="retry">Try again</button></div>`;
    document.getElementById('retry').addEventListener('click', start);
    return;
  }
  shell();
  bindGlobal();
  render({ focus: false });
}

start();

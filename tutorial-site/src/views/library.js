import { icon } from '../icons.js';
import { esc, href, options, emptyState, debounce, plural } from '../utils.js';
import { data, getCategory, searchLessons, LEVELS } from '../data.js';
import { breadcrumbs, lessonCard, plannedList } from '../components.js';

export function topicSidebar(activeCategory, activeLesson) {
  return `<ul class="topic-list">${data.categories.map(c => {
    const active = c.id === activeCategory;
    const link = href('/library', { category: c.id });
    const count = `<span class="count">${c.lessons.length}</span>`;
    const lessons = active && activeLesson !== undefined
      ? `<ul>${c.lessons.map(l => `<li><a href="#/lesson/${esc(l.id)}"${l.id === activeLesson ? ' aria-current="page"' : ''}>${esc(l.title)}</a></li>`).join('')}
        ${(c.planned ?? []).map(t => `<li class="soon">${esc(t)} <span class="badge badge-soon">Soon</span></li>`).join('')}</ul>`
      : '';
    return `<li><a href="${link}"${active ? ' class="active"' : ''}${active && activeLesson === undefined ? ' aria-current="page"' : ''}>${icon(c.icon, 16)}<span>${esc(c.name)}</span>${count}</a>${lessons}</li>`;
  }).join('')}</ul>`;
}

export function libraryView(params) {
  const state = { q: params.get('q') ?? '', category: params.get('category') ?? '', level: params.get('level') ?? '' };
  if (state.category && !getCategory(state.category)) state.category = '';
  const cat = getCategory(state.category);

  const results = () => {
    const found = searchLessons(state.q, state);
    const filtering = state.q || state.level;
    const cats = state.category ? [getCategory(state.category)] : data.categories;
    const groups = cats.map(c => {
      const items = found.filter(l => l.category === c.id);
      const planned = filtering ? [] : c.planned;
      if (!items.length && !planned?.length) return '';
      return `<section class="cat-group" aria-labelledby="g-${esc(c.id)}">
        <h2 id="g-${esc(c.id)}">${icon(c.icon, 20)} ${esc(c.name)}</h2>
        ${state.category ? '' : `<p class="muted">${esc(c.description)}</p>`}
        ${c.id === 'interview-preparation' ? `<p><a class="btn btn-secondary" href="${href('/questions', { type: 'Interview' })}">Browse interview questions ${icon('arrow-right', 16)}</a></p>` : ''}
        ${items.length ? `<div class="grid grid-2">${items.map(l => lessonCard(l, state.q)).join('')}</div>` : ''}
        ${plannedList(planned)}
      </section>`;
    }).join('');
    const hasPlanned = cats.some(c => c.planned?.length);
    const summary = `<p class="result-count" role="status">${plural(found.length, 'tutorial')} found${!filtering && hasPlanned ? ' · planned lessons are marked “Coming soon”' : ''}</p>`;
    return found.length || !filtering ? summary + groups
      : summary + emptyState('No tutorials match your filters', 'Try a broader search term or clear the filters.', '<button type="button" class="btn btn-secondary" data-clear>Clear filters</button>');
  };

  return {
    title: cat ? `${cat.name} tutorials` : 'Topic library',
    html: `<div class="container page">
      ${breadcrumbs(cat ? [['Home', '#/'], ['Topic library', '#/library'], [cat.name]] : [['Home', '#/'], ['Topic library']])}
      <div class="layout-sidebar">
        <aside class="sidebar" aria-label="Topics"><h2 class="sidebar-title">Topics</h2>
          <ul class="topic-list"><li><a href="#/library"${!cat ? ' aria-current="page" class="active"' : ''}>${icon('library', 16)}<span>All topics</span><span class="count">${data.lessons.length}</span></a></li></ul>
          ${topicSidebar(state.category)}</aside>
        <div>
          <header class="page-head"><h1 tabindex="-1">${esc(cat ? cat.name : 'Topic library')}</h1>
          <p class="lead">${esc(cat ? `${cat.description} Covers: ${cat.coverage}.` : 'Searchable tutorials organized by category and difficulty.')}</p></header>
          <form class="filters" role="search" aria-label="Filter tutorials">
            <div class="field grow"><label for="lib-q">Search tutorials</label>
              <div class="input-icon">${icon('search', 18)}<input id="lib-q" name="q" type="search" value="${esc(state.q)}" placeholder="e.g. embeddings, prompt injection" autocomplete="off"></div></div>
            <div class="field"><label for="lib-cat">Topic</label><select id="lib-cat" name="category">${options(data.categories.map(c => [c.id, c.name]), state.category, 'All topics')}</select></div>
            <div class="field"><label for="lib-level">Level</label><select id="lib-level" name="level">${options(LEVELS, state.level, 'All levels')}</select></div>
          </form>
          <div id="results" class="results">${results()}</div>
        </div>
      </div></div>`,
    mount(root) {
      const form = root.querySelector('.filters');
      const out = root.querySelector('#results');
      const sync = () => {
        history.replaceState(null, '', href('/library', state));
        out.innerHTML = results();
      };
      form.addEventListener('submit', e => e.preventDefault());
      const search = debounce(() => { state.q = form.q.value.trim(); sync(); });
      form.q.addEventListener('input', search);
      form.level.addEventListener('change', () => { state.level = form.level.value; sync(); });
      // Changing topic updates headings and breadcrumbs, so re-render the page.
      form.category.addEventListener('change', () => { location.hash = href('/library', { ...state, category: form.category.value }); });
      out.addEventListener('click', e => {
        if (!e.target.closest('[data-clear]')) return;
        state.q = ''; state.level = '';
        form.q.value = ''; form.level.value = '';
        sync();
        form.q.focus();
      });
      return search.cancel;
    }
  };
}

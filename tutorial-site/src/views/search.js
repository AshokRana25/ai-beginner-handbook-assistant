import { icon } from '../icons.js';
import { esc, href, options, emptyState, debounce, plural, highlight } from '../utils.js';
import { data, getCategory, searchLessons, searchQuestions, LEVELS } from '../data.js';
import { breadcrumbs, lessonCard, questionItem } from '../components.js';

const TYPES = [['tutorial', 'Tutorials'], ['question', 'Questions'], ['project', 'Practice projects']];

function searchProjects(q, { category, level }) {
  const t = q.toLowerCase().split(/\s+/).filter(x => x.length > 1);
  return data.projects.filter(p => {
    if (level && p.level !== level) return false;
    if (category && getCategory(category)?.name !== p.category) return false;
    const text = [p.title, p.description, p.category, ...p.steps, ...p.requirements, ...p.criteria].join(' ').toLowerCase();
    return t.every(x => text.includes(x));
  });
}

export function searchView(params) {
  const state = { q: params.get('q') ?? '', type: params.get('type') ?? '', category: params.get('category') ?? '', level: params.get('level') ?? '' };

  const results = () => {
    if (!state.q.trim()) {
      return emptyState('Search the whole site', 'Type a word or phrase to search tutorials, questions, and projects together.');
    }
    const filters = { category: state.category, level: state.level };
    const lessons = !state.type || state.type === 'tutorial' ? searchLessons(state.q, filters) : [];
    const questions = !state.type || state.type === 'question' ? searchQuestions(state.q, filters) : [];
    const projects = !state.type || state.type === 'project' ? searchProjects(state.q, filters) : [];
    const total = lessons.length + questions.length + projects.length;
    if (!total) return `<p class="result-count" role="status">No results for “${esc(state.q)}”</p>` + emptyState('Nothing matched', 'Check the spelling, use fewer words, or remove a filter.');
    return `<p class="result-count" role="status">${plural(total, 'result')} for “${esc(state.q)}”</p>
      ${lessons.length ? `<section aria-labelledby="sr-t"><h2 id="sr-t">Tutorials <span class="count">${lessons.length}</span></h2><div class="grid grid-2">${lessons.map(l => lessonCard(l, state.q)).join('')}</div></section>` : ''}
      ${questions.length ? `<section aria-labelledby="sr-q"><h2 id="sr-q">Questions <span class="count">${questions.length}</span></h2>${questions.slice(0, 40).map(q => questionItem(q, state.q)).join('')}
        ${questions.length > 40 ? `<p><a href="${href('/questions', { q: state.q, category: state.category, level: state.level })}">See all ${questions.length} questions</a></p>` : ''}</section>` : ''}
      ${projects.length ? `<section aria-labelledby="sr-p"><h2 id="sr-p">Practice projects <span class="count">${projects.length}</span></h2><div class="grid grid-2">${projects.map(p => `<article class="card"><p class="eyebrow">${icon(p.icon, 16)} ${esc(p.category)}</p><h3><a class="stretched" href="#/projects/${esc(p.id)}">${highlight(p.title, state.q)}</a></h3><p>${highlight(p.description, state.q)}</p></article>`).join('')}</div></section>` : ''}`;
  };

  return {
    title: state.q ? `Search: ${state.q}` : 'Search',
    html: `<div class="container page narrow">
      ${breadcrumbs([['Home', '#/'], ['Search']])}
      <header class="page-head"><h1 tabindex="-1">Search</h1></header>
      <form class="filters filters-wrap" role="search" aria-label="Search the site">
        <div class="field grow full"><label for="s-q">Search tutorials, questions, and projects</label>
          <div class="input-icon">${icon('search', 18)}<input id="s-q" name="q" type="search" value="${esc(state.q)}" autocomplete="off"></div></div>
        <div class="field"><label for="s-type">Content type</label><select id="s-type" name="type">${options(TYPES, state.type, 'All content')}</select></div>
        <div class="field"><label for="s-cat">Topic</label><select id="s-cat" name="category">${options(data.categories.map(c => [c.id, c.name]), state.category, 'All topics')}</select></div>
        <div class="field"><label for="s-level">Level</label><select id="s-level" name="level">${options(LEVELS, state.level, 'All levels')}</select></div>
      </form>
      <div id="results" class="results">${results()}</div>
    </div>`,
    mount(root) {
      const form = root.querySelector('.filters');
      const out = root.querySelector('#results');
      const sync = () => {
        history.replaceState(null, '', href('/search', state));
        document.title = `${state.q ? `Search: ${state.q}` : 'Search'} · AI Learning Hub`;
        out.innerHTML = results();
      };
      form.addEventListener('submit', e => e.preventDefault());
      const search = debounce(() => { state.q = form.q.value.trim(); sync(); }, 200);
      form.q.addEventListener('input', search);
      for (const name of ['type', 'category', 'level']) form[name].addEventListener('change', () => { state[name] = form[name].value; sync(); });
      return search.cancel;
    }
  };
}

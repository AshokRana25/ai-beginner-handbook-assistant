import { icon } from '../icons.js';
import { esc, href, options, emptyState, debounce, plural } from '../utils.js';
import { data, getCategory, searchQuestions, LEVELS, QUESTION_TYPES, ROLES } from '../data.js';
import { breadcrumbs, questionItem } from '../components.js';

const GROUPS = [['topic', 'Topic'], ['level', 'Difficulty'], ['role', 'Role'], ['type', 'Question type']];

function group(list, by) {
  const map = new Map();
  const add = (key, label, q) => {
    if (!map.has(key)) map.set(key, { label, items: [] });
    map.get(key).items.push(q);
  };
  for (const q of list) {
    if (by === 'level') add(q.level, q.level, q);
    else if (by === 'type') add(q.type, q.type, q);
    else if (by === 'role') q.roles.forEach(r => add(r, ROLES.find(x => x[0] === r)[1], q));
    else add(q.category, getCategory(q.category).name, q);
  }
  const order = by === 'level' ? LEVELS : by === 'type' ? QUESTION_TYPES : by === 'role' ? ROLES.map(r => r[0]) : data.categories.map(c => c.id);
  return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([, v]) => v);
}

export function questionsView(params) {
  const state = {
    q: params.get('q') ?? '', category: params.get('category') ?? '', level: params.get('level') ?? '',
    type: params.get('type') ?? '', role: params.get('role') ?? '', group: params.get('group') ?? 'topic'
  };
  if (!GROUPS.some(g => g[0] === state.group)) state.group = 'topic';

  const results = () => {
    const found = searchQuestions(state.q, state);
    if (!found.length) {
      return `<p class="result-count" role="status">0 questions found</p>` + emptyState('No questions match your filters', 'Try a different search term or remove a filter.', '<button type="button" class="btn btn-secondary" data-clear>Clear filters</button>');
    }
    const groups = group(found, state.group);
    const note = state.group === 'role' ? ' · a question can appear under more than one role' : '';
    return `<p class="result-count" role="status">${plural(found.length, 'question')} found${note}</p>` +
      groups.map((g, i) => `<section class="qa-group" aria-labelledby="qg-${i}"><h2 id="qg-${i}">${esc(g.label)} <span class="count">${g.items.length}</span></h2>${g.items.map(q => questionItem(q, state.q, { idPrefix: `group-${i}-` })).join('')}</section>`).join('');
  };

  return {
    title: 'Questions and answers',
    html: `<div class="container page narrow">
      ${breadcrumbs([['Home', '#/'], ['Questions & answers']])}
      <header class="page-head"><h1 tabindex="-1">Questions & answers</h1>
        <p class="lead">${data.questions.length} conceptual, practical, scenario-based, and interview questions. Select a question to reveal its answer.</p></header>
      <form class="filters filters-wrap" role="search" aria-label="Filter questions">
        <div class="field grow full"><label for="qa-q">Search questions and answers</label>
          <div class="input-icon">${icon('search', 18)}<input id="qa-q" name="q" type="search" value="${esc(state.q)}" placeholder="e.g. context window, precision, approval" autocomplete="off"></div></div>
        <div class="field"><label for="qa-cat">Topic</label><select id="qa-cat" name="category">${options(data.categories.filter(c => c.lessons.length).map(c => [c.id, c.name]), state.category, 'All topics')}</select></div>
        <div class="field"><label for="qa-level">Difficulty</label><select id="qa-level" name="level">${options(LEVELS, state.level, 'All levels')}</select></div>
        <div class="field"><label for="qa-type">Type</label><select id="qa-type" name="type">${options(QUESTION_TYPES, state.type, 'All types')}</select></div>
        <div class="field"><label for="qa-role">Role</label><select id="qa-role" name="role">${options(ROLES, state.role, 'All roles')}</select></div>
        <div class="field"><label for="qa-group">Group by</label><select id="qa-group" name="group">${GROUPS.map(([v, l]) => `<option value="${v}"${v === state.group ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      </form>
      <div class="toolbar"><button type="button" class="btn btn-ghost btn-sm" data-expand>Expand all</button><button type="button" class="btn btn-ghost btn-sm" data-collapse>Collapse all</button></div>
      <div id="results" class="results">${results()}</div>
    </div>`,
    mount(root) {
      const form = root.querySelector('.filters');
      const out = root.querySelector('#results');
      const sync = () => {
        history.replaceState(null, '', href('/questions', { ...state, group: state.group === 'topic' ? '' : state.group }));
        out.innerHTML = results();
      };
      form.addEventListener('submit', e => e.preventDefault());
      const search = debounce(() => { state.q = form.q.value.trim(); sync(); });
      form.q.addEventListener('input', search);
      for (const name of ['category', 'level', 'type', 'role', 'group']) {
        form[name].addEventListener('change', () => { state[name] = form[name].value; sync(); });
      }
      root.querySelector('[data-expand]').addEventListener('click', () => out.querySelectorAll('details').forEach(d => { d.open = true; }));
      root.querySelector('[data-collapse]').addEventListener('click', () => out.querySelectorAll('details').forEach(d => { d.open = false; }));
      out.addEventListener('click', e => {
        if (!e.target.closest('[data-clear]')) return;
        Object.assign(state, { q: '', category: '', level: '', type: '', role: '' });
        for (const name of ['q', 'category', 'level', 'type', 'role']) form[name].value = '';
        sync();
        form.q.focus();
      });
      return search.cancel;
    }
  };
}

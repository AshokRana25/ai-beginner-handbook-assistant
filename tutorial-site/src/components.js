import { icon } from './icons.js';
import { store } from './store.js';
import { esc, highlight, levelBadge, href } from './utils.js';
import { data, getCategory, getLesson } from './data.js';

export function bookmarkButton(type, id, label) {
  const on = store.isBookmarked(type, id);
  return `<button type="button" class="icon-btn bookmark-btn" data-bookmark data-type="${esc(type)}" data-id="${esc(id)}" aria-pressed="${on}" aria-label="Bookmark ${esc(label)}" title="${on ? 'Remove bookmark' : 'Bookmark'}">${icon(on ? 'bookmark-check' : 'bookmark', 18)}</button>`;
}

export function breadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${items.map((it, i) => i === items.length - 1
    ? `<li><span aria-current="page">${esc(it[0])}</span></li>`
    : `<li><a href="${it[1]}">${esc(it[0])}</a></li>`).join('')}</ol></nav>`;
}

export function lessonCard(l, query = '') {
  const cat = getCategory(l.category);
  const done = store.isCompleted(l.id);
  return `<article class="card lesson-card${done ? ' is-done' : ''}">
    <div class="card-top"><span class="eyebrow">${icon(cat.icon, 16)} ${esc(cat.name)}</span>${bookmarkButton('lesson', l.id, l.title)}</div>
    <h3><a class="stretched" href="#/lesson/${esc(l.id)}">${highlight(l.title, query)}</a></h3>
    <p>${highlight(l.description, query)}</p>
    <div class="meta">${levelBadge(l.level)}<span>${icon('clock', 15)} ${l.minutes} min</span>${done ? `<span class="done">${icon('circle-check', 15)} Completed</span>` : ''}</div>
  </article>`;
}

export function plannedList(titles) {
  if (!titles?.length) return '';
  return `<ul class="planned-list" aria-label="Planned lessons">${titles.map(t => `<li><span>${esc(t)}</span><span class="badge badge-soon">Coming soon</span></li>`).join('')}</ul>`;
}

export function questionItem(q, query = '', { showLesson = true, idPrefix = '' } = {}) {
  const cat = getCategory(q.category);
  return `<details class="qa" id="q-${esc(idPrefix)}${esc(q.id)}">
    <summary><span class="qa-q">${highlight(q.question, query)}</span>
      <span class="chips"><span class="chip">${esc(q.type)}</span>${levelBadge(q.level)}<span class="chip chip-quiet">${esc(cat.name)}</span></span></summary>
    <div class="qa-body"><p>${highlight(q.answer, query)}</p>
      <div class="qa-foot">${showLesson ? `<a href="#/lesson/${esc(q.lesson.id)}">${icon('book-open', 16)} From: ${esc(q.lesson.title)}</a>` : '<span></span>'}${bookmarkButton('question', q.id, q.question)}</div>
    </div>
  </details>`;
}

export function progressBar(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="progress" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${done} of ${total} lessons completed"><span style="width:${pct}%"></span></div>`;
}

export function pathProgress(p) {
  const done = p.lessons.filter(id => store.isCompleted(id)).length;
  return { done, total: p.lessons.length, next: p.lessons.find(id => !store.isCompleted(id)) };
}

export function pathCard(p) {
  const { done, total } = pathProgress(p);
  const cta = done === total ? 'Review path' : done ? 'Continue' : 'Start path';
  return `<article class="card path-card path-${esc(p.color)}">
    <div class="path-icon">${icon(p.icon, 24)}</div>
    <p class="eyebrow">${esc(p.audience)}</p>
    <h3><a class="stretched" href="#/paths/${esc(p.id)}">${esc(p.name)}</a></h3>
    <p>${esc(p.description)}</p>
    <div class="meta"><span>${icon('book-open', 15)} ${total} lessons</span><span>${done}/${total} done</span></div>
    ${progressBar(done, total, `${p.name} progress`)}
    <span class="card-cta" aria-hidden="true">${cta} ${icon('arrow-right', 16)}</span>
  </article>`;
}

export function categoryCard(c) {
  const count = c.lessons.length;
  const soon = c.planned?.length ?? 0;
  const link = href('/library', { category: c.id });
  const summary = c.id === 'interview-preparation'
    ? `${count} tutorial · ${data.questions.filter(q => q.type === 'Interview').length} interview questions`
    : `${count} ${count === 1 ? 'tutorial' : 'tutorials'}`;
  return `<article class="card category-card">
    <div class="cat-icon">${icon(c.icon, 22)}</div>
    <div><h3><a class="stretched" href="${link}">${esc(c.name)}</a></h3>
    <p>${esc(c.coverage)}</p>
    <p class="meta"><span>${summary}</span>${soon ? `<span class="soon-count">${soon} coming soon</span>` : ''}</p></div>
  </article>`;
}

export const lessonLink = id => {
  const l = getLesson(id);
  return l ? `<a href="#/lesson/${esc(l.id)}">${esc(l.title)}</a>` : '';
};

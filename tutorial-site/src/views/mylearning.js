import { icon } from '../icons.js';
import { store } from '../store.js';
import { esc, formatDate, plural, toast } from '../utils.js';
import { data, getLesson, getQuestion } from '../data.js';
import { breadcrumbs, lessonCard, pathProgress, progressBar, questionItem } from '../components.js';

export function myLearningView() {
  const completed = store.completedIds().map(getLesson).filter(Boolean)
    .sort((a, b) => store.completedAt(b.id).localeCompare(store.completedAt(a.id)));
  const bookmarks = store.bookmarks();
  const lessonMarks = bookmarks.filter(b => b.type === 'lesson').map(b => getLesson(b.id)).filter(Boolean);
  const questionMarks = bookmarks.filter(b => b.type === 'question').map(b => getQuestion(b.id)).filter(Boolean);
  const quizzes = Object.entries(store.quizzes()).filter(([id]) => getLesson(id)).sort((a, b) => b[1].at.localeCompare(a[1].at));
  const avg = quizzes.length ? Math.round(quizzes.reduce((n, [, r]) => n + r.score / r.total, 0) / quizzes.length * 100) : null;

  return {
    title: 'My learning',
    html: `<div class="container page">
      ${breadcrumbs([['Home', '#/'], ['My learning']])}
      <header class="page-head"><h1 tabindex="-1">My learning</h1>
        <p class="lead">Your progress, bookmarks, and quiz results are stored only in this browser. No account is needed.</p></header>
      ${store.available ? '' : `<div class="state state-error" role="alert">${icon('triangle-alert', 24)}<p>Browser storage is unavailable (for example in some private browsing modes), so progress will not be kept after you close this tab.</p></div>`}
      <dl class="stats stats-cards">
        <div><dt>Lessons completed</dt><dd>${completed.length}<small>/${data.lessons.length}</small></dd></div>
        <div><dt>Quizzes taken</dt><dd>${quizzes.length}</dd></div>
        <div><dt>Average quiz score</dt><dd>${avg === null ? '–' : `${avg}%`}</dd></div>
        <div><dt>Bookmarks</dt><dd>${lessonMarks.length + questionMarks.length}</dd></div>
      </dl>

      <section class="section" aria-labelledby="ml-paths"><h2 id="ml-paths">Path progress</h2>
        <div class="grid grid-2 tight">${data.paths.map(p => {
          const { done, total, next } = pathProgress(p);
          return `<div class="panel"><h3><a href="#/paths/${esc(p.id)}">${esc(p.name)}</a></h3>
            <p class="meta"><span>${done}/${total} lessons</span>${next && done ? `<span>Next: <a href="#/lesson/${esc(next)}">${esc(getLesson(next).title)}</a></span>` : ''}</p>
            ${progressBar(done, total, `${p.name} progress`)}</div>`;
        }).join('')}</div>
      </section>

      <section class="section" aria-labelledby="ml-done"><h2 id="ml-done">Completed lessons</h2>
        ${completed.length ? `<ul class="link-list">${completed.map(l => `<li><a href="#/lesson/${esc(l.id)}">${esc(l.title)}</a><span class="muted"> · ${formatDate(store.completedAt(l.id))}</span></li>`).join('')}</ul>`
          : `<div class="state state-empty">${icon('book-open', 28)}<h3>No completed lessons yet</h3><p>Open a tutorial and select “Mark as complete” when you finish it.</p><a class="btn btn-primary" href="#/paths">Start Learning</a></div>`}
      </section>

      <section class="section" aria-labelledby="ml-bm"><h2 id="ml-bm">Bookmarks</h2>
        ${lessonMarks.length || questionMarks.length ? `
          ${lessonMarks.length ? `<h3>${plural(lessonMarks.length, 'tutorial')}</h3><div class="grid grid-3 tight">${lessonMarks.map(l => lessonCard(l)).join('')}</div>` : ''}
          ${questionMarks.length ? `<h3>${plural(questionMarks.length, 'question')}</h3>${questionMarks.map(q => questionItem(q)).join('')}` : ''}`
          : `<div class="state state-empty">${icon('bookmark', 28)}<h3>No bookmarks yet</h3><p>Use the bookmark button on a tutorial or question to save it here.</p></div>`}
      </section>

      <section class="section" aria-labelledby="ml-quiz"><h2 id="ml-quiz">Quiz results</h2>
        ${quizzes.length ? `<div class="table-wrap" tabindex="0" role="region" aria-labelledby="ml-quiz"><table>
          <thead><tr><th scope="col">Tutorial</th><th scope="col">Last score</th><th scope="col">Best</th><th scope="col">Attempts</th><th scope="col">Last attempt</th></tr></thead>
          <tbody>${quizzes.map(([id, r]) => `<tr><th scope="row"><a href="#/lesson/${esc(id)}">${esc(getLesson(id).title)}</a></th><td>${r.score}/${r.total}</td><td>${r.best}/${r.total}</td><td>${r.attempts}</td><td>${formatDate(r.at)}</td></tr>`).join('')}</tbody>
        </table></div>` : `<div class="state state-empty">${icon('target', 28)}<h3>No quiz results yet</h3><p>Each tutorial ends with a five-question quiz. Your scores will appear here.</p></div>`}
      </section>

      ${completed.length || bookmarks.length || quizzes.length ? `<section class="section danger-zone" aria-labelledby="ml-reset"><h2 id="ml-reset">Reset</h2>
        <p>Remove all completed lessons, bookmarks, and quiz results from this browser.</p>
        <button type="button" class="btn btn-danger" data-reset>${icon('trash-2', 16)} Reset my progress</button></section>` : ''}
    </div>`,
    mount(root, { rerender }) {
      root.querySelector('[data-reset]')?.addEventListener('click', () => {
        if (!confirm('Remove all progress, bookmarks, and quiz results from this browser?')) return;
        store.reset();
        toast('Your progress has been reset');
        rerender();
      });
    }
  };
}

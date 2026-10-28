import { icon } from '../icons.js';
import { store } from '../store.js';
import { esc, formatDate, levelBadge, toast } from '../utils.js';
import { data, getCategory, getLesson } from '../data.js';
import { bookmarkButton, breadcrumbs, lessonCard } from '../components.js';
import { topicSidebar } from './library.js';
import { notFoundView } from './notfound.js';

const SECTIONS = [
  ['overview', 'Objectives & prerequisites'], ['explanation', 'Explanation'], ['key-terms', 'Key terms'],
  ['example', 'Practical example'], ['mistakes', 'Common mistakes & limitations'], ['quiz', 'Check your understanding'],
  ['exercise', 'Practice exercise'], ['sources', 'Sources'], ['related', 'Related lessons']
];

function related(lesson) {
  const ids = new Set();
  data.lessons.filter(l => l.category === lesson.category && l.id !== lesson.id).forEach(l => ids.add(l.id));
  for (const p of data.paths) {
    const i = p.lessons.indexOf(lesson.id);
    if (i >= 0) [p.lessons[i + 1], p.lessons[i - 1]].filter(Boolean).forEach(id => ids.add(id));
  }
  ids.delete(lesson.id);
  return [...ids].slice(0, 3).map(getLesson).filter(Boolean);
}

function codeBlock(c, i) {
  return `<figure class="code-block">
    <figcaption><span class="code-title">${esc(c.title)}</span><span class="code-lang">${esc(c.language)}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-copy="code-${i}" aria-label="Copy code: ${esc(c.title)}">${icon('copy', 16)} <span>Copy</span></button></figcaption>
    <pre tabindex="0" aria-label="${esc(c.title)} code"><code id="code-${i}" class="language-${esc(c.language)}">${esc(c.source)}</code></pre>
    ${c.tested || c.note ? `<p class="code-note">${c.tested ? `<span class="tested">${icon('circle-check', 15)} Output checked by <code>npm run check:examples</code>.</span> ` : ''}${esc(c.note ?? '')}</p>` : ''}
  </figure>`;
}

function quizHtml(lesson) {
  const last = store.quiz(lesson.id);
  return `<p class="muted">Five questions. Choose one answer for each, then check your answers.</p>
  ${last ? `<p class="quiz-last">${icon('target', 16)} Last attempt: <strong>${last.score}/${last.total}</strong> on ${formatDate(last.at)} · best ${last.best}/${last.total}</p>` : ''}
  <form class="quiz" novalidate>
    ${lesson.questions.map((q, i) => `<fieldset class="quiz-q" data-index="${i}">
      <legend><span class="q-num" aria-hidden="true">${i + 1}</span><span>${esc(q.question)}</span></legend>
      <div class="options">${q.options.map((o, j) => `<label class="option"><input type="radio" name="q${i}" value="${j}"><span>${esc(o)}</span></label>`).join('')}</div>
      <div class="feedback" hidden></div>
    </fieldset>`).join('')}
    <div class="quiz-actions"><button type="submit" class="btn btn-primary">Check answers</button><p class="quiz-msg" role="status" aria-live="polite"></p></div>
  </form>`;
}

export function lessonView(id) {
  const lesson = getLesson(id);
  if (!lesson) return notFoundView('We could not find that tutorial. It may have been renamed or is still being written.');
  const cat = getCategory(lesson.category);
  const idx = data.lessons.indexOf(lesson);
  const prev = data.lessons[idx - 1];
  const next = data.lessons[idx + 1];
  const done = store.isCompleted(lesson.id);
  const toc = `<ol class="toc-list">${SECTIONS.filter(([s]) => s !== 'related' || related(lesson).length).map(([s, label]) => `<li><a href="#/lesson/${esc(lesson.id)}" data-scroll="${s}">${esc(label)}</a></li>`).join('')}</ol>`;

  return {
    title: lesson.title,
    html: `<div class="container page">
    ${breadcrumbs([['Home', '#/'], ['Topic library', '#/library'], [cat.name, `#/library?category=${cat.id}`], [lesson.title]])}
    <div class="layout-lesson">
      <aside class="sidebar" aria-label="Topics"><h2 class="sidebar-title">Topics</h2>${topicSidebar(cat.id, lesson.id)}</aside>
      <article class="lesson">
        <header class="lesson-head">
          <p class="eyebrow">${icon(cat.icon, 16)} ${esc(cat.name)}</p>
          <h1 tabindex="-1">${esc(lesson.title)}</h1>
          <p class="lead">${esc(lesson.description)}</p>
          <div class="meta">${levelBadge(lesson.level)}<span>${icon('clock', 15)} ${lesson.minutes} min read</span><span>Last reviewed ${formatDate(lesson.reviewed)}</span></div>
          <div class="lesson-actions">
            <button type="button" class="btn ${done ? 'btn-success' : 'btn-primary'}" data-complete aria-pressed="${done}">${icon(done ? 'circle-check' : 'check', 18)} <span>${done ? 'Completed' : 'Mark as complete'}</span></button>
            ${bookmarkButton('lesson', lesson.id, lesson.title).replace('icon-btn', 'icon-btn icon-btn-outline')}
          </div>
        </header>
        <details class="show-below-lg disclosure"><summary>Topics</summary>${topicSidebar(cat.id, lesson.id)}</details>
        <details class="show-below-xl disclosure"><summary>On this page</summary>${toc}</details>

        <section id="overview" class="lesson-section" aria-labelledby="h-overview">
          <h2 id="h-overview">Objectives & prerequisites</h2>
          <div class="grid grid-2 tight">
            <div class="panel"><h3>${icon('target', 18)} You will be able to</h3><ul>${lesson.objectives.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>
            <div class="panel"><h3>${icon('list-checks', 18)} Before you start</h3><p>${esc(lesson.prerequisites)}</p></div>
          </div>
        </section>
        <section id="explanation" class="lesson-section prose" aria-labelledby="h-explanation">
          <h2 id="h-explanation">Explanation</h2>${lesson.explanation.map(p => `<p>${esc(p)}</p>`).join('')}
        </section>
        <section id="key-terms" class="lesson-section" aria-labelledby="h-terms">
          <h2 id="h-terms">Key terms</h2>
          <dl class="terms">${lesson.terms.map(t => `<div><dt>${esc(t.term)}</dt><dd>${esc(t.definition)}</dd></div>`).join('')}</dl>
        </section>
        <section id="example" class="lesson-section prose" aria-labelledby="h-example">
          <h2 id="h-example">Practical example</h2><p>${esc(lesson.example)}</p>
          ${lesson.code.map(codeBlock).join('')}
        </section>
        <section id="mistakes" class="lesson-section" aria-labelledby="h-mistakes">
          <h2 id="h-mistakes">Common mistakes & limitations</h2>
          <ul class="warn-list">${lesson.mistakes.map(m => `<li>${icon('triangle-alert', 18)}<span>${esc(m)}</span></li>`).join('')}</ul>
        </section>
        <section id="quiz" class="lesson-section" aria-labelledby="h-quiz">
          <h2 id="h-quiz">Check your understanding</h2><div id="quiz-root">${quizHtml(lesson)}</div>
        </section>
        <section id="exercise" class="lesson-section" aria-labelledby="h-exercise">
          <h2 id="h-exercise">Practice exercise</h2>
          <div class="panel panel-accent">${icon('lightbulb', 20)}<p>${esc(lesson.exercise)}</p></div>
        </section>
        <section id="sources" class="lesson-section" aria-labelledby="h-sources">
          <h2 id="h-sources">Sources</h2>
          <ul class="sources">${lesson.sources.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}<span class="visually-hidden"> (opens in a new tab)</span></a></li>`).join('')}</ul>
          <p class="muted">Last reviewed ${formatDate(lesson.reviewed)}. The explanations are original; the linked official documentation supports the technical claims.</p>
        </section>
        ${related(lesson).length ? `<section id="related" class="lesson-section" aria-labelledby="h-related">
          <h2 id="h-related">Related lessons</h2><div class="grid grid-3 tight">${related(lesson).map(l => lessonCard(l)).join('')}</div>
        </section>` : ''}
        <nav class="prev-next" aria-label="Previous and next tutorials">
          ${prev ? `<a class="pn prev" href="#/lesson/${esc(prev.id)}" rel="prev"><span class="pn-label">${icon('arrow-left', 16)} Previous</span><span class="pn-title">${esc(prev.title)}</span></a>` : '<span></span>'}
          ${next ? `<a class="pn next" href="#/lesson/${esc(next.id)}" rel="next"><span class="pn-label">Next ${icon('arrow-right', 16)}</span><span class="pn-title">${esc(next.title)}</span></a>` : ''}
        </nav>
      </article>
      <aside class="toc" aria-label="On this page"><h2 class="sidebar-title">On this page</h2>${toc}</aside>
    </div></div>`,
    mount(root) {
      const completeBtn = root.querySelector('[data-complete]');
      completeBtn.addEventListener('click', () => {
        const now = store.toggleCompleted(lesson.id);
        completeBtn.setAttribute('aria-pressed', now);
        completeBtn.className = `btn ${now ? 'btn-success' : 'btn-primary'}`;
        completeBtn.innerHTML = `${icon(now ? 'circle-check' : 'check', 18)} <span>${now ? 'Completed' : 'Mark as complete'}</span>`;
        toast(now ? 'Lesson marked as complete' : 'Lesson marked as not complete');
      });

      const quizRoot = root.querySelector('#quiz-root');
      const bindQuiz = () => {
        const form = quizRoot.querySelector('form');
        form.addEventListener('submit', e => {
          e.preventDefault();
          const fieldsets = [...form.querySelectorAll('.quiz-q')];
          const unanswered = fieldsets.filter(f => !f.querySelector('input:checked'));
          const msg = form.querySelector('.quiz-msg');
          if (unanswered.length) {
            msg.textContent = `Please answer all questions (${unanswered.length} remaining).`;
            unanswered[0].querySelector('input').focus();
            return;
          }
          let score = 0;
          fieldsets.forEach((f, i) => {
            const q = lesson.questions[i];
            const ok = Number(f.querySelector('input:checked').value) === q.correct;
            if (ok) score++;
            f.classList.add(ok ? 'is-correct' : 'is-wrong');
            f.querySelectorAll('input').forEach(inp => { inp.disabled = true; });
            f.querySelectorAll('.option')[q.correct].classList.add('is-answer');
            const fb = f.querySelector('.feedback');
            fb.hidden = false;
            fb.innerHTML = `<p><strong>${ok ? `${icon('circle-check', 16)} Correct.` : `${icon('x', 16)} Not quite.`}</strong> ${esc(q.answer)}</p>`;
          });
          store.saveQuiz(lesson.id, score, fieldsets.length);
          form.querySelector('.quiz-actions').innerHTML = `<div class="quiz-score" role="status" tabindex="-1"><strong>You scored ${score} out of ${fieldsets.length}.</strong> ${score === fieldsets.length ? 'Excellent work.' : 'Review the explanations above, then try again.'} Your result is saved in My learning.</div>
            <button type="button" class="btn btn-secondary" data-retake>${icon('rotate-ccw', 16)} Try again</button>`;
          form.querySelector('.quiz-score').focus();
          form.querySelector('[data-retake]').addEventListener('click', () => {
            quizRoot.innerHTML = quizHtml(lesson);
            bindQuiz();
            quizRoot.querySelector('input').focus();
          });
        });
      };
      bindQuiz();

      const links = [...root.querySelectorAll('.toc [data-scroll]')];
      const observer = new IntersectionObserver(entries => {
        entries.filter(e => e.isIntersecting).forEach(e => {
          links.forEach(a => a.classList.toggle('active', a.dataset.scroll === e.target.id));
        });
      }, { rootMargin: '-20% 0px -70% 0px' });
      root.querySelectorAll('.lesson-section').forEach(s => observer.observe(s));
      return () => observer.disconnect();
    }
  };
}

import { icon } from '../icons.js';
import { esc } from '../utils.js';
import { breadcrumbs } from '../components.js';

export function notFoundView(message = 'The page you requested does not exist.') {
  return {
    title: 'Page not found',
    html: `<div class="container page narrow">
      ${breadcrumbs([['Home', '#/'], ['Not found']])}
      <div class="state state-error">${icon('circle-help', 32)}<h1 tabindex="-1">Page not found</h1><p>${esc(message)}</p>
      <p><a class="btn btn-primary" href="#/library">Browse the topic library</a></p></div>
    </div>`
  };
}

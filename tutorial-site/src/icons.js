import {
  Activity, ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, BookOpen, Bot, BriefcaseBusiness, ChartNoAxesCombined,
  Check, CircleCheck, CircleHelp, ClipboardList, Clock, Cloud, CodeXml, Copy, Database, FlaskConical, Files,
  GraduationCap, Hammer, House, Library, Lightbulb, ListChecks, Menu, MessageSquare, MessagesSquare, Moon, Network,
  Plug, RotateCcw, Route, Search, ShieldCheck, SlidersHorizontal, Sparkles, Sprout, Sun, Target, Terminal, Trash2,
  TriangleAlert, User, Workflow, X
} from 'lucide';

const icons = {
  activity: Activity, 'arrow-left': ArrowLeft, 'arrow-right': ArrowRight, bookmark: Bookmark, 'bookmark-check': BookmarkCheck,
  'book-open': BookOpen, bot: Bot, 'briefcase-business': BriefcaseBusiness, 'chart-no-axes-combined': ChartNoAxesCombined,
  check: Check, 'circle-check': CircleCheck, 'circle-help': CircleHelp, 'clipboard-list': ClipboardList, clock: Clock,
  cloud: Cloud, 'code-xml': CodeXml, copy: Copy, database: Database, 'flask-conical': FlaskConical, files: Files,
  'graduation-cap': GraduationCap, hammer: Hammer, house: House, library: Library, lightbulb: Lightbulb,
  'list-checks': ListChecks, menu: Menu, 'message-square': MessageSquare, 'messages-square': MessagesSquare, moon: Moon,
  network: Network, plug: Plug, 'rotate-ccw': RotateCcw, route: Route, search: Search, 'shield-check': ShieldCheck,
  'sliders-horizontal': SlidersHorizontal, sparkles: Sparkles, sprout: Sprout, sun: Sun, target: Target,
  terminal: Terminal, 'trash-2': Trash2, 'triangle-alert': TriangleAlert, user: User, workflow: Workflow, x: X
};

const attr = attrs => Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');

export function icon(name, size = 20) {
  const node = icons[name] ?? icons['book-open'];
  const children = node.map(([tag, attrs]) => `<${tag} ${attr(attrs)}/>`).join('');
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${children}</svg>`;
}

import Fuse from './vendor/fuse.min.mjs';

const REPO = 'cos-jnewnam/toolshed';
const WORKFLOW_FILE = 'sync-and-deploy.yml';
const QUICK_FILTERS = [
  ['', 'All'],
  ['prompt', 'Prompts'],
  ['cli', 'CLI'],
  ['snippet', 'Snippets'],
];

const $ = (sel) => document.querySelector(sel);
const state = { q: '', tag: '' };
let items = [];
let fuse = null;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

async function getJSON(url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const isReadme = (f) => /^readme(\.|$)/i.test(f.name);

function normalize(gistData, extras) {
  const out = [];
  for (const g of gistData?.items || []) {
    out.push({
      id: g.id,
      kind: 'gist',
      title: g.title,
      description: g.description,
      url: g.url,
      tags: g.tags || [],
      updated: g.updated,
      files: [...(g.files || [])].sort((a, b) => isReadme(b) - isReadme(a)),
    });
  }
  (extras || []).forEach((x, i) => {
    out.push({
      id: `extra-${i}`,
      kind: 'link',
      title: x.title,
      description: x.description || '',
      url: x.url,
      tags: (x.tags || []).map((t) => String(t).toLowerCase()),
      updated: x.updated || '',
      files: [],
    });
  });
  for (const it of out) {
    it.fileNames = it.files.map((f) => f.name).join(' ');
    it.content = it.files.map((f) => f.content).join('\n');
  }
  return out;
}

function buildFuse(list) {
  return new Fuse(list, {
    includeScore: true,
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: 'title', weight: 3 },
      { name: 'tags', weight: 2 },
      { name: 'description', weight: 1 },
      { name: 'fileNames', weight: 1 },
      { name: 'content', weight: 0.5 },
    ],
  });
}

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.q = p.get('q') || '';
  state.tag = p.get('tag') || '';
}

function writeHash() {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.tag) p.set('tag', state.tag);
  const s = p.toString();
  history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
}

function currentResults() {
  let list = state.q.trim()
    ? fuse.search(state.q.trim()).map((r) => r.item)
    : [...items].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  if (state.tag) list = list.filter((it) => it.tags.includes(state.tag));
  return list;
}

function renderFilters() {
  const wrap = $('#filters');
  wrap.replaceChildren();
  const known = new Set(QUICK_FILTERS.map(([t]) => t));
  const buttons = [...QUICK_FILTERS];
  // If a non-quick tag is active, show it so it can be cleared.
  if (state.tag && !known.has(state.tag)) buttons.push([state.tag, `#${state.tag}`]);
  for (const [tag, label] of buttons) {
    const active = state.tag === tag;
    wrap.append(
      el('button', {
        type: 'button',
        class: 'chip' + (active ? ' active' : ''),
        'aria-pressed': String(active),
        text: label,
        onclick: () => setTag(tag),
      })
    );
  }
}

function setTag(tag) {
  state.tag = state.tag === tag ? '' : tag;
  update();
}

function renderCard(it) {
  const card = el('article', { class: 'card' });

  const title = el('h2', { class: 'card-title' }, el('a', { href: it.url, target: '_blank', rel: 'noopener', text: it.title }));
  card.append(title);

  if (it.kind === 'link' && it.description) card.append(el('p', { class: 'card-desc', text: it.description }));

  if (it.tags.length) {
    const tags = el('div', { class: 'tags' });
    for (const t of it.tags) {
      tags.append(el('button', { type: 'button', class: 'tag', text: `#${t}`, onclick: () => setTag(t) }));
    }
    card.append(tags);
  }

  for (const f of it.files) {
    if (!f.content) {
      card.append(el('p', { class: 'file-name', text: f.name }));
      continue;
    }
    const pre = el('pre', {}, el('code', { text: f.content }));
    const copy = el('button', {
      type: 'button',
      class: 'copy',
      text: 'Copy',
      onclick: async (e) => {
        try {
          await navigator.clipboard.writeText(f.content);
          e.target.textContent = 'Copied';
        } catch {
          e.target.textContent = 'Copy failed';
        }
        setTimeout(() => (e.target.textContent = 'Copy'), 1500);
      },
    });
    const summary = el('summary', {}, el('span', { class: 'file-name', text: f.name }));
    const body = el('div', { class: 'file-body' }, el('div', { class: 'file-actions' }, copy), pre);
    if (f.truncated) {
      body.append(el('p', { class: 'note' }, 'Truncated. ', el('a', { href: f.raw, target: '_blank', rel: 'noopener', text: 'View raw file' })));
    }
    card.append(el('details', { class: 'file' }, summary, body));
  }
  return card;
}

function renderResults() {
  const list = currentResults();
  const root = $('#results');
  root.replaceChildren(...list.map(renderCard));
  const n = list.length;
  $('#status').textContent = items.length === 0
    ? 'Nothing loaded yet. Run the sync, or add entries to data/extras.json.'
    : `${n} ${n === 1 ? 'result' : 'results'}`;
}

function update() {
  writeHash();
  renderFilters();
  renderResults();
}

function renderFooter(gistData) {
  const synced = $('#synced');
  if (gistData?.generated) {
    synced.textContent = `Synced ${new Date(gistData.generated).toLocaleString()}`;
  } else {
    synced.textContent = 'No gist data found';
  }
  $('#sync-now').href = `https://github.com/${REPO}/actions/workflows/${WORKFLOW_FILE}`;
}

async function init() {
  const [gistData, extras] = await Promise.all([getJSON('data/gists.json'), getJSON('data/extras.json')]);
  items = normalize(gistData, extras);
  fuse = buildFuse(items);
  renderFooter(gistData);

  readHash();
  $('#q').value = state.q;
  update();

  let timer;
  $('#q').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = e.target.value;
      update();
    }, 120);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('#q')) {
      e.preventDefault();
      $('#q').focus();
    }
  });

  window.addEventListener('hashchange', () => {
    readHash();
    $('#q').value = state.q;
    renderFilters();
    renderResults();
  });
}

init();

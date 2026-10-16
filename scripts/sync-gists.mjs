// Pulls public gists for a GitHub user and writes data/gists.json.
// Usage: node scripts/sync-gists.mjs
// Env: GH_USER (default cos-jnewnam), GITHUB_TOKEN (optional, raises rate limit)

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USER = process.env.GH_USER || 'cos-jnewnam';
const TOKEN = process.env.GITHUB_TOKEN || '';
const MAX_CONTENT = 20000; // characters kept per file
const MAX_FILE_SIZE = 200000; // bytes, larger files are listed but not downloaded
const BATCH = 5;

const ALIASES = {
  prompts: 'prompt',
  snippets: 'snippet',
  cmd: 'cli',
  command: 'cli',
  commands: 'cli',
  terminal: 'cli',
  shell: 'cli',
};

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'toolshed-sync',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function fetchAllGists() {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const url = `https://api.github.com/users/${USER}/gists?per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
    }
    const batch = await res.json();
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

// "Deploy notes #cli #sitefinity" -> { title: "Deploy notes", tags: ["cli", "sitefinity"] }
function parseDescription(description) {
  const raw = description || '';
  const tags = [];
  for (const m of raw.matchAll(/(^|\s)#([A-Za-z0-9_-]+)/g)) {
    const t = m[2].toLowerCase();
    tags.push(ALIASES[t] || t);
  }
  const title = raw
    .replace(/(^|\s)#[A-Za-z0-9_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, tags: [...new Set(tags)] };
}

async function fetchContent(file) {
  if (file.size > MAX_FILE_SIZE) return { content: '', truncated: true };
  if ((file.type || '').startsWith('image/')) return { content: '', truncated: false };
  try {
    const res = await fetch(file.raw_url, { headers: { 'User-Agent': 'toolshed-sync' } });
    if (!res.ok) return { content: '', truncated: false };
    const text = await res.text();
    if (text.length > MAX_CONTENT) {
      return { content: text.slice(0, MAX_CONTENT), truncated: true };
    }
    return { content: text, truncated: false };
  } catch {
    return { content: '', truncated: false };
  }
}

async function buildItem(gist) {
  const { title, tags } = parseDescription(gist.description);
  const fileEntries = Object.values(gist.files);

  const files = [];
  for (let i = 0; i < fileEntries.length; i += BATCH) {
    const chunk = fileEntries.slice(i, i + BATCH);
    const done = await Promise.all(
      chunk.map(async (f) => {
        const { content, truncated } = await fetchContent(f);
        return {
          name: f.filename,
          language: f.language || '',
          size: f.size,
          raw: f.raw_url,
          content,
          truncated,
        };
      })
    );
    files.push(...done);
  }

  return {
    id: gist.id,
    title: title || files[0]?.name || gist.id,
    description: gist.description || '',
    url: gist.html_url,
    tags,
    created: gist.created_at,
    updated: gist.updated_at,
    files,
  };
}

async function main() {
  console.log(`Fetching public gists for ${USER}`);
  const gists = await fetchAllGists();
  console.log(`Found ${gists.length} gists`);

  const items = [];
  for (const gist of gists) {
    const item = await buildItem(gist);
    if (item.tags.includes('hidden')) continue; // #hidden in the description skips a gist
    items.push(item);
  }

  items.sort((a, b) => b.updated.localeCompare(a.updated));

  const out = {
    user: USER,
    generated: new Date().toISOString(),
    count: items.length,
    items,
  };

  const here = path.dirname(fileURLToPath(import.meta.url));
  const dataDir = path.join(here, '..', 'data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'gists.json'), JSON.stringify(out, null, 2));
  console.log(`Wrote data/gists.json with ${items.length} items`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

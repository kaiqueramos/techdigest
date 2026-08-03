// Orchestrator: fetch -> rank by MiniMax -> download images once -> merge news.json (7-day window).
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchFeeds } from './fetch.js';
import { rankItems } from './rank.js';

const NEWS_PATH = fileURLToPath(new URL('../public/news.json', import.meta.url));
const IMG_DIR = fileURLToPath(new URL('../public/img/', import.meta.url));
const WINDOW_DAYS = 7;
const MAX_ITEMS = 500;

const MM_BASE = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
const IMG_MODEL = process.env.MINIMAX_IMAGE_MODEL || 'image-01';

// generate one image via MiniMax image-01 (same API key as the chat model)
async function generateImage(prompt) {
  const res = await fetch(`${MM_BASE}/image_generation`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: IMG_MODEL,
      prompt,
      n: 1,
      aspect_ratio: '16:9',
      response_format: 'base64',
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const data = await res.json();
  const b64 = data?.data?.image_base64?.[0];
  if (!b64) throw new Error('no image in response');
  return Buffer.from(b64, 'base64');
}

// download a batch of images with a small concurrency pool (avoid rate limits)
async function downloadImages(items) {
  await mkdir(IMG_DIR, { recursive: true });
  const CONCURRENCY = 2;
  let idx = 0;
  let ok = 0;
  async function worker() {
    while (idx < items.length) {
      const it = items[idx++];
      if (!it.img) continue;
      const dest = `${IMG_DIR}${it.urlHash}.jpg`;
      try {
        const buf = await generateImage(it.img);
        await writeFile(dest, buf);
        it.img = `img/${it.urlHash}.jpg`; // relative path — works on subpath hosting
        ok++;
      } catch {
        // keep previous img (or empty) on failure; never kill the run
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return ok;
}

// delete images no longer referenced by the kept window
async function pruneImages(kept) {
  const referenced = new Set(kept.map((n) => n.img && n.img.endsWith('.jpg') ? n.img.split('/').pop() : null).filter(Boolean));
  let files;
  try {
    files = await readdir(IMG_DIR);
  } catch {
    return;
  }
  for (const f of files) {
    if (!referenced.has(f)) {
      try { await unlink(`${IMG_DIR}${f}`); } catch { /* already gone */ }
    }
  }
}

async function loadExisting() {
  try {
    const raw = await readFile(NEWS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function run() {
  const existing = await loadExisting();
  const now = Date.now() / 1000;
  const cutoff = now - WINDOW_DAYS * 86400;

  // seen hashes from existing (kept within window) to dedup across runs
  const seenHashes = new Set();
  for (const n of existing) {
    if ((n.addedTs || n.ts) >= cutoff) {
      if (n.urlHash) seenHashes.add(n.urlHash);
      if (n.titleHash) seenHashes.add(n.titleHash);
    }
  }

  const fresh = (await fetchFeeds())
    .filter((f) => !seenHashes.has(f.urlHash) && !seenHashes.has(f.titleHash))
    .slice(0, 40); // bound the LLM batch

  if (fresh.length === 0) {
    console.log('no new items');
    return { added: 0, total: existing.length };
  }

  // titles already in the JSON — let the LLM catch same-story rewordings (cheap pre-dedup
  // only compares hashes; this closes that gap)
  const publishedTitles = existing
    .filter((n) => (n.addedTs || n.ts) >= cutoff)
    .map((n) => n.title)
    .slice(0, 30);

  const ranked = await rankItems(fresh, publishedTitles);

  // drop items that are duplicates of a canonical entry within this batch
  const canonical = ranked.filter((r) => !r.dupOf && !r.alreadyCovered);
  const sourceOf = new Map();
  for (const r of ranked) {
    if (r.dupOf) {
      const key = r.dupOf.urlHash || r.dupOf.titleHash;
      sourceOf.set(key, r.dupOf.source);
    }
  }

  const added = canonical
    .filter((r) => r.score >= Number(process.env.SCORE_MIN || 0.5))
    .map((r) => ({
      title: r.item.title,
      titlePt: r.titlePt || '',
      url: r.item.url,
      source: r.item.source,
      sources: [...new Set([r.item.source, ...(sourceOf.get(r.item.urlHash) ? [sourceOf.get(r.item.urlHash)] : [])])],
      reason: r.reason,
      reasonEn: r.reasonEn || '',
      score: r.score,
      tags: r.tags,
      img: r.img || '',
      ts: r.item.ts,
      addedTs: Math.round(now),
      urlHash: r.item.urlHash,
      titleHash: r.item.titleHash,
    }));

  const imgOk = await downloadImages(added);

  const merged = [...added, ...existing].filter((n) => (n.addedTs || n.ts) >= cutoff).slice(0, MAX_ITEMS);
  merged.sort((a, b) => (b.addedTs || b.ts) - (a.addedTs || a.ts));
  await pruneImages(merged);

  console.log(`added ${added.length} (${imgOk} imgs), total ${merged.length}`);

  await writeFile(NEWS_PATH, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`added ${added.length}, total ${merged.length}`);
  return { added: added.length, total: merged.length };
}

// allow direct run: node src/main.js
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
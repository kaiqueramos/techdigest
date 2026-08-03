// Fetch feeds, normalize, and dedup cheaply (URL hash + normalized-title hash).
// Semantic dedup happens later in rank.js (LLM). This is the cheap pre-pass.
import { FEEDS, KEYWORDS, PER_FEED } from './feeds.js';

const UA = 'ai-news-curator/1.0 (+https://github.com/karramos)';

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has', 'new', 'how', 'what'].includes(w))
    .join(' ');

const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

// parse both RSS (<item>) and Atom (<entry>) feeds; Atom link is an element with href attr
function parseFeed(xml) {
  const items = [];
  const re = /<(item|entry)>([\s\S]*?)<\/(item|entry)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[2];
    const title = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link = (block.match(/<link[^>]*href="([^"]+)"/) || [])[1]
      || (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]
      || (block.match(/<updated>([\s\S]*?)<\/updated>/) || [])[1] || '';
    items.push({
      title: unescapeHtml(title),
      url: unescapeHtml(link),
      ts: pubDate ? Date.parse(pubDate) / 1000 : Date.now() / 1000,
    });
  }
  return items;
}

function unescapeHtml(s) {
  return s
    .replace(/<\!\[CDATA\[|\]\]>\s*/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function mapJson(feed, data) {
  const items = [];
  if (feed.name === 'HackerNews') {
    for (const h of data.hits || []) {
      items.push({ title: h.title || '', url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, ts: h.created_at_i || 0 });
    }
  }
  return items;
}

export async function fetchFeeds() {
  const seen = new Set(); // dedup within this batch
  const out = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const text = await res.text();
      const items = feed.type === 'rss' ? parseFeed(text) : mapJson(feed, JSON.parse(text));
      // keep only the newest PER_FEED, then keyword-filter
      const capped = items.sort((a, b) => b.ts - a.ts).slice(0, PER_FEED);
      for (const it of capped) {
        if (!it.title || !it.url) continue;
        // keyword pre-filter
        if (!KEYWORDS.some((k) => it.title.toLowerCase().includes(k))) continue;
        const urlHash = hash(it.url);
        const titleHash = hash(norm(it.title));
        const key = `${urlHash}:${titleHash}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ ...it, source: feed.name, urlHash, titleHash });
      }
    } catch {
      // one bad feed must not kill the run
    }
  }
  // sort newest-first as a stable input order for the LLM batch
  out.sort((a, b) => b.ts - a.ts);
  return out;
}
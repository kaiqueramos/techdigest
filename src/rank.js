// One batched MiniMax-M3 call: rank each item, write a plain-language reason,
// and flag semantic duplicates (dedup across feeds with different URLs).
const BASE = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1';
const KEY = process.env.MINIMAX_API_KEY;
const MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M3';

const SYSTEM_PROMPT = `You curate a public AI-news feed for busy developers and non-experts.
For each news item (id, title, source) you return:
- score: 0-1 relevance for "people who must not waste time" (0 = noise, 1 = must-read).
- title_pt: a natural Brazilian-Portuguese translation of the title (keep it short and punchy).
- reason: a clear 3-5 sentence summary in Brazilian Portuguese. Say what happened, why it
  matters, and who is affected. Plain language anyone can follow. No filler, no invented facts.
  STRICTLY Brazilian Portuguese — never mix in other languages or scripts (no Chinese, no
  Cyrillic, no code, no English words).
- reason_en: the same 3-5 sentence summary in simple English. STRICTLY English — never mix in
  other languages or scripts.
- dupOf: the id of the item this one reports the SAME story as (group cross-source duplicates),
  or null if it is unique.
- tags: 1-3 short lowercase tags (e.g. "modelo", "lançamento", "deal", "regulação").
- img: a short (3-8 words) English image prompt visually describing the story.
  ALWAYS end every img with: ", minimal abstract tech, violet and navy gradient, soft glow" —
  so all images share one aesthetic. NEVER depict real people, faces, celebrities or
  recognizable persons — use abstract objects, symbols or silhouettes only. No text in the image.
Rules: keep the most authoritative source as the canonical entry (dupOf points at it).
Stay factual, no invented details. Return ONLY JSON.`;

function buildPrompt(items) {
  const list = items.map((it, i) => `[${i}] ${it.title} (${it.source})`).join('\n');
  return `Here are the news items:\n${list}\n\nAnswer as JSON: {"items":[{"id":<index>,"score":0.0,"title_pt":"...","reason":"...","reason_en":"...","dupOf":null|index,"tags":["..."],"img":"..."}]}`;
}

export async function rankItems(items) {
  if (!KEY) throw new Error('MINIMAX_API_KEY is not set');
  if (items.length === 0) return [];
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(items) },
      ],
      temperature: 0.2,
      max_tokens: 12000,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`MiniMax ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || '{}';
  // MiniMax-M3 embeds a 'thinking…response' reasoning block in content —
  // the response marker is not always emitted, so extract the first {...} region.
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  const json = start >= 0 && end > start ? content.slice(start, end + 1) : content;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    // fallback: strip fences and any stray text
    parsed = JSON.parse(json.replace(/```json|`|```/g, ''));
  }
  const ranked = parsed.items || [];
  const byId = new Map(ranked.map((r) => [r.id, r]));
  // resolve dupOf indices to canonical entries
  const resolved = [];
  for (let i = 0; i < items.length; i++) {
    const r = byId.get(i) || {};
    const dupOf = r.dupOf != null ? byId.get(r.dupOf) : null;
    resolved.push({
      item: items[i],
      score: clamp01(r.score),
      titlePt: cleanText(r.title_pt),
      reason: cleanText(r.reason),
      reasonEn: cleanText(r.reason_en),
      dupOf: dupOf ? items[dupOf.id] : null,
      tags: Array.isArray(r.tags) ? r.tags.map(cleanText).filter(Boolean).slice(0, 3) : [],
      img: typeof r.img === 'string' ? r.img.trim().slice(0, 120) : '',
    });
  }
  return resolved;
}

const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

// strip any non-Latin (CJK, Cyrillic, Arabic, etc.) characters that leak into PT/EN text
const NON_LATIN = /[^\u0000-\u024F\u2000-\u206F]/g;
const cleanText = (s) => (s || '').replace(NON_LATIN, '').trim();
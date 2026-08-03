// Feed sources. type: 'rss' (XML) or 'json' (mapped to {title,url,ts}).
// Keep only open/public feeds — no paywalls, no scraping behind login.
export const FEEDS = [
  { name: 'HackerNews', type: 'json', url: 'https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story&hitsPerPage=30' },
  { name: 'TechCrunch', type: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'The Verge', type: 'rss', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'Ars Technica', type: 'rss', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  { name: 'arXiv AI', type: 'rss', url: 'https://export.arxiv.org/rss/cs.AI' },
  { name: 'VentureBeat AI', type: 'rss', url: 'https://venturebeat.com/category/ai/feed/' },
  { name: 'MIT Tech Review', type: 'rss', url: 'https://www.technologyreview.com/feed/' },
  { name: 'HuggingFace', type: 'rss', url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'Google AI', type: 'rss', url: 'https://blog.google/technology/ai/rss/' },
  { name: 'OpenAI', type: 'rss', url: 'https://openai.com/news/rss.xml' },
  { name: 'ProductHunt', type: 'rss', url: 'https://www.producthunt.com/feed' },
];

// per-feed cap (newest N) — bounds the LLM batch and drops huge feeds
export const PER_FEED = 20;

// Keywords a title must hit to be kept (cheap pre-filter before LLM).
export const KEYWORDS = [
  'ai', 'artificial intelligence', 'llm', 'gpt', 'claude', 'gemini', 'llama',
  'openai', 'anthropic', 'google deepmind', 'machine learning', 'model',
  'neural', 'diffusion', 'transformer', 'agent', 'gpu', 'chip', 'inference',
  'token', 'multimodal', 'fine-tun', 'copilot', 'chatgpt', 'mistral', 'deepseek',
  'qwen', 'grok', 'quantum', 'robotics', 'computer vision', 'nlp',
];
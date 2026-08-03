# Roadmap TechDigest

Ideias adiadas. Local only — não commitar (adicionado ao .gitignore).

## UX / Doom-scroll (combo aprovado, não implementado)
- [ ] PWA instalável — manifest + service worker, offline com cache do último news.json
- [ ] Badge "NOVO" nos itens incluídos desde o último cron
- [ ] Deep link `site/#hash` — abre modal direto daquela notícia (compartilhável)
- [ ] Botão compartilhar no modal — `navigator.share` no mobile, copy link no desktop

## Distribuição / SEO
- [ ] OpenGraph tags — card bonito ao postar o link em WhatsApp/Twitter
- [ ] Favicon + ícones 192/512 (necessário também pro PWA)
- [ ] robots.txt + sitemap.xml — Google indexar cada notícia via deep link
- [ ] RSS de saída — o site curado vira feed pros outros assinarem

## Qualidade de conteúdo (extras além do que já foi feito)
- [ ] Mais fontes: The Rundown, Ben's Bites (achar feeds que funcionem), newsletters via beehiiv
- [ ] Filtro por fonte no UI (TechCrunch, Verge...)
- [ ] Ordenação alternativa opcional (por score)

## Ops / confiabilidade
- [ ] README.md no repo — documentar arquitetura
- [ ] Alerta de falha do cron (webhook Discord/email no job)
- [ ] Estimativa de custo MiniMax (chat + imagens/dia) no README
- [ ] Revogar o token GitHub amplo exposto no chat; gerar novo com scope restrito

## Não fazer (YAGNI)
- Autenticação, backend, banco de dados
- Comentários/reactions (moderação = dor)
- Multi-idioma além de PT/EN
- Highlights do dia com IA extra (custo alto, ganho baixo)

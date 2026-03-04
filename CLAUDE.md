# CLAUDE.md — Threads Monitor

## Project

Threads Monitor: a multi-workspace platform that scrapes Threads posts, clusters and synthesizes them into articles via LLMs, and auto-publishes to Threads, Twitter, and Instagram.

## Tech Stack

- Next.js 16 (App Router), React 19, TypeScript 5 (strict)
- PostgreSQL + Prisma 6 ORM
- NextAuth 5 (JWT, Credentials + OAuth)
- Tailwind CSS v4
- BullMQ + Redis for background jobs
- Multi-provider LLM: Groq (primary), OpenAI, Anthropic, Gemini (fallback)
- Puppeteer (stealth) for scraping
- Azure Blob Storage for media
- Vitest for testing
- pnpm, Docker (Node 20 Alpine, standalone)

## Commands

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm test` — run all tests (sequential, single worker)
- `pnpm test -- --run <file>` — run specific test file
- `npx prisma migrate dev` — run database migrations
- `npx prisma generate` — regenerate Prisma client
- `npx prisma studio` — open database GUI
- `npx tsx worker/scrape-worker.ts` — start scrape worker
- `npx tsx worker/heartbeat.ts` — start heartbeat scheduler

## Structure

```
app/              Next.js pages + API routes (route.ts)
components/       Shared React components
lib/              Core logic (ai/, scrapers/, scoring/, storage, queue, processor, synthesis_engine, publisher_service, clustering)
worker/           Background workers (scrape-worker, heartbeat, youtube-worker)
prisma/           Schema + migrations
test/             Test setup
```

## Key Patterns

- **Server components by default** — `"use client"` only for interactivity
- **Auth check in every API route**: `const session = await auth()` then verify `session?.user?.id`
- **Workspace ownership**: always verify `workspace.ownerId === session.user.id`
- **Path alias**: `@/*` → project root (e.g., `@/lib/prisma`)
- **Prisma for all DB access** — parameterized queries, never raw SQL with interpolation
- **API responses**: `NextResponse.json({ ... }, { status })` with 401/403/404/500
- **Error handling**: try-catch, Prisma error codes (`P2025`), `withRetry()` for transient errors
- **AI fallback**: FallbackProvider chain (Primary → GROQ → Gemini)
- **Console logging**: `[Context]` prefix format (e.g., `[Synthesis]`, `[Publisher]`)
- **Forms**: plain `useState` + `fetch()` — no form libraries
- **State**: React hooks only — no Redux/Zustand/Context
- **Styling**: Tailwind utilities + custom CSS vars in `globals.css`

## Important Files

- `auth.ts` — NextAuth config
- `lib/prisma.ts` — DB client singleton
- `lib/queue.ts` — BullMQ queues + Redis connection
- `lib/processor.ts` — post processing + hot score
- `lib/synthesis_engine.ts` — article synthesis
- `lib/publisher_service.ts` — multi-platform publishing
- `lib/clustering.ts` — TF-IDF clustering
- `lib/ai/provider.ts` — LLM abstraction + fallback
- `worker/heartbeat.ts` — cron scheduler
- `prisma/schema.prisma` — database schema

## Database

Key models: Workspace, User, Post, SynthesizedArticle, ScraperSource, ScrapeLog, PipelineRun.
Posts have `hotScore` and `coherenceStatus`. Articles have `status` lifecycle (PENDING_REVIEW → APPROVED → PUBLISHED).

## Security Rules

- Never commit `.env` — use `.env.example`
- Never log secrets, tokens, or API keys
- Always validate auth + ownership in API routes
- Never expose tokens in API responses
- Sanitize LLM outputs before publishing
- Validate file uploads (type, name)
- Cap pagination limits

## Don'ts

- Don't add `"use client"` unless needed for browser APIs
- Don't create centralized type files — keep types colocated
- Don't add form/state management libraries
- Don't use CSS modules — use Tailwind
- Don't bypass Prisma with raw SQL
- Don't commit `.env` files

<div align="center">
  <img src="public/banner.png" alt="Threads Monitor Banner" width="100%" />
  <br />
  <h1>🧵 Threads Monitor</h1>
  <p><strong>AI-Powered Social Media Intelligence & Automated Synthesis Platform</strong></p>
  
  [![Next.js](https://img.shields.io/badge/Next.js-15+-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
  [![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=for-the-badge&logo=prisma)](https://prisma.io/)
  [![Tailwind](https://img.shields.io/badge/Tailwind-v4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
  [![BullMQ](https://img.shields.io/badge/BullMQ-Redis-red?style=for-the-badge&logo=redis)](https://bullmq.io/)
</div>

---

## 🚀 Overview

**Threads Monitor** is a sophisticated, multi-workspace platform designed to capture and analyze the pulse of social media. It scrapes content from Threads, YouTube, and Twitter, clusters related discussions, and uses state-of-the-art LLMs to synthesize high-quality articles and insights.

> [!TIP]
> This platform doesn't just monitor—it automatically publishes synthesized insights back to your social channels, keeping your audience engaged with AI-driven intelligence.

## ✨ Key Features

- **🌐 Multi-Platform Monitoring**: Automated scraping for Threads, YouTube (transcripts), and X/Twitter.
- **🤖 Multi-LLM Intelligence**: Orchestrated fallback system featuring Groq (speed), OpenAI (reasoning), Anthropic (clarity), and Google Gemini (reliability).
- **📊 Advanced Synthesis Engine**: Automatic clustering using TF-IDF and hot-score algorithms to identify trending topics.
- **🏗️ Robust Worker Architecture**: Powered by BullMQ and Redis for scalable, reliable background processing.
- **🛡️ Secure Multi-Workspace Management**: Full isolation for users and teams with workspace-based ownership.
- **🎨 Modern Dashboard**: Aesthetic, responsive UI built with Next.js App Router and Tailwind CSS v4.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15+ (App Router), React 19
- **Database**: PostgreSQL + Prisma 6 ORM
- **Authentication**: NextAuth 5 (Workspaces, OAuth, Credentials)
- **Styling**: Tailwind CSS v4 + Glassmorphism
- **Workers/Queues**: BullMQ & Redis
- **Scraping**: Puppeteer (Stealth Mode)
- **Storage**: Azure Blob Storage (Media)
- **AI Ecosystem**: Anthropic, OpenAI, Groq, Google Generative AI

---

## 🚦 Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis
- [Pnpm](https://pnpm.io/) (recommended)

### Installation

1. **Clone and Install**:
   ```bash
   git clone <repository-url>
   cd threads-monitor
   pnpm install
   ```

2. **Environment Configuration**:
   Copy `.env.example` to `.env` and fill in your API keys (AI Providers, Database, Redis, storage).

3. **Database Setup**:
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

### Running the App

- **Web Application**: `pnpm dev`
- **Scraper Worker**: `pnpm worker:scraper`
- **Heartbeat Scheduler**: `pnpm worker:heartbeat`
- **YouTube Monitor**: `pnpm worker:youtube`

---

## 🧪 Testing

We use [Vitest](https://vitest.dev/) for our testing suite.

```bash
pnpm test          # Run all tests
pnpm test:unit     # Unit tests only
pnpm test:e2e      # End-to-end tests
```

---

## 📂 Project Structure

- `/app`: Next.js pages and API routes.
- `/components`: Shared UI components.
- `/lib`: Core logic (AI, Scrapers, Synthesis, Publishing).
- `/worker`: Background worker implementations.
- `/prisma`: Database schemas and migrations.

---

<div align="center">
  <p>Built with ❤️ for AI-first content automation</p>
</div>

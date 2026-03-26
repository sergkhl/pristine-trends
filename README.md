# pristine-trends

Telegram → AI-enriched feed backed by Supabase, with a static Next.js export on GitHub Pages and a poller in GitHub Actions. See [docs/architecture.md](docs/architecture.md) for the full design.

## Required secrets and variables

Obtain values **in the order below** (for example, you need `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` before you can run `npm run gen-session` for `TELEGRAM_SESSION`). Use the same values locally (`.env` / shell) and in [GitHub Actions](#github-actions-and-github-pages) where noted.

| # | Variable | Where to set | How to obtain |
|---|----------|--------------|---------------|
| 1 | `TELEGRAM_API_ID` | Root env or GitHub secret | [my.telegram.org/apps](https://my.telegram.org/apps) — log in, create an application, copy numeric **api_id**. |
| 2 | `TELEGRAM_API_HASH` | Root env or GitHub secret | Same page as **#1** — copy **api_hash**. |
| 3 | `TELEGRAM_SESSION` | Root env or GitHub secret | After **#1** and **#2**, run [`npm run gen-session`](#telegram-session-one-time) locally and paste the printed session string. Never commit it. |
| 4 | `GOOGLE_AI_KEY` | Root env or GitHub secret | [Google AI Studio API key](https://aistudio.google.com/apikey) for the Generative Language API. Model list: [Google AI models](https://ai.google.dev/gemini-api/docs/models). |
| 5 | `HF_API_KEY` | Root env or GitHub secret | [Hugging Face → Settings → Access Tokens](https://huggingface.co/settings/tokens) with read access for Inference. [Inference API docs](https://huggingface.co/docs/api-inference). |
| 6 | `SUPABASE_URL` | Root env or GitHub secret `SUPABASE_URL` | After a Supabase project exists ([dashboard](https://supabase.com/dashboard)): **Settings → API** → **Project URL**. |
| 7 | `NEXT_PUBLIC_SUPABASE_URL` | `frontend/.env` | Use the **same Project URL** as `SUPABASE_URL`. In CI it is set from the `SUPABASE_URL` secret. |
| 8 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `frontend/.env` | [Project Settings → API Keys](https://supabase.com/dashboard/project/_/settings/api-keys/) — **Publishable** key (`sb_publishable_...`). See [Understanding API keys](https://supabase.com/docs/guides/api/api-keys). |
| 9 | `SUPABASE_PUBLISHABLE_KEY` | GitHub secret only | Same credential as **#8**; used at build time for the Pages deploy workflow. Legacy JWT **anon** can work during migration; prefer publishable. |
| 10 | `SUPABASE_SERVICE_ROLE_KEY` | Root env or GitHub secret | **Settings → API** (same project as **#6**) — **service_role** key. **Server only**; never in the frontend or browser. |
| — | `BASE_PATH` (optional) | `frontend/.env` or CI | Local dev: unset (site at `/`). GitHub Pages **project** site: `/<repository-name>` with **no trailing slash** (the workflow sets this automatically). Passed to Next.js [`basePath`](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath). |

`GITHUB_TOKEN` is provided automatically for the Pages deploy step; you do not create it. Official reference: [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).

## Local setup

### Prerequisites

- **Node.js 22+** ([Node.js downloads](https://nodejs.org/en/download)) — matches [GitHub Actions](https://docs.github.com/en/actions/using-github-actions/about-github-actions).
- **npm** (comes with Node).
- A **Supabase** project configured as in [Supabase](#supabase) below.

### 1. Install dependencies

From the repository root:

```bash
git clone <your-fork-or-repo-url> pristine-trends
cd pristine-trends
npm install
cd frontend && npm install && cd ..
```

### 2. Supabase project

Create the project, apply the schema, and enable Realtime as described in [Supabase](#supabase). Copy URLs and keys from the dashboard using the Supabase-related rows (**#6–#10**) in [Required secrets and variables](#required-secrets-and-variables).

### 3. Configure environment files

**Frontend** — copy the template and fill from the table (rows **#7**, **#8**, optional **`BASE_PATH`**):

```bash
cp frontend/.env.example frontend/.env
```

**Poller** — copy the root template and fill from the table (rows **#1–#6**, **#10**):

```bash
cp .env.example .env
```

Node does not load `.env` automatically; either `export` the variables in your shell, use [direnv](https://direnv.net/), or another loader before `npm run start`.

<a id="telegram-session-one-time"></a>

### 4. Telegram session (one-time)

With **#1** and **#2** in the environment:

```bash
export TELEGRAM_API_ID=your_numeric_id
export TELEGRAM_API_HASH=your_hash
npm run gen-session
```

Follow the prompts (phone, OTP, 2FA if enabled). Put the printed session string in root `.env` as `TELEGRAM_SESSION` and/or in GitHub Actions (**#3** in the table).

### 5. Run locally

**Frontend** (feed stays empty until the poller has inserted rows):

```bash
cd frontend && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the URL shown in the terminal).

**Poller** (from the **repository root**, with poller variables available in the environment):

```bash
npm run build
npm run start
```

The first command compiles TypeScript into `dist/`; the second runs `node dist/index.js`.

### 6. Channels

Edit [src/config/channels.ts](src/config/channels.ts) to add or change Telegram sources. The frontend re-exports this file; no second copy to maintain.

## Supabase

1. Create a project: [Supabase Dashboard](https://supabase.com/dashboard).
2. Run the SQL in [supabase/migrations/001_schema.sql](supabase/migrations/001_schema.sql) (SQL Editor or [CLI migrations](https://supabase.com/docs/guides/cli/local-development)).
3. Confirm **Storage** has a public bucket `channel-avatars` if the migration did not create it.
4. For live updates in the app, ensure the `messages` table is part of Realtime: **Database → Publications** (or your project’s Realtime settings). See [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).
5. Copy **Project URL**, **publishable** key, and **service_role** key into your env files and CI as described in [Required secrets and variables](#required-secrets-and-variables).

## GitHub Actions and GitHub Pages

### Repository secrets

Add secrets under **Settings → Secrets and variables → Actions → New repository secret**. Names and meanings match [Required secrets and variables](#required-secrets-and-variables): `TELEGRAM_SESSION`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `GOOGLE_AI_KEY`, `HF_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_PUBLISHABLE_KEY` (same value as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` locally).

### GitHub Pages

1. After the first successful **deploy** workflow on `main`, enable Pages: **Settings → Pages** → Source: **Deploy from a branch** → branch **`gh-pages`** / **`/(root)`** (or the branch `peaceiris/actions-gh-pages` pushes to).
2. Docs: [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages).

The workflow sets `BASE_PATH` to `/<repository-name>` (no trailing slash) so Next.js `basePath` matches a default project site at `https://<user>.github.io/<repo>/`. For a user/organization site or a custom domain, adjust `BASE_PATH` in the workflow (often unset for `/`).

## Quick commands

| Command | Purpose |
|---------|---------|
| `npm install` / `npm run build` | Build the poller to `dist/`. |
| `npm run start` | Run `node dist/index.js` (env vars required). |
| `npm run gen-session` | Generate `TELEGRAM_SESSION` locally. |
| `cd frontend && npm install && npm run dev` | Local Next.js dev server ([http://localhost:3000](http://localhost:3000)). |

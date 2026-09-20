# Resume Tailor

Web app that scrapes job links, extracts structured JD fields via OpenRouter (DeepSeek V4 Flash by default), and generates ATS-oriented resumes + cover letters as DOCX/PDF packages.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env and add your OpenRouter key:

```bash
copy .env.example .env.local
```

Set `OPENROUTER_API_KEY` from [openrouter.ai/keys](https://openrouter.ai/keys).  
Default model is `deepseek/deepseek-v4-flash` (override with `OPENROUTER_MODEL`).

Optionally set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (free tier at
[upstash.com](https://upstash.com)) to enable duplicate-company detection — see
[Duplicate detection](#duplicate-detection) below. Both keys are auto-populated if you link an
Upstash for Redis database from the Vercel dashboard's Storage tab instead.

3. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Flow

1. Profile is fixed in code (`src/lib/profile.ts`) for Karina Elizabeth Garcia Lozana
2. Paste job URLs (one per line) or paste a full job description
3. Processing runs as **two short SSE requests** so proxies are less likely to idle-timeout:
   - **prepare** — scrape (or use pasted JD) and extract structured fields
   - **generate** — write resume + cover letter, validate, score ATS, and package downloads
4. Each phase streams progress over SSE and sends a heartbeat every 15 seconds while work is in flight

You can also paste a JD on a failed job to skip scraping and regenerate.

## Output

For each job link (in order):

```
output/
  Company_Name/
    jd.txt
    extracted_jd.txt
    Resume-Karina.docx
    Resume-Karina.pdf
    Coverletter-Karina.docx
    Coverletter-Karina.txt
  Clara-Software Engineer.zip
  ...
```

Each completed job shows an ATS score (/100) in the UI.
Document files use `Resume-{FirstName}` / `Coverletter-{FirstName}`.
Zip files are named `{Company}-{Role}.zip`.
Download links appear after processing (base64 over SSE, so they work on ephemeral serverless filesystems).

## Duplicate detection

Before generating a package, the **generate** phase checks the extracted company name against
[Upstash Redis](https://upstash.com) (REST-based, so it works from serverless functions with no
connection pooling). If that company was successfully tailored in the last 14 days, the job is
skipped — no resume/cover letter is generated — and the UI shows a "Duplicate" badge with an
alert message instead of downloads. Company names are matched case-insensitively and after
stripping common legal suffixes (`Inc`, `LLC`, `Corp`, …), so "Google" and "Google, LLC." count
as the same company; job title/role does not affect the match.

Only a normalized company key and a timestamp are stored (`src/lib/company-dedupe.ts`), each
with a 14-day TTL set by Redis itself — no database growth, no cron job to prune old rows, and
entries disappear on their own after 2 weeks. If the Upstash env vars aren't set, or a lookup
fails, duplicate detection is skipped (logged to the server console) and resume generation
proceeds normally — it never blocks the core feature.

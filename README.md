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

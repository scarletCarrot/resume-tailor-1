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

1. Profile is fixed in code (`src/lib/profile.ts`) for Saul D. Trujillo
2. Paste job URLs (one per line)
3. The app scrapes each posting in parallel, extracts the JD, and writes a tailored resume + cover letter

## Output

For each job link (in order):

```
output/
  Company_Name/
    jd.txt
    extracted_jd.txt
    Resume-Saul.docx
    Resume-Saul.pdf
    Coverletter-Saul.docx
    Coverletter-Saul.txt
  Clara-Software Engineer.zip
  ...
```

Each completed job shows an ATS score (/100) in the UI.
Document files use `Resume-{FirstName}` / `Coverletter-{FirstName}`.
Zip files are named `{Company}-{Role}.zip`.
Download links appear after processing.

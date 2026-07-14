import * as cheerio from "cheerio";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function cleanText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractFromSelectors(
  $: cheerio.CheerioAPI,
  selectors: string[],
): string {
  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = cleanText(el.text());
      if (text.length > 200) return text;
    }
  }
  return "";
}

export async function scrapeJobDescription(url: string): Promise<{
  rawText: string;
  pageTitle: string;
}> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch job page (${response.status}): ${url}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  $("script, style, noscript, svg, nav, footer, header, iframe").remove();

  const pageTitle = cleanText($("title").first().text() || "");

  const targeted = extractFromSelectors($, [
    "[data-testid='jobDescriptionText']",
    ".jobsearch-JobComponent-description",
    "#jobDescriptionText",
    ".jobs-description__content",
    ".jobs-box__html-content",
    ".job-description",
    ".jobDescriptionContent",
    "#job-description",
    ".description__text",
    "[class*='job-description']",
    "[class*='JobDescription']",
    "article",
    "main",
  ]);

  const rawText = targeted || cleanText($("body").text());

  if (rawText.length < 120) {
    throw new Error(
      `Could not extract a usable job description from ${url}. The page may require login or block scrapers.`,
    );
  }

  return {
    rawText: rawText.slice(0, 50000),
    pageTitle,
  };
}

export function sanitizeCompanyFolderName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return cleaned || "Unknown_Company";
}

/** Safe zip filename segment: keeps readability, strips path-hostile chars. */
export function sanitizeZipSegment(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 80);
  return cleaned || "Unknown";
}

export function profileFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || "Candidate";
  return sanitizeZipSegment(first).replace(/\s+/g, "") || "Candidate";
}

export function buildDocumentFileNames(fullName: string) {
  const first = profileFirstName(fullName);
  return {
    resumeDocx: `Resume-${first}.docx`,
    resumePdf: `Resume-${first}.pdf`,
    coverLetterDocx: `Coverletter-${first}.docx`,
    coverLetterTxt: `Coverletter-${first}.txt`,
  };
}

export function buildZipFileName(company: string, role: string): string {
  const companyPart = sanitizeZipSegment(company);
  const rolePart = sanitizeZipSegment(role);
  return `${companyPart}-${rolePart}.zip`;
}

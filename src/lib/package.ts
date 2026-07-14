import { ZipArchive } from "archiver";
import { createWriteStream } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import type { ExtractedJD, PersonalInfo, TailoredPackage } from "./types";
import {
  buildCoverLetterDocx,
  buildResumeDocx,
  buildResumePdf,
} from "./documents";
import { formatExtractedJd } from "./keywords";
import {
  buildDocumentFileNames,
  buildZipFileName,
  sanitizeCompanyFolderName,
} from "./scrape";

/** Vercel/Lambda only allow writes under /tmp; local keeps ./output. */
export function getOutputRoot() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join(os.tmpdir(), "resume-tailor-output");
  }
  return path.join(process.cwd(), "output");
}

export type PackageDownloads = {
  zipBase64: string;
  resumeDocxBase64: string;
  coverLetterDocxBase64: string;
};

async function zipDirectory(
  sourceDir: string,
  zipPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
}

export async function saveJobPackage(options: {
  index: number;
  jobUrl: string;
  rawJd: string;
  extracted: ExtractedJD;
  personal: PersonalInfo;
  tailored: TailoredPackage;
}): Promise<{
  folderPath: string;
  zipPath: string;
  zipName: string;
  folderName: string;
  company: string;
  resumeDocxName: string;
  resumePdfName: string;
  coverLetterDocxName: string;
  downloads: PackageDownloads;
}> {
  const { index, jobUrl, rawJd, extracted, personal, tailored } = options;
  const outputRoot = getOutputRoot();
  await mkdir(outputRoot, { recursive: true });

  const baseName = sanitizeCompanyFolderName(extracted.company);
  const folderName = `${baseName}_${index}`;
  const folderPath = path.join(outputRoot, folderName);
  await mkdir(folderPath, { recursive: true });

  const files = buildDocumentFileNames(personal.name);
  const extractedText = formatExtractedJd(extracted);
  const resumeDocx = await buildResumeDocx(personal, tailored.resume);
  const resumePdf = await buildResumePdf(personal, tailored.resume);
  const coverDocx = await buildCoverLetterDocx(
    personal,
    extracted.company,
    extracted.jobTitle,
    tailored.coverLetter,
    tailored.resume.keywords,
  );

  const resumeDocxPath = path.join(folderPath, files.resumeDocx);
  const coverDocxPath = path.join(folderPath, files.coverLetterDocx);

  await writeFile(
    path.join(folderPath, "jd.txt"),
    `Source URL: ${jobUrl}\n\n${rawJd}`,
    "utf8",
  );
  await writeFile(path.join(folderPath, "extracted_jd.txt"), extractedText, "utf8");
  await writeFile(resumeDocxPath, resumeDocx);
  await writeFile(path.join(folderPath, files.resumePdf), resumePdf);
  await writeFile(coverDocxPath, coverDocx);
  await writeFile(
    path.join(folderPath, files.coverLetterTxt),
    tailored.coverLetter,
    "utf8",
  );

  const zipName = buildZipFileName(extracted.company, extracted.jobTitle);
  const zipPath = path.join(outputRoot, zipName);
  await zipDirectory(folderPath, zipPath);

  // Embed file bytes for the client — Vercel /tmp is not shared across invocations,
  // so /api/download cannot reliably serve files written during /api/tailor.
  const [zipBuf, resumeBuf, coverBuf] = await Promise.all([
    readFile(zipPath),
    readFile(resumeDocxPath),
    readFile(coverDocxPath),
  ]);

  return {
    folderPath,
    zipPath,
    zipName,
    folderName,
    company: extracted.company,
    resumeDocxName: files.resumeDocx,
    resumePdfName: files.resumePdf,
    coverLetterDocxName: files.coverLetterDocx,
    downloads: {
      zipBase64: zipBuf.toString("base64"),
      resumeDocxBase64: resumeBuf.toString("base64"),
      coverLetterDocxBase64: coverBuf.toString("base64"),
    },
  };
}

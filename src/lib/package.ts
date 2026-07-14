import { ZipArchive } from "archiver";
import { createWriteStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
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

export function getOutputRoot() {
  return path.join(process.cwd(), "output");
}

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

  await writeFile(
    path.join(folderPath, "jd.txt"),
    `Source URL: ${jobUrl}\n\n${rawJd}`,
    "utf8",
  );
  await writeFile(path.join(folderPath, "extracted_jd.txt"), extractedText, "utf8");
  await writeFile(path.join(folderPath, files.resumeDocx), resumeDocx);
  await writeFile(path.join(folderPath, files.resumePdf), resumePdf);
  await writeFile(path.join(folderPath, files.coverLetterDocx), coverDocx);
  await writeFile(
    path.join(folderPath, files.coverLetterTxt),
    tailored.coverLetter,
    "utf8",
  );

  const zipName = buildZipFileName(extracted.company, extracted.jobTitle);
  const zipPath = path.join(outputRoot, zipName);
  await zipDirectory(folderPath, zipPath);

  return {
    folderPath,
    zipPath,
    zipName,
    folderName,
    company: extracted.company,
    resumeDocxName: files.resumeDocx,
    resumePdfName: files.resumePdf,
    coverLetterDocxName: files.coverLetterDocx,
  };
}

import { NextResponse } from "next/server";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { getOutputRoot } from "@/lib/package";

export const runtime = "nodejs";

const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function contentTypeFor(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".docx")) return DOCX;
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  return null;
}

function isAllowedDocumentName(name: string): boolean {
  // Resume-Karina.docx | Resume-Karina.pdf | Coverletter-Karina.docx
  return /^(Resume|Coverletter)-[A-Za-z0-9][A-Za-z0-9._ -]{0,60}\.(docx|pdf|txt)$/i.test(
    name,
  );
}

function streamFile(filePath: string, contentType: string, fileName: string) {
  const nodeStream = createReadStream(filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new NextResponse(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}

function isSafeZipName(name: string): boolean {
  if (!name.toLowerCase().endsWith(".zip")) return false;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return false;
  }
  if (name.length < 5 || name.length > 180) return false;
  return !/[<>:"|?*\x00-\x1f]/.test(name);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zipName = searchParams.get("file");
  const folder = searchParams.get("folder");
  const name = searchParams.get("name");
  const outputRoot = getOutputRoot();

  if (zipName) {
    if (!isSafeZipName(zipName)) {
      return NextResponse.json({ error: "Invalid zip name" }, { status: 400 });
    }
    const filePath = path.join(outputRoot, zipName);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(outputRoot))) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    if (!existsSync(resolved)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    return streamFile(resolved, "application/zip", path.basename(resolved));
  }

  if (folder && name) {
    if (!/^[A-Za-z0-9_-]+$/.test(folder) || !isAllowedDocumentName(name)) {
      return NextResponse.json({ error: "Invalid file request" }, { status: 400 });
    }

    const contentType = contentTypeFor(name);
    if (!contentType) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    const filePath = path.join(outputRoot, folder, name);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(outputRoot))) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    if (!existsSync(resolved)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return streamFile(resolved, contentType, name);
  }

  return NextResponse.json(
    { error: "Provide file=....zip or folder + name" },
    { status: 400 },
  );
}

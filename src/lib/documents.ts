import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
} from "docx";
import PDFDocument from "pdfkit";
import type { PersonalInfo, TailoredResume } from "./types";
import { segmentWithKeywords } from "./keywords";

const LINK_COLOR = "1F4E79";
const MUTED_COLOR = "555555";

function linkedInDisplay(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `linkedin.com${path}`;
  } catch {
    return url
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "");
  }
}

function linkedInHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function phoneHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}

function emailHref(email: string): string {
  return `mailto:${email}`;
}

function contactSeparator() {
  return new TextRun({
    text: "  ·  ",
    size: 18,
    font: "Calibri",
    color: MUTED_COLOR,
  });
}

function hyperlinkRun(label: string, href: string) {
  return new ExternalHyperlink({
    link: href,
    children: [
      new TextRun({
        text: label,
        color: LINK_COLOR,
        size: 18,
        font: "Calibri",
        underline: {
          type: UnderlineType.NONE,
        },
      }),
    ],
  });
}

function plainContactRun(text: string) {
  return new TextRun({
    text,
    size: 18,
    font: "Calibri",
    color: MUTED_COLOR,
  });
}

function buildResumeHeader(personal: PersonalInfo): Paragraph[] {
  const contactChildren: Array<TextRun | ExternalHyperlink> = [];

  const pushSep = () => {
    if (contactChildren.length) contactChildren.push(contactSeparator());
  };

  if (personal.phone) {
    pushSep();
    contactChildren.push(
      hyperlinkRun(personal.phone, phoneHref(personal.phone)),
    );
  }
  if (personal.email) {
    pushSep();
    contactChildren.push(
      hyperlinkRun(personal.email, emailHref(personal.email)),
    );
  }
  if (personal.linkedin) {
    pushSep();
    contactChildren.push(
      hyperlinkRun(
        linkedInDisplay(personal.linkedin),
        linkedInHref(personal.linkedin),
      ),
    );
  }
  if (personal.location) {
    pushSep();
    contactChildren.push(plainContactRun(personal.location));
  }

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: personal.name.toUpperCase(),
          bold: true,
          size: 40,
          font: "Calibri",
          color: "1A1A1A",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 12,
          color: "1F4E79",
          space: 10,
        },
      },
      children: contactChildren,
    }),
  ];
}

function runsFromText(text: string, keywords: string[], size = 20) {
  return segmentWithKeywords(text, keywords).map(
    (seg) =>
      new TextRun({
        text: seg.text,
        bold: seg.bold,
        size,
        font: "Calibri",
      }),
  );
}

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: "222222", space: 6 },
    },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22,
        font: "Calibri",
        allCaps: true,
        color: "1F4E79",
      }),
    ],
  });
}

function skillGroupParagraph(
  category: string,
  items: string[],
  keywords: string[],
) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: `${category}: `,
        bold: true,
        size: 20,
        font: "Calibri",
      }),
      ...runsFromText(items.join(", "), keywords, 20),
    ],
  });
}

export async function buildResumeDocx(
  personal: PersonalInfo,
  resume: TailoredResume,
): Promise<Buffer> {
  const kw = resume.keywords;

  const children: Paragraph[] = [
    ...buildResumeHeader(personal),
    sectionHeading("Summary"),
    new Paragraph({
      spacing: { after: 140, line: 276 },
      children: runsFromText(resume.summary, kw, 20),
    }),
    sectionHeading("Skills"),
    ...resume.skills.map((group) =>
      skillGroupParagraph(group.category, group.items, kw),
    ),
    sectionHeading("Experience"),
  ];

  for (const [expIndex, exp] of resume.experiences.entries()) {
    children.push(
      new Paragraph({
        spacing: { before: expIndex === 0 ? 120 : 220, after: 40 },
        children: [
          new TextRun({
            text: exp.title,
            bold: true,
            size: 22,
            font: "Calibri",
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 140 },
        children: [
          new TextRun({
            text: `${exp.company}  |  ${exp.location}  |  ${exp.period}`,
            italics: true,
            size: 20,
            font: "Calibri",
          }),
        ],
      }),
      ...(exp.overview
        ? [
            new Paragraph({
              spacing: { after: 140, line: 276 },
              children: [
                new TextRun({
                  text: exp.overview,
                  size: 20,
                  font: "Calibri",
                  italics: true,
                  color: "444444",
                }),
              ],
            }),
          ]
        : []),
      ...exp.bullets.map(
        (bullet) =>
          new Paragraph({
            spacing: { after: 90, line: 276 },
            bullet: { level: 0 },
            children: runsFromText(bullet, kw, 20),
          }),
      ),
    );
  }

  children.push(sectionHeading("Education"));
  for (const [eduIndex, edu] of resume.education.entries()) {
    children.push(
      new Paragraph({
        spacing: { before: eduIndex === 0 ? 100 : 160, after: 40 },
        children: [
          new TextRun({
            text: edu.degree,
            bold: true,
            size: 22,
            font: "Calibri",
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: `${edu.school}  |  ${edu.location}  |  ${edu.period}`,
            italics: true,
            size: 20,
            font: "Calibri",
          }),
        ],
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export async function buildCoverLetterDocx(
  personal: PersonalInfo,
  company: string,
  jobTitle: string,
  coverLetter: string,
  keywords: string[],
): Promise<Buffer> {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const paragraphs = coverLetter
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          ...buildResumeHeader(personal),
          new Paragraph({
            spacing: { before: 160, after: 200 },
            children: [
              new TextRun({ text: today, size: 20, font: "Calibri" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `Hiring Manager`,
                size: 20,
                font: "Calibri",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: company, size: 20, font: "Calibri" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Re: ${jobTitle}`,
                bold: true,
                size: 20,
                font: "Calibri",
              }),
            ],
          }),
          ...paragraphs.map(
            (p) =>
              new Paragraph({
                spacing: { after: 160 },
                children: runsFromText(p, keywords, 20),
              }),
          ),
          new Paragraph({
            spacing: { before: 120 },
            children: [
              new TextRun({
                text: "Sincerely,",
                size: 20,
                font: "Calibri",
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 200 },
            children: [
              new TextRun({
                text: personal.name,
                bold: true,
                size: 20,
                font: "Calibri",
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function drawSegmentedLine(
  doc: PDFKit.PDFDocument,
  text: string,
  keywords: string[],
  options: { fontSize?: number; continued?: boolean } = {},
) {
  const fontSize = options.fontSize ?? 10.5;
  const segments = segmentWithKeywords(text, keywords);
  if (!segments.length) {
    doc.font("Helvetica").fontSize(fontSize).text(" ");
    return;
  }

  // Keep PDFKit cursor valid after long continued runs
  if (!Number.isFinite(doc.x)) doc.x = doc.page.margins.left;
  if (!Number.isFinite(doc.y)) doc.y = doc.page.margins.top;

  segments.forEach((seg, i) => {
    doc
      .fillColor("#000000")
      .font(seg.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(fontSize)
      .text(seg.text, {
        continued: i < segments.length - 1,
        lineGap: 2,
      });
  });
}

function drawPdfContactLine(
  doc: PDFKit.PDFDocument,
  parts: Array<{ label: string; href?: string }>,
) {
  const left = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = Number.isFinite(doc.y) ? doc.y : doc.page.margins.top + 40;
  const sep = " | ";

  doc.font("Helvetica").fontSize(9);
  const full = parts.map((p) => p.label).join(sep);
  let fullWidth = 0;
  try {
    fullWidth = doc.widthOfString(full);
  } catch {
    fullWidth = 0;
  }
  if (!Number.isFinite(fullWidth)) fullWidth = 0;

  let x = left + Math.max(0, (usableWidth - fullWidth) / 2);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !parts.length) {
    doc.x = left;
    doc.y = Number.isFinite(y) ? y : 80;
    doc.fillColor("#555555").text(full || " ", {
      width: usableWidth,
      align: "center",
    });
    return;
  }

  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      const sepWidth = doc.widthOfString(sep);
      doc.fillColor("#555555").text(sep, x, y, { lineBreak: false });
      x += sepWidth;
    }

    const part = parts[i];
    const width = doc.widthOfString(part.label);
    doc
      .fillColor(part.href ? "#1F4E79" : "#555555")
      .text(part.label, x, y, { lineBreak: false });

    // Annotation only — no underline (Word Hyperlink style can force one; PDF drawn line removed)
    if (part.href && Number.isFinite(x) && Number.isFinite(width)) {
      doc.link(x, y - 1, width, 12, part.href);
    }

    x += width;
  }

  doc.x = left;
  doc.y = y + 14;
}

export async function buildResumePdf(
  personal: PersonalInfo,
  resume: TailoredResume,
): Promise<Buffer> {
  const kw = resume.keywords;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 50,
      size: "LETTER",
      info: {
        Title: `${personal.name} - Resume`,
        Author: personal.name,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#1A1A1A")
      .text(personal.name.toUpperCase(), {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
    doc.moveDown(0.3);

    const contactParts: Array<{ label: string; href?: string }> = [];
    if (personal.phone) {
      contactParts.push({
        label: personal.phone,
        href: phoneHref(personal.phone),
      });
    }
    if (personal.email) {
      contactParts.push({
        label: personal.email,
        href: emailHref(personal.email),
      });
    }
    if (personal.linkedin) {
      contactParts.push({
        label: linkedInDisplay(personal.linkedin),
        href: linkedInHref(personal.linkedin),
      });
    }
    if (personal.location) {
      contactParts.push({ label: personal.location });
    }

    drawPdfContactLine(doc, contactParts);

    const lineY = Number.isFinite(doc.y) ? doc.y + 2 : 90;
    doc
      .moveTo(doc.page.margins.left, lineY)
      .lineTo(doc.page.width - doc.page.margins.right, lineY)
      .strokeColor("#1F4E79")
      .lineWidth(1.2)
      .stroke();
    doc.x = doc.page.margins.left;
    doc.y = lineY + 16;
    doc.fillColor("#000000");

    const heading = (label: string) => {
      doc.moveDown(0.65);
      const y = Number.isFinite(doc.y) ? doc.y : doc.page.margins.top;
      doc.x = doc.page.margins.left;
      doc.y = y;
      doc
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor("#1F4E79")
        .text(label.toUpperCase());
      const ruleY = Number.isFinite(doc.y) ? doc.y + 3 : y + 14;
      doc
        .moveTo(doc.page.margins.left, ruleY)
        .lineTo(doc.page.width - doc.page.margins.right, ruleY)
        .strokeColor("#222222")
        .lineWidth(1)
        .stroke();
      doc.x = doc.page.margins.left;
      doc.y = ruleY + 12;
      doc.fillColor("#000000");
    };

    heading("Summary");
    drawSegmentedLine(doc, resume.summary, kw, { fontSize: 10.5 });
    doc.moveDown(0.7);

    heading("Skills");
    for (const group of resume.skills) {
      doc.font("Helvetica-Bold").fontSize(10.5).text(`${group.category}: `, {
        continued: true,
      });
      drawSegmentedLine(doc, group.items.join(", "), kw, { fontSize: 10.5 });
      doc.moveDown(0.35);
    }

    heading("Experience");
    for (const [expIndex, exp] of resume.experiences.entries()) {
      doc.moveDown(expIndex === 0 ? 0.35 : 0.7);
      doc.font("Helvetica-Bold").fontSize(11).text(exp.title);
      doc.moveDown(0.08);
      doc
        .font("Helvetica-Oblique")
        .fontSize(10)
        .text(`${exp.company}  |  ${exp.location}  |  ${exp.period}`);
      if (exp.overview) {
        doc.moveDown(0.45);
        doc
          .font("Helvetica-Oblique")
          .fontSize(10)
          .fillColor("#444444")
          .text(exp.overview, { lineGap: 2 });
        doc.fillColor("#000000");
      }
      doc.moveDown(0.5);
      for (const bullet of exp.bullets) {
        doc.font("Helvetica").fontSize(10.5).text("•  ", {
          continued: true,
        });
        drawSegmentedLine(doc, bullet, kw, { fontSize: 10.5 });
        doc.moveDown(0.35);
      }
    }

    heading("Education");
    for (const [eduIndex, edu] of resume.education.entries()) {
      doc.moveDown(eduIndex === 0 ? 0.3 : 0.55);
      doc.font("Helvetica-Bold").fontSize(11).text(edu.degree);
      doc.moveDown(0.08);
      doc
        .font("Helvetica-Oblique")
        .fontSize(10)
        .text(`${edu.school}  |  ${edu.location}  |  ${edu.period}`);
    }

    doc.end();
  });
}

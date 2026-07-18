import type {
  CandidateProfile,
  ExtractedJD,
  SkillGroup,
  TailoredPackage,
  TailoredResume,
} from "./types";
import { tailorExperienceTitle } from "./job-title";

export interface ValidationIssue {
  level: "error" | "warning" | "fixed";
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  package: TailoredPackage;
}

/** Remove percentage-based measurements without leaving common dangling phrases. */
export function removePercentageValues(input: string): string {
  const percentage = String.raw`\d+(?:\.\d+)?\s*(?:%|percent(?:age)?(?:\s+points?)?)`;

  return String(input || "")
    .replace(new RegExp(`\\bfrom\\s+${percentage}\\s+to\\s+${percentage}`, "gi"), "")
    .replace(new RegExp(`\\b(?:by|about|approximately|roughly|nearly|over|under|up to)\\s+${percentage}`, "gi"), "")
    .replace(new RegExp(`\\b${percentage}\\s+of\\s+`, "gi"), "")
    .replace(new RegExp(`\\b${percentage}`, "gi"), "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Strip markdown and other artifacts the model often injects. */
export function sanitizePlainText(input: string): string {
  let text = removePercentageValues(input);

  // Convert **bold** / __bold__ / *italic* / _italic_ to plain text
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/_([^_\n]+)_/g, "$1");

  // Remove leftover markers and backticks
  text = text.replace(/```(?:json)?/gi, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\*\*/g, "");
  text = text.replace(/__/g, "");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*[-*•]\s+/gm, "");
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

function collectMarkdownIssues(label: string, text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (/\*\*|__|```|`/.test(text)) {
    issues.push({
      level: "fixed",
      message: `Removed markdown formatting from ${label}.`,
    });
  }
  if (/^\s*#{1,6}\s+/m.test(text)) {
    issues.push({
      level: "fixed",
      message: `Removed heading markers from ${label}.`,
    });
  }
  return issues;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Normalized form used to detect duplicate or near-identical bullets. */
function bulletKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Drop empty and repeated bullets while preserving order. */
export function dedupeBullets(bullets: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const bullet of bullets) {
    const key = bulletKey(bullet);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(bullet);
  }
  return unique;
}

/** Fallback professional summary when the model omits or truncates one. */
export function buildFallbackSummary(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): string {
  const years = Math.max(profile.experiences.length * 3, 8);
  const skills = extracted.hardTechnicalSkills.slice(0, 5).join(", ");
  const title = extracted.type || "Software Engineer";
  return (
    `${title} with ${years}+ years of experience designing, building, and operating production software across startups and product companies. ` +
    `Hands-on with ${skills || "modern engineering stacks"}, with a track record of shipping reliable systems, collaborating across functions, and mentoring engineers. ` +
    `Seeking to apply this experience to the ${extracted.jobTitle || title} role at ${extracted.company || "the hiring company"}.`
  );
}

/** Varied filler bullets so padding never repeats the same sentence. */
export function buildFillerBullet(
  company: string,
  skills: string[],
  slot: number,
): string {
  const pick = (offset: number) =>
    skills.length ? skills[(slot + offset) % skills.length] : "";
  const primary = pick(0) || "core platform services";
  const secondary = pick(1) || "internal tooling";

  const templates = [
    `Partnered with product and design stakeholders to scope, build, and ship features using ${primary}, coordinating rollout plans and post-release monitoring for ${company} customers.`,
    `Strengthened reliability of ${company} services by expanding automated test coverage, tightening code review standards, and hardening CI checks across systems built with ${primary} and ${secondary}.`,
    `Diagnosed and resolved production incidents in systems built on ${primary}, documenting root causes and adding safeguards that prevented recurring failures for ${company} teams.`,
    `Mentored teammates through pairing sessions and design reviews, raising team fluency in ${primary} and establishing shared engineering practices across ${company} projects.`,
    `Led refactoring of legacy modules into maintainable, well-tested components built on ${primary}, unblocking faster feature delivery for ${company} product teams.`,
    `Translated business requirements into technical designs alongside cross-functional partners and delivered them using ${primary} and ${secondary}, keeping ${company} stakeholders aligned throughout.`,
    `Owned end-to-end delivery of internal improvements spanning ${primary} and ${secondary}, from technical proposal through deployment and operational handoff at ${company}.`,
  ];
  return templates[slot % templates.length];
}

function sanitizeSkills(skills: SkillGroup[]): SkillGroup[] {
  return skills
    .map((group) => ({
      category: sanitizePlainText(group.category),
      items: group.items
        .map((item) => sanitizePlainText(item))
        .filter(Boolean),
    }))
    .filter((group) => group.category && group.items.length > 0);
}

/**
 * Validate resume content and auto-fix formatting issues
 * (markdown bold markers, wrong company names, short bullets, etc.).
 */
export function validateAndFixResume(
  tailored: TailoredPackage,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const resume = tailored.resume;

  issues.push(...collectMarkdownIssues("summary", resume.summary));
  for (const [i, exp] of resume.experiences.entries()) {
    if (exp.overview) {
      issues.push(...collectMarkdownIssues(`experience ${i + 1} overview`, exp.overview));
    }
    for (const [j, bullet] of exp.bullets.entries()) {
      issues.push(
        ...collectMarkdownIssues(`experience ${i + 1} bullet ${j + 1}`, bullet),
      );
    }
  }
  issues.push(...collectMarkdownIssues("cover letter", tailored.coverLetter));

  let summary = sanitizePlainText(resume.summary);
  const coverLetter = sanitizePlainText(tailored.coverLetter);
  const skills = sanitizeSkills(resume.skills);
  const keywords = resume.keywords
    .map((k) => sanitizePlainText(k))
    .filter(Boolean);

  if (!summary || wordCount(summary) < 20) {
    issues.push({
      level: "fixed",
      message: "Summary was missing or too short; replaced with a tailored fallback.",
    });
    summary = buildFallbackSummary(profile, extracted);
  }

  if (!coverLetter || wordCount(coverLetter) < 40) {
    issues.push({
      level: "error",
      message: "Cover letter is missing or too short.",
    });
  }

  if (skills.length < 3) {
    issues.push({
      level: "warning",
      message: "Skills should be grouped into at least 3 categories.",
    });
  }

  for (const group of skills) {
    if (group.items.length < 2) {
      issues.push({
        level: "warning",
        message: `Skill group "${group.category}" has fewer than 2 items.`,
      });
    }
  }

  if (resume.experiences.length !== profile.experiences.length) {
    issues.push({
      level: "fixed",
      message: "Aligned experience entries to the candidate profile.",
    });
  }

  const experiences = profile.experiences.map((exp, index) => {
    const generated = resume.experiences[index];
    const title = tailorExperienceTitle(
      exp.title,
      extracted.type,
      extracted.jobTitle,
    );
    let overview = sanitizePlainText(generated?.overview || "");
    const rawBullets = (generated?.bullets || [])
      .map((b) => sanitizePlainText(b))
      .filter(Boolean);
    let bullets = dedupeBullets(rawBullets);
    if (bullets.length < rawBullets.length) {
      issues.push({
        level: "fixed",
        message: `Removed ${rawBullets.length - bullets.length} duplicate bullet(s) for ${exp.company}.`,
      });
    }

    if (generated?.company && generated.company !== exp.company) {
      issues.push({
        level: "fixed",
        message: `Corrected company name for role ${index + 1} to "${exp.company}".`,
      });
    }

    if (generated?.period && generated.period !== exp.period) {
      issues.push({
        level: "fixed",
        message: `Corrected period for ${exp.company} to match profile.`,
      });
    }

    if (generated?.location && generated.location !== exp.location) {
      issues.push({
        level: "fixed",
        message: `Corrected location for ${exp.company} to match profile.`,
      });
    }

    if (!overview || overview.split(/\s+/).filter(Boolean).length < 12) {
      issues.push({
        level: "fixed",
        message: `Added company/responsibility overview for ${exp.company}.`,
      });
      overview = `${exp.company} delivers software products for its customers in a ${exp.location.toLowerCase()} environment; as ${title}, owned feature delivery and technical execution across core product workflows.`;
    }

    if (bullets.length < 7) {
      issues.push({
        level: "fixed",
        message: `Added missing bullets for ${exp.company} (need 7–8).`,
      });
      let slot = 0;
      while (bullets.length < 7) {
        bullets = dedupeBullets([
          ...bullets,
          buildFillerBullet(exp.company, extracted.hardTechnicalSkills, slot),
        ]);
        slot += 1;
      }
    }

    if (bullets.length > 8) {
      issues.push({
        level: "fixed",
        message: `Trimmed ${exp.company} experience to 8 bullets.`,
      });
      bullets = bullets.slice(0, 8);
    }

    for (const [j, bullet] of bullets.entries()) {
      if (wordCount(bullet) < 12) {
        issues.push({
          level: "warning",
          message: `${exp.company} bullet ${j + 1} is shorter than expected.`,
        });
      }
      if (/\*\*|__/.test(bullet)) {
        issues.push({
          level: "error",
          message: `${exp.company} bullet ${j + 1} still contains markdown markers.`,
        });
      }
    }

    return {
      company: exp.company,
      title: title || exp.title,
      period: exp.period,
      location: exp.location,
      overview,
      bullets,
    };
  });

  const education =
    Array.isArray(resume.education) && resume.education.length
      ? resume.education.map((edu) => ({
          school: sanitizePlainText(edu.school) || profile.education[0]?.school || "",
          degree: sanitizePlainText(edu.degree) || profile.education[0]?.degree || "",
          period: sanitizePlainText(edu.period) || profile.education[0]?.period || "",
          location:
            sanitizePlainText(edu.location) ||
            profile.education[0]?.location ||
            "",
        }))
      : profile.education;

  // Prefer profile education school names when the model drifts
  const fixedEducation = profile.education.map((edu, index) => {
    const generated = education[index];
    if (!generated) return edu;
    if (generated.school && generated.school !== edu.school) {
      issues.push({
        level: "fixed",
        message: `Corrected school name to "${edu.school}".`,
      });
    }
    return {
      school: edu.school,
      degree: generated.degree || edu.degree,
      period: edu.period,
      location: edu.location,
    };
  });

  if (/\*\*|__|```/.test(summary) || /\*\*|__|```/.test(coverLetter)) {
    issues.push({
      level: "error",
      message: "Markdown markers remain after cleanup.",
    });
  }

  const cleanedResume: TailoredResume = {
    summary,
    skills,
    experiences,
    education: fixedEducation,
    keywords,
  };

  const critical = issues.filter((i) => i.level === "error");
  return {
    ok: critical.length === 0 && Boolean(summary) && Boolean(coverLetter),
    issues,
    package: {
      resume: cleanedResume,
      coverLetter,
    },
  };
}

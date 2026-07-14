export type JobType =
  | "AI Engineer"
  | "Data Engineer"
  | "Software Engineer"
  | "Data Analyst"
  | "Data Scientist";

export type WorkMode = "Remote" | "Hybrid" | "Onsite";

export interface PersonalInfo {
  name: string;
  phone: string;
  linkedin: string;
  email: string;
  location: string;
}

export interface ExperienceInput {
  company: string;
  title: string;
  period: string;
  location: string;
}

export interface EducationInput {
  school: string;
  degree: string;
  period: string;
  location: string;
}

export interface CandidateProfile {
  personal: PersonalInfo;
  experiences: ExperienceInput[];
  education: EducationInput[];
}

export interface ExtractedJD {
  company: string;
  jobTitle: string;
  summary: string;
  type: JobType;
  salaryExpectation: string;
  workMode: WorkMode;
  hardTechnicalSkills: string[];
  softSkills: string[];
}

export interface TailoredExperience {
  company: string;
  title: string;
  period: string;
  location: string;
  /** Short blurb: what the company does + the candidate's responsibility */
  overview: string;
  bullets: string[];
}

export interface SkillGroup {
  category: string;
  items: string[];
}

export interface TailoredResume {
  summary: string;
  skills: SkillGroup[];
  experiences: TailoredExperience[];
  education: EducationInput[];
  keywords: string[];
}

export interface TailoredPackage {
  coverLetter: string;
  resume: TailoredResume;
}

export interface JobResult {
  index: number;
  jobUrl: string;
  company: string;
  folderPath: string;
  zipPath: string;
  zipName: string;
  extracted: ExtractedJD;
  error?: string;
}

export interface TailorRequest {
  jobUrls: string[];
}

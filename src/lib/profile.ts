import type { CandidateProfile } from "./types";

export const CANDIDATE_PROFILE: CandidateProfile = {
  personal: {
    name: "Saul D. Trujillo",
    phone: "+57 313 6512121",
    linkedin: "https://www.linkedin.com/in/saul-d-trujillo-58aa623b7",
    email: "saul2001trujillo@gmail.com",
    location: "Valledupar, Colombia",
  },
  experiences: [
    {
      company: "ChartMogul",
      title: "Senior Software Engineer",
      period: "Oct 2022 – Mar 2026",
      location: "Remote",
    },
    {
      company: "Tpaga",
      title: "Software Engineer",
      period: "Aug 2017 – Aug 2022",
      location: "Remote",
    },
    {
      company: "Nearshore Software Development Agency",
      title: "Software Developer",
      period: "May 2013 – Jul 2017",
      location: "OnSite",
    },
  ],
  education: [
    {
      school: "Universidad Popular del César",
      degree: "Bachelor of Degree in Systems Engineering",
      period: "2009 – 2013",
      location: "Valledupar, Colombia",
    },
  ],
};

export const CANDIDATE_HEADLINE = "Senior Software Engineer";

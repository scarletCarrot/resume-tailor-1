import type { CandidateProfile } from "./types";

export const CANDIDATE_PROFILE: CandidateProfile = {
  personal: {
    name: "Karina Elizabeth Garcia Lozana",
    phone: "+52 55 6672 2218",
    linkedin: "https://www.linkedin.com/in/karina-garcia-1a8805421",
    email: "karinagarcia45904@gmail.com",
    location: "Tepetlaoxtoc, Mexico",
  },
  experiences: [
    {
      company: "Surt",
      title: "Senior Software Engineer",
      period: "Jun 2022 – Apr 2026",
      location: "Remote",
    },
    {
      company: "HiHello",
      title: "Software Engineer",
      period: "Jan 2018 – Feb 2022",
      location: "Remote",
    },
    {
      company: "SmartCone Technologies Inc",
      title: "Software Developer",
      period: "Nov 2016 – Dec 2017",
      location: "Ontario, Canada",
    },
  ],
  education: [
    {
      school: "University of Waterloo",
      degree: "Bachelor of Degree in Computer Science",
      period: "2012 – 2016",
      location: "Waterloo, Ontario, Canada",
    },
  ],
};

export const CANDIDATE_HEADLINE = "Senior Software Engineer";

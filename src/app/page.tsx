import ResumeForm from "@/components/ResumeForm";
import { CANDIDATE_HEADLINE, CANDIDATE_PROFILE } from "@/lib/profile";

export default function Home() {
  const { personal } = CANDIDATE_PROFILE;

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <p className="brand">Resume Tailor</p>
            <p className="brand-sub">ATS packets from job URLs or pasted JDs</p>
          </div>
          <div className="identity">
            <p className="identity-name">{personal.name}</p>
            <p className="identity-meta">
              {CANDIDATE_HEADLINE} · {personal.location}
            </p>
            <p className="identity-contact">
              <a href={`mailto:${personal.email}`}>{personal.email}</a>
              <span aria-hidden>·</span>
              <a href={`tel:${personal.phone.replace(/\s+/g, "")}`}>
                {personal.phone}
              </a>
              <span aria-hidden>·</span>
              <a href={personal.linkedin} target="_blank" rel="noreferrer">
                LinkedIn
              </a>
            </p>
          </div>
        </div>
      </header>

      <main className="main">
        <ResumeForm />
      </main>
    </div>
  );
}

import Link from "next/link";
import {
  BellRing,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleUserRound,
  Cloud,
  Crosshair,
  Fingerprint,
  Flag,
  Layers3,
  LineChart,
  MoonStar,
} from "lucide-react";
import { BloomMark } from "@/components/bloom-mark";

const features = [
  {
    number: "01",
    icon: Crosshair,
    title: "Custom habits & targets",
    copy: "Name the practice, choose its cadence, and measure only what genuinely helps.",
  },
  {
    number: "02",
    icon: Check,
    title: "Honest daily check-ins",
    copy: "Record done, partial, or intentionally skipped without turning one day into a verdict.",
  },
  {
    number: "03",
    icon: LineChart,
    title: "Progress records",
    copy: "Read your consistency through real check-ins instead of motivational guesswork.",
  },
  {
    number: "04",
    icon: BellRing,
    title: "Reminders & inbox",
    copy: "Keep useful prompts together, so attention arrives at the right moment.",
  },
  {
    number: "05",
    icon: Layers3,
    title: "Practical templates",
    copy: "Begin from thoughtfully structured routines, then shape them around your life.",
  },
  {
    number: "06",
    icon: MoonStar,
    title: "Prayer-aware routines",
    copy: "Optionally include faith-aware practices while keeping them private and judgment-free.",
  },
  {
    number: "07",
    icon: Cloud,
    title: "Continuity across sessions",
    copy: "Return to the same habits and records whenever you sign back in.",
  },
];

const sampleRows = [
  { name: "Morning focus", states: [true, true, true, true, false, true, false] },
  { name: "Move with purpose", states: [true, true, false, true, true, true, false] },
  { name: "Read deliberately", states: [true, false, true, true, true, false, false] },
];

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-header">
        <Link href="/" className="bloom-brand" aria-label="Bloom home">
          <span><BloomMark /></span>
          <strong>Bloom</strong>
        </Link>
        <nav aria-label="Primary navigation">
          <a href="#features">Features</a>
          <a href="#method">Method</a>
          <a href="#privacy">Privacy</a>
        </nav>
        <div className="landing-actions">
          <Link href="/login?returnTo=%2Fdashboard">Sign in</Link>
          <Link href="/login?mode=signup&returnTo=%2Fdashboard" className="landing-button landing-button--small">
            Start building
          </Link>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__copy">
          <p className="landing-kicker"><span /> A PRIVATE PRACTICE FOR REAL DISCIPLINE</p>
          <h1 id="landing-title">Build a life that keeps its word.</h1>
          <p className="landing-intro">
            Bloom turns good intentions into repeatable daily systems—clear enough
            to begin today, flexible enough to survive real life.
          </p>
          <div className="landing-hero__actions">
            <Link href="/login?mode=signup&returnTo=%2Fdashboard" className="landing-button">
              Start building <ChevronRight size={19} />
            </Link>
            <a href="#features" className="landing-text-link">Explore the complete practice</a>
          </div>
          <div className="landing-privacy-note">
            <Fingerprint size={24} />
            <p><strong>Explore anonymously.</strong> Personal routines and progress appear only after you sign in.</p>
          </div>
        </div>

        <aside className="ledger-preview" aria-label="Illustrative weekly discipline preview">
          <div className="ledger-preview__head">
            <div>
              <p>ILLUSTRATIVE PREVIEW</p>
              <h2>A week you can read clearly.</h2>
            </div>
            <span>72%</span>
          </div>
          <p className="ledger-preview__notice">Sample structure only — never your personal data.</p>
          <div className="ledger-week" aria-hidden="true">
            <span />
            {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <b key={`${day}-${index}`}>{day}</b>)}
            {sampleRows.map((row) => (
              <div className="ledger-week__row" key={row.name}>
                <strong>{row.name}</strong>
                {row.states.map((done, index) => (
                  <i className={done ? "is-done" : ""} key={`${row.name}-${index}`}>
                    {done ? <Check size={13} /> : <span />}
                  </i>
                ))}
              </div>
            ))}
          </div>
          <footer>
            <div><span>15</span><small>kept promises</small></div>
            <div><span>3</span><small>active practices</small></div>
            <div><span>2</span><small>intentional rests</small></div>
          </footer>
        </aside>
      </section>

      <section className="feature-index" id="features" aria-labelledby="features-title">
        <div className="landing-section-heading">
          <p>THE COMPLETE PRACTICE</p>
          <h2 id="features-title">Everything you need to live with intention.</h2>
          <span>Seven connected tools. One clear place to return.</span>
        </div>
        <div className="feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.number}>
                <div><em>{feature.number}</em><Icon size={20} /></div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="method-section" id="method" aria-labelledby="method-title">
        <div className="method-statement">
          <p>THE METHOD</p>
          <h2 id="method-title">Structure,<br />without severity.</h2>
          <blockquote>Discipline works best when it is honest enough to continue.</blockquote>
        </div>
        <ol>
          <li><span>01</span><Flag size={22} /><div><h3>Define what matters</h3><p>Choose one clear practice and decide what success actually means.</p></div></li>
          <li><span>02</span><BookOpenCheck size={22} /><div><h3>Check in truthfully</h3><p>Record what happened—complete, partial, or intentionally skipped.</p></div></li>
          <li><span>03</span><LineChart size={22} /><div><h3>Review the pattern</h3><p>Use your record to adjust the system, never to judge your worth.</p></div></li>
        </ol>
      </section>

      <section className="privacy-section" id="privacy">
        <div>
          <p>PRIVATE FROM THE FIRST VISIT</p>
          <h2>Your discipline is personal.<br />Bloom treats it that way.</h2>
        </div>
        <div>
          <Fingerprint size={30} />
          <p>
            Visitors see the method, not a pretend account. Your name, habits,
            reminders, prayer preferences, and progress are requested only inside
            an authenticated private space.
          </p>
        </div>
      </section>

      <section className="landing-cta">
        <BloomMark className="landing-cta-mark" />
        <p>FOR PEOPLE WHO TREAT DISCIPLINE AS SELF-RESPECT</p>
        <h2>Begin with one promise<br />you intend to keep.</h2>
        <Link href="/login?mode=signup&returnTo=%2Fdashboard" className="landing-button landing-button--light">
          Create your private space <CircleUserRound size={19} />
        </Link>
      </section>

      <footer className="landing-footer">
        <Link href="/" className="bloom-brand"><span><BloomMark /></span><strong>Bloom</strong></Link>
        <p>Private habits. Honest records. A stronger daily life.</p>
        <Link href="/login?returnTo=%2Fdashboard">Sign in</Link>
      </footer>
    </main>
  );
}

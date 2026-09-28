"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentationContent } from "@/components/documentation";
import { systemFlow, workflowSteps } from "@/content/how-it-works";
import { getMethods, getSession, type MethodRegistryEntry } from "@/lib/api";
import { Badge, Button, Mark, PageHeader, ThemeToggle } from "@/components/ui";

function StartProjectButton() {
  const router = useRouter();
  return <Button onClick={() => void getSession()
    .then((session) => router.push(session?.user ? "/app/projects/new" : "/sign-in?next=/app/projects/new"))
    .catch(() => router.push("/sign-in?next=/app/projects/new"))}>Start a project</Button>;
}

const publicLinks = [
  ["Methods", "/methods"],
  ["How it works", "/how-it-works"],
  ["Documentation", "/documentation"]
] as const;

function PublicHeader() {
  return <header className="public-header">
    <Mark />
    <nav className="public-nav" aria-label="Primary navigation">
      {publicLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
    </nav>
    <div className="public-actions"><ThemeToggle /><StartProjectButton /></div>
    <details className="public-menu">
      <summary aria-label="Open navigation">Menu</summary>
      <nav aria-label="Mobile navigation">
        {publicLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        <div className="mobile-theme"><ThemeToggle /></div>
      </nav>
    </details>
  </header>;
}

export function Landing() {
  return <><PublicHeader /><main className="landing">
    <section className="hero">
      <div className="hero-copy-block">
        <p className="eyebrow">RESEARCH ANALYSIS WORKSPACE</p>
        <h1>From research question to defensible result.</h1>
        <p className="hero-copy">Methodome turns protocols, instruments and datasets into a reviewable analysis plan, deterministic computation and a complete record of how each result was produced.</p>
        <div className="hero-actions"><StartProjectButton /><Button href="/how-it-works" variant="secondary">See the research workflow</Button></div>
        <p className="hero-footnote">Researcher reviewed. Method governed. Reproducible by design.</p>
      </div>
      <ResearchMockup />
    </section>
    <section className="principle-strip" aria-label="Methodome principles">
      <div><b>01</b><span><strong>Research intent first</strong>Protocol and study design shape the plan.</span></div>
      <div><b>02</b><span><strong>Deterministic methods</strong>Rules constrain what can run.</span></div>
      <div><b>03</b><span><strong>Traceable output</strong>Every result retains its evidence chain.</span></div>
    </section>
    <WorkflowStrip />
    <section className="method-family-section">
      <div className="section-intro"><div><p className="eyebrow">METHODS REGISTRY</p><h2>A catalogue with boundaries.</h2><p>Method maturity, eligibility and execution status remain explicit.</p></div><Button href="/methods" variant="secondary">Explore the registry</Button></div>
      <div className="family-grid">{currentFamilies.map((name, index) => <article key={name}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{name}</h3><p>{familyCopy(name)}</p></div><i aria-hidden="true">↗</i></article>)}</div>
    </section>
    <section className="two-column-copy">
      <article><p className="eyebrow">REPRODUCIBILITY</p><h2>Every result has a record.</h2><p>Trace an estimate to its dataset version, transformations, locked plan, method, software and diagnostics.</p></article>
      <article><p className="eyebrow">RESEARCHER CONTROL</p><h2>Inference remains reviewable.</h2><p>Methodome distinguishes extracted suggestions, dataset evidence and researcher-confirmed decisions throughout the workflow.</p></article>
    </section>
    <section className="final-cta"><div><p className="eyebrow">BEGIN A STUDY</p><h2>Build the analysis record while you do the work.</h2></div><StartProjectButton /></section>
  </main><PublicFooter /></>;
}

function ResearchMockup() {
  return <div className="research-mockup" aria-label="Example Methodome analysis plan">
    <div className="mock-top"><span>Analysis plan</span><span className="record-id">PLAN / 02</span></div>
    <div className="mock-status"><span><i />Researcher reviewed</span><Badge kind="success">Planned before analysis</Badge></div>
    <div className="mock-question"><p className="mono">RESEARCH QUESTION 02</p><h3>Is reporting completeness associated with medicine stockout?</h3></div>
    <dl className="mock-grid">
      <div><dt>Outcome</dt><dd><code>stockout_status</code></dd></div>
      <div><dt>Design</dt><dd>Cross sectional</dd></div>
      <div><dt>Predictor</dt><dd><code>reporting_complete</code></dd></div>
      <div><dt>Observations</dt><dd>1,284 facilities</dd></div>
    </dl>
    <div className="mock-method"><span>Selected method</span><strong>Binary logistic regression</strong><small>Validated · executable · 4 diagnostics required</small></div>
    <div className="mock-provenance"><span>Dataset <code>v_04</code></span><span>Plan hash <code>8f2a…1c04</code></span></div>
  </div>;
}
function WorkflowStrip() {
  const labels = ["Protocol", "Instruments", "Data", "Study design", "Variable mapping", "Plan", "Analysis", "Results"];
  return (
    <section className="workflow">
      <div className="section-intro compact-workflow-intro">
        <div>
          <p className="eyebrow">THE RESEARCH CHAIN</p>
          <h2>Each decision has a place and a record.</h2>
          <p>Move from source evidence to reviewed statistical output without losing the reasoning between them.</p>
        </div>
        <Button href="/how-it-works" variant="secondary">See how it works</Button>
      </div>
      <div className="workflow-steps">
        {labels.map((label, index) => (
          <span key={label}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            <em>{label}</em>
          </span>
        ))}
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section className="workflow-explainer">
      <div className="section-intro">
        <div>
          <p className="eyebrow">FROM RESEARCH INTENT TO RESULTS</p>
          <h2>The full analysis chain stays visible.</h2>
          <p>
            Methodome separates research interpretation, methodological rules,
            researcher approval and statistical computation so each step can be reviewed.
          </p>
        </div>
      </div>

      <div className="workflow-diagram" aria-label="Methodome system flow">
        {systemFlow.map((item, index) => (
          <div key={item.label} className="workflow-diagram-step">
            <small>{String(index + 1).padStart(2, "0")}</small>
            <b>{item.label}</b>
            <span>{item.detail}</span>
            {index < systemFlow.length - 1 && <i aria-hidden="true">→</i>}
          </div>
        ))}
      </div>

      <div className="workflow-detail-grid">
        {workflowSteps.map((step) => (
          <article key={step.id} id={step.id}>
            <div className="workflow-step-number">{step.number}</div>
            <div className="workflow-step-copy"><h2>{step.title}</h2><p>{step.summary}</p></div>
            <ul>{step.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
            <div className="workflow-output"><span>Output</span><strong>{step.output}</strong></div>
          </article>
        ))}
      </div>

      <section className="boundary-note">
        <p className="eyebrow">THE BOUNDARY THAT MATTERS</p>
        <h2>Language models do not generate Methodome statistics.</h2>
        <p>
          Models may help read research documents and propose mappings. The method
          registry constrains analytical choices, the researcher reviews the plan,
          and deterministic Python or R execution produces the statistical values.
        </p>
      </section>
    </section>
  );
}

export function PublicPage({ page }: { page: string }) { if (page === "methods") return <MethodsCatalogue publicPage />; if (page === "sign-in" || page === "sign-up") return <AuthPage signup={page === "sign-up"} />; const howItWorks = page === "how-it-works"; return <><PublicHeader /><main className="public-page"><PageHeader eyebrow="METHODOME" title={howItWorks ? "How Methodome works" : "Documentation"} description={howItWorks ? "A research workflow that separates research interpretation, method rules, researcher approval, and deterministic computation." : "Guidance for the workflow and current capabilities in Methodome."} />{howItWorks ? <Workflow /> : <DocumentationContent />}</main><PublicFooter /></>; }
const currentFamilies = [
  "Descriptive statistics",
  "Association tests",
  "Regression",
  "Multilevel models",
  "Count regression"
] as const;

function displayFamily(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayMaturity(value: MethodRegistryEntry["maturity"]) {
  return value.replace(/^./, (character) => character.toUpperCase());
}

export function MethodsCatalogue({ publicPage = false }: { publicPage?: boolean }) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("All");
  const [methods, setMethods] = useState<MethodRegistryEntry[]>([]);
  const [status, setStatus] = useState("Loading method registry…");

  useEffect(() => {
    getMethods()
      .then((response) => {
        setMethods(response.methods);
        setStatus("");
      })
      .catch(() =>
        setStatus("Methodome could not load the live method registry.")
      );
  }, []);

  const familyOptions = Array.from(
    new Set(methods.map((method) => displayFamily(method.family)))
  ).sort();
  const filtered = methods.filter(
    (method) =>
      (family === "All" || displayFamily(method.family) === family) &&
      method.displayName.toLowerCase().includes(query.toLowerCase())
  );

  const body = (
    <>
      <div className="catalogue-tools">
        <label>
          <span className="sr-only">Search methods</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search methods"
          />
        </label>
        <select
          value={family}
          onChange={(event) => setFamily(event.target.value)}
          aria-label="Filter method family"
        >
          <option>All</option>
          {familyOptions.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      {status && <p className="muted">{status}</p>}
      <div className="method-list">
        {filtered.map((method) => (
          <MethodCard key={method.id} method={method} />
        ))}
        {!status && filtered.length === 0 && (
          <p className="empty">No methods match this search.</p>
        )}
      </div>
    </>
  );

  if (publicPage) {
    return (
      <>
        <PublicHeader />
        <main className="public-page">
          <PageHeader
            eyebrow="METHODS CATALOGUE"
            title="Methods for structured research."
            description="The catalogue reflects the live Methodome registry, including method maturity and current execution status."
          />
          {body}
        </main>
        <PublicFooter />
      </>
    );
  }

  return (
    <main className="app-content">
      <PageHeader
        eyebrow="METHODS LIBRARY"
        title="Methods library"
        description="Requirements, diagnostics, maturity and current execution status come from the live method registry."
      />
      {body}
    </main>
  );
}

function MethodCard({ method }: { method: MethodRegistryEntry }) {
  const [open, setOpen] = useState(false);
  const maturity = displayMaturity(method.maturity);
  return (
    <article className="method-card">
      <div>
        <div className="action-row method-badges">
          <Badge
            kind={
              method.maturity === "validated"
                ? "success"
                : method.maturity === "supported"
                  ? "blue"
                  : "warning"
            }
          >
            {maturity}
          </Badge>
          <Badge kind={method.executable ? "teal" : "neutral"}>
            {method.executable ? "Executable" : "Execution pending"}
          </Badge>
        </div>
        <h3>{method.displayName}</h3>
        <p className="muted">{displayFamily(method.family)}</p>
        <p>
          Outcome types: {method.outcomeTypes.map((item) => item.replaceAll("_", " ")).join(", ")}.
        </p>
      </div>
      <button
        className="text-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? "Hide details" : "View details"}
      </button>
      {open && (
        <div className="method-details">
          <div>
            <b>Requirements and assumptions</b>
            <ul>
              {method.assumptions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <b>Diagnostics</b>
            <ul>
              {method.diagnostics.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div>
            <b>Design support</b>
            <ul>
              <li>Clustering: {method.supportsClustering ? "supported" : "not supported"}</li>
              <li>Repeated measures: {method.supportsRepeatedMeasures ? "supported" : "not supported"}</li>
              <li>Survey weights: {method.supportsSurveyWeights ? "supported" : "not supported"}</li>
              <li>{method.executable ? "Available to the current execution pipeline." : "Listed in the registry but not executable in the current release."}</li>
            </ul>
          </div>
        </div>
      )}
    </article>
  );
}

function AuthPage({ signup }: { signup: boolean }) { return <main className="auth"><Link href="/" className="auth-brand"><Mark /></Link><form><p className="eyebrow">METHODOME ACCOUNT</p><h1>{signup ? "Create your account" : "Sign in to Methodome"}</h1><p>{signup ? "Start a structured research workspace." : "Continue to your research workspace."}</p>{signup && <label>Full name<input autoComplete="name" placeholder="Your name" /></label>}<label>Email<input type="email" autoComplete="email" placeholder="name@organisation.org" /></label><label>Password<input type="password" autoComplete={signup ? "new-password" : "current-password"} /></label><Button href="/app/projects" type="submit">{signup ? "Create account" : "Sign in"}</Button><p className="muted">{signup ? "Already have an account? " : "Need an account? "}<Link href={signup ? "/sign-in" : "/sign-up"}>{signup ? "Sign in" : "Create one"}</Link></p></form></main>; }
function PublicFooter() { return <footer className="public-footer"><Mark /><span>Methodome · Structured research work</span></footer>; }
function familyCopy(name: string) {
  const copy: Record<string, string> = {
    "Descriptive statistics": "Summarise observed variables before modelling.",
    "Association tests": "Assess unadjusted relationships between observed variables.",
    "Regression": "Estimate adjusted associations for supported outcome types.",
    "Multilevel models": "Represent clustered or repeated-data methods whose execution boundary is still restricted.",
    "Count regression": "Represent count-outcome models while Poisson and negative-binomial execution remains pending."
  };
  return copy[name] ?? "";
}

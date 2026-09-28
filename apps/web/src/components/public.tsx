"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentationContent } from "@/components/documentation";
import { systemFlow, workflowSteps } from "@/content/how-it-works";
import { getMethods, getSession, type MethodRegistryEntry } from "@/lib/api";
import { Badge, Button, Mark, PageHeader, ThemeToggle } from "@/components/ui";

function StartProjectButton() { const router = useRouter(); return <Button onClick={() => void getSession().then((session) => router.push(session?.user ? "/app/projects/new" : "/sign-in?next=/app/projects/new")).catch(() => router.push("/sign-in?next=/app/projects/new"))}>Start a project</Button>; }
function PublicHeader() { return <header className="public-header"><Mark /><nav><Link href="/methods">Methods</Link><Link href="/how-it-works">How it works</Link><Link href="/documentation">Documentation</Link></nav><div><ThemeToggle /><StartProjectButton /></div></header>; }
export function Landing() { return <><PublicHeader /><main className="landing"><section className="hero"><div><p className="eyebrow">RESEARCH WORKSPACE</p><h1>Research analysis,<br />brought together.</h1><p className="hero-copy">Clean data, define your study, build an analysis plan, run statistical methods, review diagnostics and produce reproducible results from one research workspace.</p><div className="hero-actions"><StartProjectButton /><Button href="/methods" variant="secondary">Explore methods</Button></div></div><ResearchMockup /></section><WorkflowStrip /><section className="method-family-section"><div className="section-intro"><div><p className="eyebrow">METHODS LIBRARY</p><h2>Your methods in one place.</h2></div><Button href="/methods" variant="secondary">Explore all methods</Button></div><p className="muted">The registry includes executable methods and methods whose execution is still pending. See the catalogue for method-level status.</p><div className="family-grid">{currentFamilies.map((name, i) => <article key={name}><span>0{i + 1}</span><h3>{name}</h3><p>{familyCopy(name)}</p></article>)}</div></section><section className="two-column-copy"><article><p className="eyebrow">REPRODUCIBILITY</p><h2>Every result has a record.</h2><p>Trace a result to its dataset version, transformations, analysis plan, method, code, package versions and diagnostics.</p></article><article><p className="eyebrow">DATA CONTROL</p><h2>Researchers control processing.</h2><p>Set project data rules before any model assisted extraction or qualitative processing takes place.</p></article></section><section className="final-cta"><p className="eyebrow">READY TO BEGIN</p><h2>Create your first<br />Methodome project.</h2><StartProjectButton /></section></main><PublicFooter /></>; }
function ResearchMockup() { return <div className="research-mockup"><div className="mock-top"><span>Analysis plan</span><Badge kind="success">Planned before analysis</Badge></div><p className="mono">RESEARCH QUESTION 2</p><h3>Is reporting completeness associated with medicine stockout?</h3><div className="mock-grid"><div><span>Outcome</span><code>stockout_status</code></div><div><span>Outcome type</span><strong>Binary</strong></div><div><span>Design</span><strong>Cross sectional</strong></div><div><span>Repeated / clustered</span><strong>No</strong></div></div><p className="mono">CANDIDATE METHOD</p><div className="method-option"><strong>Binary logistic regression</strong><small>Validated · executable</small></div><a href="/methods">View method requirements and diagnostics</a></div>; }
function WorkflowStrip() {
  const labels = ["Protocol", "Data", "Define", "Map", "Plan", "Analyse", "Review", "Report"];
  return (
    <section className="workflow">
      <div className="section-intro compact-workflow-intro">
        <div>
          <p className="eyebrow">FROM PROTOCOL TO RESULTS</p>
          <h2>A defined research workflow.</h2>
        </div>
        <Button href="/how-it-works" variant="secondary">See how it works</Button>
      </div>
      <div className="workflow-steps">
        {labels.map((label, index) => (
          <span key={label}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            {label}
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
            <b>{item.label}</b>
            <span>{item.detail}</span>
            {index < systemFlow.length - 1 && <i aria-hidden="true">↓</i>}
          </div>
        ))}
      </div>

      <div className="workflow-detail-grid">
        {workflowSteps.map((step) => (
          <article key={step.id} id={step.id}>
            <b>{step.number}</b>
            <h2>{step.title}</h2>
            <p>{step.summary}</p>
            <ul>
              {step.details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
            <small><strong>Output:</strong> {step.output}</small>
          </article>
        ))}
      </div>

      <section className="panel">
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

"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DocumentationContent } from "@/components/documentation";
import { systemFlow, workflowSteps } from "@/content/how-it-works";
import { getSession } from "@/lib/api";
import { families, methods } from "@/mocks/fixtures";
import { Badge, Button, Mark, MethodBadge, PageHeader } from "@/components/ui";

function StartProjectButton() { const router = useRouter(); return <Button onClick={() => void getSession().then((session) => router.push(session?.user ? "/app/projects/new" : "/sign-in?next=/app/projects/new")).catch(() => router.push("/sign-in?next=/app/projects/new"))}>Start a project</Button>; }
function PublicHeader() { return <header className="public-header"><Mark /><nav><Link href="/methods">Methods</Link><Link href="/how-it-works">How it works</Link><Link href="/documentation">Documentation</Link></nav><div><StartProjectButton /></div></header>; }
export function Landing() { return <><PublicHeader /><main className="landing"><section className="hero"><div><p className="eyebrow">RESEARCH WORKSPACE</p><h1>Research analysis,<br />brought together.</h1><p className="hero-copy">Clean data, define your study, build an analysis plan, run statistical methods, review diagnostics and produce reproducible results from one research workspace.</p><div className="hero-actions"><StartProjectButton /><Button href="/methods" variant="secondary">Explore methods</Button></div></div><ResearchMockup /></section><WorkflowStrip /><section className="method-family-section"><div className="section-intro"><div><p className="eyebrow">METHODS LIBRARY</p><h2>Your methods in one place.</h2></div><Button href="/methods" variant="secondary">Explore all methods</Button></div><div className="family-grid">{families.map((name, i) => <article key={name}><span>0{i + 1}</span><h3>{name}</h3><p>{familyCopy(name)}</p></article>)}</div></section><section className="two-column-copy"><article><p className="eyebrow">REPRODUCIBILITY</p><h2>Every result has a record.</h2><p>Trace a result to its dataset version, transformations, analysis plan, method, code, package versions and diagnostics.</p></article><article><p className="eyebrow">DATA CONTROL</p><h2>Researchers control processing.</h2><p>Set project data rules before any model assisted extraction or qualitative processing takes place.</p></article></section><section className="final-cta"><p className="eyebrow">READY TO BEGIN</p><h2>Create your first<br />Methodome project.</h2><StartProjectButton /></section></main><PublicFooter /></>; }
function ResearchMockup() { return <div className="research-mockup"><div className="mock-top"><span>Analysis plan</span><Badge kind="success">Planned before analysis</Badge></div><p className="mono">RESEARCH QUESTION 3</p><h3>Is reporting completeness associated with medicine stockout?</h3><div className="mock-grid"><div><span>Outcome</span><code>stockout_status</code></div><div><span>Outcome type</span><strong>Binary</strong></div><div><span>Design</span><strong>Cross sectional</strong></div><div><span>Clustering</span><code>district</code></div></div><p className="mono">CANDIDATE METHODS</p><div className="method-option"><strong>Mixed effects logistic regression</strong><small>Cluster specific estimate</small></div><div className="method-option"><strong>GEE logistic regression</strong><small>Population average estimate</small></div><a href="#methods">Why are there two options?</a></div>; }
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
export function MethodsCatalogue({ publicPage = false }: { publicPage?: boolean }) { const [query, setQuery] = useState(""); const [family, setFamily] = useState("All"); const filtered = methods.filter(method => (family === "All" || method.family === family) && method.name.toLowerCase().includes(query.toLowerCase())); const body = <><div className="catalogue-tools"><label><span className="sr-only">Search methods</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search methods" /></label><select value={family} onChange={e => setFamily(e.target.value)} aria-label="Filter method family"><option>All</option>{Array.from(new Set(methods.map(m => m.family))).map(f => <option key={f}>{f}</option>)}</select></div><div className="method-list">{filtered.map(method => <MethodCard key={method.id} method={method} />)}{filtered.length === 0 && <p className="empty">No methods match this search.</p>}</div></>; if (publicPage) return <><PublicHeader /><main className="public-page"><PageHeader eyebrow="METHODS CATALOGUE" title="Methods for structured research." description="Explore method requirements, diagnostics and implementation maturity." />{body}</main><PublicFooter /></>; return <main className="app-content"><PageHeader eyebrow="METHODS LIBRARY" title="Methods library" description="Requirements, diagnostics and implementation details are visible before selection." />{body}</main>; }
function MethodCard({ method }: { method: typeof methods[number] }) { const [open, setOpen] = useState(false); return <article className="method-card"><div><MethodBadge maturity={method.maturity} /><h3>{method.name}</h3><p className="muted">{method.family}</p><p>{method.purpose}</p></div><button className="text-button" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide details" : "View details"}</button>{open && <div className="method-details"><div><b>Requirements</b><ul>{method.requirements.map(item => <li key={item}>{item}</li>)}</ul></div><div><b>Diagnostics</b><ul>{method.diagnostics.map(item => <li key={item}>{item}</li>)}</ul></div><div><b>Implementation</b><ul>{method.implementations.map(item => <li key={item}>{item}</li>)}</ul></div></div>}</article>; }
function AuthPage({ signup }: { signup: boolean }) { return <main className="auth"><Link href="/" className="auth-brand"><Mark /></Link><form><p className="eyebrow">METHODOME ACCOUNT</p><h1>{signup ? "Create your account" : "Sign in to Methodome"}</h1><p>{signup ? "Start a structured research workspace." : "Continue to your research workspace."}</p>{signup && <label>Full name<input autoComplete="name" placeholder="Your name" /></label>}<label>Email<input type="email" autoComplete="email" placeholder="name@organisation.org" /></label><label>Password<input type="password" autoComplete={signup ? "new-password" : "current-password"} /></label><Button href="/app/projects" type="submit">{signup ? "Create account" : "Sign in"}</Button><p className="muted">{signup ? "Already have an account? " : "Need an account? "}<Link href={signup ? "/sign-in" : "/sign-up"}>{signup ? "Sign in" : "Create one"}</Link></p></form></main>; }
function PublicFooter() { return <footer className="public-footer"><Mark /><span>Methodome · Structured research work</span></footer>; }
function familyCopy(name: string) { const copy: Record<string, string> = { "Descriptive statistics": "Summarise data clearly before modelling.", "Association tests": "Assess relationships between observed variables.", "Regression": "Estimate adjusted associations and predictions.", "Multilevel models": "Account for clustered observations.", "Survival analysis": "Model time to an event.", "Survey analysis": "Respect complex sampling designs.", "Time series": "Analyse trends and interventions over time.", "Psychometrics": "Evaluate instruments and constructs.", "Bayesian analysis": "Make assumptions explicit through priors.", "Causal analysis": "Specify causal questions and assumptions.", "Qualitative analysis": "Organise evidence from text and interviews.", "Mixed methods": "Connect quantitative and qualitative evidence." }; return copy[name]; }

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, PageHeader, ThemeToggle } from "@/components/ui";
import { ProjectPage as PrototypeProjectPage } from "@/components/workspace";
import {
  MethodomeApiError,
  appendDatasets,
  compareDatasetSchemas,
  createAnalysisJob,
  createAnalysisPlan,
  createProject,
  createUpload,
  getAnalysisJob,
  verifyEmailOtp,
  resendEmailVerificationOtp,
  getAuthConfig,
  getAnalysisPlan,
  getAnalysisResult,
  getVariableMappingSuggestions,
  getProtocolExtraction,
  extractProtocol,
  getAuditTrail,
  getDatasets,
  getDatasetProfile,
  getMethodCandidates,
  getMethods,
  getAnalysisHistory,
  getProject,
  getProjectFiles,
  getProjectPolicy,
  getProjects,
  getSession,
  getStudySpecification,
  getVariableMappings,
  lockAnalysisPlan,
  registerDataset,
  saveStudySpecification,
  saveVariableMappings,
  signIn,
  signOut,
  signUp,
  updateProjectPolicy,
  uploadFile,
  type AnalysisPlan,
  type MethodRegistryEntry,
  type AnalysisResult,
  type BackendProject,
  type CandidateSelection,
  type DatasetVersion,
  type ProjectFile,
  type ProtocolExtraction,
  type VariableMapping,
  type SchemaComparison,
  type StudySpecification
} from "@/lib/api";

function message(error: unknown): string {
  if (error instanceof MethodomeApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Methodome could not complete the request.";
}

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "blocked">("loading");

  useEffect(() => {
    let active = true;
    getSession()
      .then((session) => {
        if (!active) return;
        if (session?.user) {
          setState("ready");
        } else {
          setState("blocked");
          router.replace(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
        }
      })
      .catch(() => {
        if (!active) return;
        setState("blocked");
        router.replace(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (state !== "ready") {
    return (
      <div className="app-content narrow">
        <p className="muted">Checking your Methodome session…</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function LiveAuthPage({ signup }: { signup: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const destination = next?.startsWith("/") ? next : "/app/projects";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationPending, setVerificationPending] = useState(false);
  const [authConfig, setAuthConfig] = useState({
    turnstileRequired: false,
    turnstileSiteKey: null as string | null,
    emailVerificationRequired: false
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    getAuthConfig()
      .then(setAuthConfig)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!signup || !authConfig.turnstileRequired || !authConfig.turnstileSiteKey) {
      return;
    }
    if (document.querySelector('script[data-methodome-turnstile="true"]')) {
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.dataset.methodomeTurnstile = "true";
    document.head.appendChild(script);
  }, [signup, authConfig.turnstileRequired, authConfig.turnstileSiteKey]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (signup) {
        const formData = new FormData(event.currentTarget);
        const turnstileToken = String(
          formData.get("cf-turnstile-response") ?? ""
        ).trim();

        if (authConfig.turnstileRequired && !turnstileToken) {
          setError("Complete the bot check before creating an account.");
          return;
        }

        await signUp({
          name,
          email,
          password,
          ...(turnstileToken ? { turnstileToken } : {})
        });

        if (authConfig.emailVerificationRequired) {
          setVerificationPending(true);
          setNotice("We sent a six-digit verification code to your email.");
          return;
        }
      } else {
        await signIn({ email, password });
      }
      router.push(destination);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await verifyEmailOtp({ email, otp });
      await signIn({ email, password });
      router.push(destination);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await resendEmailVerificationOtp(email);
      setNotice("A new verification code was sent.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <div className="auth-theme"><ThemeToggle /></div>
      <a href="/" className="auth-brand">
        <span className="brand"><span className="mark">M</span><span>Methodome</span></span>
      </a>

      {verificationPending ? (
        <form onSubmit={verify}>
          <p className="eyebrow">VERIFY EMAIL</p>
          <h1>Check your email</h1>
          <p>
            Enter the six-digit code sent to <strong>{email}</strong>.
          </p>
          <label>
            Verification code
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
            />
          </label>
          <Button type="submit">{busy ? "Verifying…" : "Verify email"}</Button>
          <Button variant="quiet" onClick={() => void resend()}>
            Send another code
          </Button>
          {notice && <p className="confirmation" role="status">{notice}</p>}
          {error && <p className="confirmation" role="alert">{error}</p>}
        </form>
      ) : (
        <form onSubmit={submit}>
          <p className="eyebrow">METHODOME ACCOUNT</p>
          <h1>{signup ? "Create your account" : "Sign in to Methodome"}</h1>
          <p>{signup ? "Start a structured research workspace." : "Continue to your research workspace."}</p>
          {signup && (
            <label>
              Full name
              <input
                required
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <label>
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={10}
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {signup && authConfig.turnstileRequired && authConfig.turnstileSiteKey && (
            <div
              className="cf-turnstile"
              data-sitekey={authConfig.turnstileSiteKey}
              data-theme="light"
              data-size="flexible"
            />
          )}

          <Button type="submit">{busy ? "Working…" : signup ? "Create account" : "Sign in"}</Button>
          {notice && <p className="confirmation" role="status">{notice}</p>}
          {error && <p className="confirmation" role="alert">{error}</p>}
          <p className="muted">
            {signup ? "Already have an account? " : "Need an account? "}
            <a href={`${signup ? "/sign-in" : "/sign-up"}?next=${encodeURIComponent(destination)}`}>
              {signup ? "Sign in" : "Create one"}
            </a>
          </p>
        </form>
      )}
    </main>
  );
}

export function LiveProjectsPage() {
  const [projects, setProjects] = useState<BackendProject[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getProjects().then(setProjects).catch((err) => setError(message(err)));
  }, []);

  const visible = useMemo(
    () =>
      projects.filter((project) =>
        project.name.toLowerCase().includes(query.toLowerCase())
      ),
    [projects, query]
  );

  return (
    <main className="app-content">
      <PageHeader
        eyebrow="PROJECTS"
        title="Research projects"
        description="Select a project to continue structured research work."
        actions={<Button href="/app/projects/new">New project</Button>}
      />
      <div className="list-tools">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          aria-label="Search projects"
        />
      </div>
      {error && <p className="confirmation" role="alert">{error}</p>}
      <div className="project-table table-wrap">
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Research type</th>
              <th>Current stage</th>
              <th>Last activity</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((project) => (
              <tr key={project.id}>
                <td>
                  <a href={`/app/projects/${project.id}/overview`}>
                    <strong>{project.name}</strong>
                  </a>
                </td>
                <td>{project.researchType.replaceAll("_", " ")}</td>
                <td><Badge kind="teal">{project.state.replaceAll("_", " ")}</Badge></td>
                <td>{new Date(project.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!error && visible.length === 0 && <p className="muted">No projects yet.</p>}
    </main>
  );
}

export function LiveNewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [researchType, setResearchType] = useState<"quantitative" | "qualitative" | "mixed_methods">("quantitative");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const project = await createProject({
        name,
        ...(description ? { description } : {}),
        researchType
      });
      router.push(`/app/projects/${project.id}/overview`);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-content narrow">
      <PageHeader
        eyebrow="NEW PROJECT"
        title="Set up a research project"
        description="Create the workspace first. Research files and study details can be added inside the project."
      />
      <form className="form-panel" onSubmit={submit}>
        <label>
          Project name
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label>
          Research type
          <select value={researchType} onChange={(event) => setResearchType(event.target.value as typeof researchType)}>
            <option value="quantitative">Quantitative</option>
            <option value="qualitative">Qualitative</option>
            <option value="mixed_methods">Mixed methods</option>
          </select>
        </label>
        <Button type="submit">{busy ? "Creating…" : "Create project"}</Button>
        {error && <p className="confirmation" role="alert">{error}</p>}
      </form>
    </main>
  );
}

export function LiveProjectPage({
  projectId,
  section
}: {
  projectId: string;
  section: string;
}) {
  const [project, setProject] = useState<BackendProject | null>(null);

  useEffect(() => {
    getProject(projectId).then(setProject).catch(() => setProject(null));
  }, [projectId]);

  const title = project?.name ?? "Methodome project";
  const sectionDescriptions: Record<string, string> = {
    overview: "Project sources, research decisions, analysis readiness and next actions.",
    protocol: "Upload the study protocol and review the study information Methodome extracts from it.",
    instruments: "Add questionnaires or codebooks that can provide evidence for variable mapping.",
    data: "Upload source datasets, compare form versions and create harmonised dataset versions.",
    "data-preparation": "Inspect dataset structure and derived versions before analysis planning.",
    "study-design": "Review research questions and confirm the study design that constrains valid analyses.",
    variables: "Connect confirmed research concepts to observed dataset variables using explicit evidence.",
    "analysis-plan": "Review candidate methods for each research question and lock the approved plan.",
    analysis: "Run the analyses recorded in the locked plan through deterministic statistical computation.",
    results: "Review estimates, diagnostics, warnings and software details from completed analyses.",
    reports: "Prepare research outputs from completed structured results.",
    "audit-trail": "Inspect the record of project actions and versioned research decisions.",
    settings: "Set the project data class, ethics reference and model-processing policy."
  };

  return (
    <main className="app-content">
      <LiveProjectStage projectId={projectId} />
      <PageHeader
        eyebrow={section.replaceAll("-", " ").toUpperCase()}
        title={title}
        description={
          sectionDescriptions[section] ??
          "Continue structured research work in this Methodome project."
        }
      />
      <LiveWorkflowGuide projectId={projectId} />
      {section === "overview" && <LiveOverview projectId={projectId} project={project} />}
      {section === "protocol" && <LiveProjectFiles projectId={projectId} mode="protocol" />}
      {section === "instruments" && <LiveProjectFiles projectId={projectId} mode="instruments" />}
      {section === "data" && <LiveData projectId={projectId} />}
      {section === "data-preparation" && <LiveDataPreparation projectId={projectId} />}
      {section === "study-design" && <LiveStudyDesign projectId={projectId} />}
      {section === "variables" && <LiveVariables projectId={projectId} />}
      {section === "analysis-plan" && <LiveAnalysisPlan projectId={projectId} />}
      {section === "analysis" && <LiveAnalysis projectId={projectId} />}
      {section === "results" && <LiveResults projectId={projectId} />}
      {section === "reports" && <LiveReports projectId={projectId} />}
      {section === "audit-trail" && <LiveAudit projectId={projectId} />}
      {section === "settings" && <LiveProjectSettings projectId={projectId} />}
      {![
        "overview",
        "protocol",
        "instruments",
        "data",
        "data-preparation",
        "study-design",
        "variables",
        "analysis-plan",
        "analysis",
        "results",
        "reports",
        "audit-trail",
        "settings"
      ].includes(section) && <PrototypeProjectPage section={section} />}
    </main>
  );
}

function LiveProjectStage({ projectId }: { projectId: string }) {
  const [state, setState] = useState({
    protocol: false,
    data: false,
    design: false,
    mappings: false,
    plan: false,
    analysis: false
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      getProjectFiles(projectId),
      getDatasets(projectId),
      getStudySpecification(projectId),
      getVariableMappings(projectId),
      getAnalysisPlan(projectId),
      getAnalysisHistory()
    ])
      .then(([files, datasets, specification, mappings, plan, history]) => {
        if (!active) return;
        setState({
          protocol: files.some((file) => file.fileKind === "protocol"),
          data: datasets.length > 0,
          design: Boolean(specification),
          mappings:
            mappings.length > 0 &&
            mappings.every((mapping) => Boolean(mapping.confirmedBy)),
          plan: Boolean(plan?.lockedAt),
          analysis: history.some(
            (item) =>
              String(item.projectId ?? "") === projectId &&
              String(item.state ?? "") === "complete"
          )
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [projectId]);

  const stages = [
    ["Protocol", state.protocol],
    ["Data", state.data],
    ["Design", state.design],
    ["Mappings", state.mappings],
    ["Plan", state.plan],
    ["Analysis", state.analysis]
  ] as const;

  const firstIncomplete = stages.findIndex(([, complete]) => !complete);

  return (
    <div className="stage" aria-label="Project stage">
      {stages.map(([label, complete], index) => (
        <span
          key={label}
          className={complete ? "done" : index === firstIncomplete ? "active" : ""}
        >
          {complete ? "✓ " : ""}{label}
        </span>
      ))}
    </div>
  );
}

function LiveWorkflowGuide({ projectId }: { projectId: string }) {
  const [next, setNext] = useState({
    label: "Loading project guidance",
    detail: "Checking the research records in this project.",
    href: ""
  });

  useEffect(() => {
    Promise.all([
      getProjectFiles(projectId),
      getDatasets(projectId),
      getStudySpecification(projectId),
      getVariableMappings(projectId),
      getAnalysisPlan(projectId),
      getAnalysisHistory(),
      getProtocolExtraction(projectId)
    ])
      .then(([files, datasets, specification, mappings, plan, history, extraction]) => {
        const base = `/app/projects/${projectId}`;
        if (!files.some((file) => file.fileKind === "protocol")) {
          return setNext({
            label: "Add a protocol",
            detail: "Upload the research protocol so Methodome can extract and retain the study logic.",
            href: `${base}/protocol`
          });
        }
        if (!specification && !extraction) {
          return setNext({
            label: "Extract study information",
            detail: "The protocol is uploaded. Extract its research questions and design before confirming the study specification.",
            href: `${base}/protocol`
          });
        }
        if (
          datasets.length === 0 &&
          !files.some(
            (file) => file.fileKind === "instrument" || file.fileKind === "codebook"
          )
        ) {
          return setNext({
            label: "Add an instrument or continue to data",
            detail: "Instrument or codebook metadata can improve variable mapping. If you do not have one, continue to Data and upload the dataset.",
            href: `${base}/instruments`
          });
        }
        if (datasets.length === 0) {
          return setNext({
            label: "Upload a dataset",
            detail: "Upload a CSV dataset before Methodome can profile variables or map study concepts.",
            href: `${base}/data`
          });
        }
        if (!specification) {
          return setNext({
            label: "Review extracted study information",
            detail: "Confirm the research questions and study design extracted from the protocol.",
            href: `${base}/study-design`
          });
        }
        if (
          mappings.length === 0 ||
          mappings.some((mapping) => !mapping.confirmedBy)
        ) {
          return setNext({
            label: "Review variable mappings",
            detail: "Confirm evidence-backed links between research concepts and dataset variables.",
            href: `${base}/variables`
          });
        }
        if (!plan) {
          return setNext({
            label: "Build an analysis plan",
            detail: "Review deterministic method candidates for each research question that is ready.",
            href: `${base}/analysis-plan`
          });
        }
        if (!plan.lockedAt) {
          return setNext({
            label: "Approve and lock the plan",
            detail: "Locking records the plan and its SHA-256 hash before planned analysis.",
            href: `${base}/analysis-plan`
          });
        }

        const complete = history.some(
          (item) =>
            String(item.projectId ?? "") === projectId &&
            String(item.state ?? "") === "complete"
        );
        if (!complete) {
          return setNext({
            label: "Run approved analyses",
            detail: "The locked plan is ready for deterministic statistical execution.",
            href: `${base}/analysis`
          });
        }

        return setNext({
          label: "Review results",
          detail: "At least one analysis is complete. Review estimates, diagnostics and execution details.",
          href: `${base}/results`
        });
      })
      .catch(() =>
        setNext({
          label: "Review project records",
          detail: "Methodome could not determine the next step. Review the available project records.",
          href: `/app/projects/${projectId}/overview`
        })
      );
  }, [projectId]);

  return (
    <section className="panel workflow-guide">
      <p className="eyebrow">NEXT RECOMMENDED ACTION</p>
      <h2>{next.label}</h2>
      <p>{next.detail}</p>
      {next.href && <Button href={next.href}>Continue</Button>}
    </section>
  );
}

function LiveOverview({
  projectId,
  project
}: {
  projectId: string;
  project: BackendProject | null;
}) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [specification, setSpecification] = useState<StudySpecification | null>(null);
  const [mappings, setMappings] = useState<VariableMapping[]>([]);
  const [plan, setPlan] = useState<AnalysisPlan | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [extraction, setExtraction] = useState<ProtocolExtraction | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void Promise.all([
      getProjectFiles(projectId),
      getDatasets(projectId),
      getStudySpecification(projectId),
      getVariableMappings(projectId),
      getAnalysisPlan(projectId),
      getAnalysisHistory(),
      getProtocolExtraction(projectId)
    ])
      .then(([sourceFiles, dataVersions, spec, savedMappings, savedPlan, analyses, extracted]) => {
        setFiles(sourceFiles);
        setDatasets(dataVersions);
        setSpecification(spec);
        setMappings(savedMappings);
        setPlan(savedPlan);
        setHistory(
          analyses.filter((item) => String(item.projectId ?? "") === projectId)
        );
        setExtraction(extracted);
      })
      .catch((err) => setStatus(message(err)));
  }, [projectId]);

  const hasProtocol = files.some((file) => file.fileKind === "protocol");
  const instrumentCount = files.filter(
    (file) => file.fileKind === "instrument" || file.fileKind === "codebook"
  ).length;
  const confirmedMappings =
    mappings.length > 0 && mappings.every((mapping) => Boolean(mapping.confirmedBy));
  const completedAnalyses = history.filter(
    (item) => String(item.state ?? "") === "complete"
  ).length;

  const items: Array<{
    title: string;
    detail: string;
    status: string;
    kind: "success" | "warning" | "blue" | "neutral";
    href: string;
  }> = [
    {
      title: "Protocol",
      detail: hasProtocol
        ? extraction
          ? `${extraction.researchQuestions.length} research question${extraction.researchQuestions.length === 1 ? "" : "s"} extracted for review`
          : "Uploaded; study extraction has not been completed"
        : "No protocol uploaded",
      status: hasProtocol ? (extraction ? "Extracted" : "Uploaded") : "Required",
      kind: hasProtocol ? (extraction ? "success" : "blue") : "warning",
      href: `/app/projects/${projectId}/protocol`
    },
    {
      title: "Instruments",
      detail:
        instrumentCount > 0
          ? `${instrumentCount} instrument or codebook file${instrumentCount === 1 ? "" : "s"}`
          : "Optional supporting metadata has not been added",
      status: instrumentCount > 0 ? "Available" : "Optional",
      kind: instrumentCount > 0 ? "success" : "neutral",
      href: `/app/projects/${projectId}/instruments`
    },
    {
      title: "Data",
      detail:
        datasets.length > 0
          ? `${datasets.length} dataset version${datasets.length === 1 ? "" : "s"} registered`
          : "No dataset uploaded",
      status: datasets.length > 0 ? "Available" : "Required",
      kind: datasets.length > 0 ? "success" : "warning",
      href: `/app/projects/${projectId}/data`
    },
    {
      title: "Study specification",
      detail: specification
        ? `${specification.researchQuestions.length} research question${specification.researchQuestions.length === 1 ? "" : "s"} confirmed`
        : "Research design has not been confirmed",
      status: specification ? "Confirmed" : "Required",
      kind: specification ? "success" : "warning",
      href: `/app/projects/${projectId}/study-design`
    },
    {
      title: "Variable mapping",
      detail:
        mappings.length === 0
          ? "No research concepts have been mapped"
          : `${mappings.filter((mapping) => mapping.confirmedBy).length} of ${mappings.length} mappings confirmed`,
      status: confirmedMappings ? "Confirmed" : mappings.length ? "Review" : "Required",
      kind: confirmedMappings ? "success" : "warning",
      href: `/app/projects/${projectId}/variables`
    },
    {
      title: "Analysis plan",
      detail: plan
        ? `${plan.analyses.length} planned analysis${plan.analyses.length === 1 ? "" : "es"}`
        : "No analysis plan created",
      status: plan?.lockedAt ? "Locked" : plan ? "Draft" : "Required",
      kind: plan?.lockedAt ? "success" : plan ? "blue" : "warning",
      href: `/app/projects/${projectId}/analysis-plan`
    },
    {
      title: "Analysis",
      detail:
        completedAnalyses > 0
          ? `${completedAnalyses} completed analysis run${completedAnalyses === 1 ? "" : "s"}`
          : "No completed analysis runs",
      status: completedAnalyses > 0 ? "Results available" : "Not complete",
      kind: completedAnalyses > 0 ? "success" : "neutral",
      href:
        completedAnalyses > 0
          ? `/app/projects/${projectId}/results`
          : `/app/projects/${projectId}/analysis`
    }
  ];

  return (
    <>
      <section className="panel overview-intro">
        <div>
          <p className="eyebrow">PROJECT CONTROL</p>
          <h2>{project?.name ?? "Research project"}</h2>
          <p>
            {project?.description ||
              "Review source material, research decisions and analysis progress from one place."}
          </p>
        </div>
        <div className="overview-meta">
          <span>Research type</span>
          <strong>{project?.researchType.replaceAll("_", " ") ?? "Loading"}</strong>
        </div>
      </section>

      <div className="overview-status-grid">
        {items.map((item) => (
          <a className="overview-status-card" href={item.href} key={item.title}>
            <div className="panel-heading">
              <h2>{item.title}</h2>
              <Badge kind={item.kind}>{item.status}</Badge>
            </div>
            <p>{item.detail}</p>
            <span className="text-button">Open</span>
          </a>
        ))}
      </div>
      {status && <p className="confirmation" role="alert">{status}</p>}
    </>
  );
}

function LiveProjectFiles({
  projectId,
  mode
}: {
  projectId: string;
  mode: "protocol" | "instruments";
}) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"protocol" | "instrument" | "codebook">(
    mode === "protocol" ? "protocol" : "instrument"
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [extraction, setExtraction] = useState<ProtocolExtraction | null>(null);

  async function refresh() {
    const current = await getProjectFiles(projectId);
    setFiles(
      current.filter((item) =>
        mode === "protocol"
          ? item.fileKind === "protocol"
          : item.fileKind === "instrument" || item.fileKind === "codebook"
      )
    );
    if (mode === "protocol") {
      setExtraction(await getProtocolExtraction(projectId));
    }
  }

  useEffect(() => {
    void refresh().catch((err) => setStatus(message(err)));
  }, [projectId, mode]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setStatus("");
    try {
      const intent = await createUpload(projectId, {
        filename: file.name,
        mediaType: file.type || "application/octet-stream",
        fileKind: kind,
        sizeBytes: file.size
      });
      await uploadFile(intent.uploadPath, file, file.type || "application/octet-stream");
      setFile(null);

      if (mode === "protocol") {
        setStatus("Protocol uploaded. Extracting study information…");
        try {
          const extracted = await extractProtocol(projectId, intent.fileId);
          setExtraction(extracted);
          setStatus(
            `Protocol uploaded and study information extracted. Review ${extracted.researchQuestions.length} research question${extracted.researchQuestions.length === 1 ? "" : "s"} before analysis planning.`
          );
        } catch (err) {
          setStatus(
            `Protocol uploaded. Automatic extraction needs review: ${message(err)}`
          );
        }
      } else {
        setStatus("Research file uploaded.");
      }
      await refresh();
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function reExtract() {
    const latest = files[0];
    if (!latest) return;
    setBusy(true);
    setStatus("Extracting study information…");
    try {
      const extracted = await extractProtocol(projectId, latest.id);
      setExtraction(extracted);
      setStatus("Study information extracted from the latest protocol.");
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="form-panel">
        <p className="eyebrow">{mode === "protocol" ? "PROTOCOL SOURCE" : "RESEARCH INSTRUMENTS"}</p>
        <h2>{mode === "protocol" ? "Upload protocol" : "Upload instrument or codebook"}</h2>
        {mode === "protocol" ? (
          <p className="muted">
            Text-based PDF, DOCX, TXT and Markdown protocols can be converted to text for study-information extraction.
          </p>
        ) : (
          <p className="muted">
            Instruments and codebooks provide question text and labels that Methodome can use as evidence during variable mapping.
          </p>
        )}
        {mode === "instruments" && (
          <label>
            File type
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="instrument">Instrument</option>
              <option value="codebook">Codebook</option>
            </select>
          </label>
        )}
        <label>
          Research file
          <input
            type="file"
            accept={
              mode === "protocol"
                ? ".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                : undefined
            }
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Button onClick={() => void upload()}>{busy ? "Working…" : "Upload file"}</Button>
        {mode === "protocol" && files.length > 0 && (
          <Button variant="secondary" onClick={() => void reExtract()}>
            Re-extract latest protocol
          </Button>
        )}
        {status && <p className="confirmation" role="status">{status}</p>}
        {mode === "instruments" && (
          <Button href={`/app/projects/${projectId}/data`} variant="quiet">
            Continue without an instrument
          </Button>
        )}
      </section>

      {mode === "protocol" && extraction && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EXTRACTED FROM PROTOCOL</p>
              <h2>{extraction.studyTitle || "Study information"}</h2>
            </div>
            <Badge kind="blue">Needs researcher review</Badge>
          </div>
          <div className="spec-grid">
            <div>
              <span>Study design</span>
              <strong>{extraction.studyDesign?.replaceAll("_", " ") || "Not stated"}</strong>
            </div>
            <div>
              <span>Unit of analysis</span>
              <strong>{extraction.unitOfAnalysis || "Not stated"}</strong>
            </div>
            <div>
              <span>Research questions</span>
              <strong>{extraction.researchQuestions.length}</strong>
            </div>
            <div>
              <span>Sampling</span>
              <strong>{extraction.samplingDesign || "Not stated"}</strong>
            </div>
          </div>
          <ol>
            {extraction.researchQuestions.map((question, index) => (
              <li key={`${index}-${question.text}`}>{question.text}</li>
            ))}
          </ol>
          <p className="muted">
            Extraction is a proposal from the research layer. Confirm or correct it on Study Design before it becomes the project study specification.
          </p>
          <Button href={`/app/projects/${projectId}/study-design`} variant="secondary">
            Review study information
          </Button>
        </section>
      )}

      <section className="panel table-wrap">
        <div className="panel-heading">
          <h2>{mode === "protocol" ? "Protocol files" : "Instrument files"}</h2>
          <Badge kind="neutral">{files.length} files</Badge>
        </div>
        <table>
          <thead>
            <tr><th>File</th><th>Type</th><th>Size</th><th>Checksum</th><th>Uploaded</th></tr>
          </thead>
          <tbody>
            {files.map((item) => (
              <tr key={item.id}>
                <td>{item.filename}</td>
                <td>{item.fileKind}</td>
                <td>{item.sizeBytes != null ? `${Math.ceil(item.sizeBytes / 1024)} KB` : "—"}</td>
                <td><code>{item.checksumSha256 === "pending" ? "pending" : item.checksumSha256.slice(0, 12)}</code></td>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {files.length === 0 && (
          <p className="muted">
            {mode === "protocol"
              ? "No protocol uploaded yet."
              : "No instrument or codebook uploaded yet. You can continue without one, but mappings may have less evidence."}
          </p>
        )}
      </section>
    </>
  );
}

function LiveData({ projectId }: { projectId: string }) {
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");
  const [comparison, setComparison] = useState<SchemaComparison | null>(null);
  const [derivedLabel, setDerivedLabel] = useState("Harmonised dataset");

  async function refresh() {
    const current = await getDatasets(projectId);
    setDatasets(current);
    const originals = current.filter((dataset) => dataset.sourceKind === "original");
    setLeftId((value) => value || originals[0]?.id || "");
    setRightId((value) => value || originals[1]?.id || "");
  }

  useEffect(() => {
    void refresh().catch((err) => setStatus(message(err)));
  }, [projectId]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setStatus("");
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const rowCount = Math.max(0, lines.length - 1);
      const columnCount = lines[0]?.split(",").length ?? 0;
      const intent = await createUpload(projectId, {
        filename: file.name,
        mediaType: file.type || "text/csv",
        fileKind: "dataset",
        sizeBytes: file.size
      });
      await uploadFile(intent.uploadPath, file, file.type || "text/csv");
      await registerDataset(projectId, {
        fileId: intent.fileId,
        label: label || file.name,
        rowCount,
        columnCount
      });
      setStatus("Dataset uploaded and registered.");
      setFile(null);
      setLabel("");
      await refresh();
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    if (!leftId || !rightId || leftId === rightId) {
      setStatus("Choose two different dataset versions.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const [left, right] = await Promise.all([
        getDatasetProfile(projectId, leftId),
        getDatasetProfile(projectId, rightId)
      ]);
      const result = await compareDatasetSchemas(projectId, {
        leftDatasetVersionId: leftId,
        rightDatasetVersionId: rightId,
        leftVariables: left.variables.map((variable) => ({
          variableName: variable.variableName,
          ...(variable.label ? { label: variable.label } : {}),
          dataType: variable.dataType,
          ...(variable.responseChoices ? { responseChoices: variable.responseChoices } : {})
        })),
        rightVariables: right.variables.map((variable) => ({
          variableName: variable.variableName,
          ...(variable.label ? { label: variable.label } : {}),
          dataType: variable.dataType,
          ...(variable.responseChoices ? { responseChoices: variable.responseChoices } : {})
        }))
      });
      setComparison(result);
      setStatus("Schema comparison ready. Review uncertain mappings before combining.");
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function harmonise() {
    if (!comparison) return;
    setBusy(true);
    setStatus("");
    try {
      const mappings: Array<{
        sourceDatasetVersionId: string;
        sourceVariable: string;
        targetVariable: string;
      }> = [];

      for (const mapping of comparison.mappings) {
        if (!mapping.right) continue;
        const target = mapping.right.variableName;
        mappings.push({
          sourceDatasetVersionId: comparison.leftDatasetVersionId,
          sourceVariable: mapping.left.variableName,
          targetVariable: target
        });
        mappings.push({
          sourceDatasetVersionId: comparison.rightDatasetVersionId,
          sourceVariable: mapping.right.variableName,
          targetVariable: target
        });
      }

      for (const variable of comparison.leftOnly) {
        mappings.push({
          sourceDatasetVersionId: comparison.leftDatasetVersionId,
          sourceVariable: variable.variableName,
          targetVariable: variable.variableName
        });
      }

      for (const variable of comparison.rightOnly) {
        mappings.push({
          sourceDatasetVersionId: comparison.rightDatasetVersionId,
          sourceVariable: variable.variableName,
          targetVariable: variable.variableName
        });
      }

      const created = await appendDatasets(projectId, {
        sourceDatasetVersionIds: [
          comparison.leftDatasetVersionId,
          comparison.rightDatasetVersionId
        ],
        label: derivedLabel,
        reason: "Researcher confirmed form-version schema harmonisation.",
        mappings
      });

      setStatus(
        `Created derived dataset with ${created.rowCount} rows and ${created.columnCount} variables.`
      );
      setComparison(null);
      await refresh();
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="form-panel">
        <h2>Upload dataset</h2>
        <label>
          Dataset label
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Day 1 Kobo export" />
        </label>
        <p className="muted">
          Supported in this release: CSV. Excel workbooks are not accepted yet.
        </p>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Button onClick={() => void upload()}>{busy ? "Working…" : "Upload dataset"}</Button>
        {status && <p className="confirmation" role="status">{status}</p>}
      </section>

      <div className="dataset-grid">
        {datasets.map((dataset) => (
          <article className="dataset-card" key={dataset.id}>
            <Badge kind={dataset.sourceKind === "derived" ? "success" : "neutral"}>
              {dataset.sourceKind}
            </Badge>
            <h2>{dataset.label}</h2>
            <div className="data-facts">
              <span><b>{dataset.rowCount ?? "—"}</b> records</span>
              <span><b>{dataset.columnCount ?? "—"}</b> variables</span>
            </div>
            <code>{dataset.id}</code>
          </article>
        ))}
      </div>

      {datasets.length > 0 && (
        <div className="action-row">
          <Button href={`/app/projects/${projectId}/data-preparation`}>
            Review dataset profile
          </Button>
        </div>
      )}

      {datasets.filter((dataset) => dataset.sourceKind === "original").length >= 2 && (
        <section className="form-panel">
          <p className="eyebrow">FORM VERSION HARMONISATION</p>
          <h2>Compare and combine datasets</h2>
          <p>Use this when fieldwork continued after a Kobo or questionnaire form changed.</p>
          <div className="form-grid">
            <label>
              Earlier dataset
              <select value={leftId} onChange={(event) => setLeftId(event.target.value)}>
                {datasets.filter((d) => d.sourceKind === "original").map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </label>
            <label>
              Later dataset
              <select value={rightId} onChange={(event) => setRightId(event.target.value)}>
                {datasets.filter((d) => d.sourceKind === "original").map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </label>
          </div>
          <Button variant="secondary" onClick={() => void compare()}>
            Compare schemas
          </Button>

          {comparison && (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Earlier field</th>
                      <th>Later field</th>
                      <th>Status</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.mappings.map((mapping) => (
                      <tr key={`${mapping.left.variableName}-${mapping.right?.variableName ?? "none"}`}>
                        <td><code>{mapping.left.variableName}</code></td>
                        <td><code>{mapping.right?.variableName ?? "—"}</code></td>
                        <td>
                          <Badge kind={mapping.status === "direct_match" ? "success" : mapping.status === "probable_match" ? "blue" : "warning"}>
                            {mapping.status.replaceAll("_", " ")}
                          </Badge>
                        </td>
                        <td>{mapping.evidence.join(" ")}</td>
                      </tr>
                    ))}
                    {comparison.leftOnly.map((variable) => (
                      <tr key={`left-${variable.variableName}`}>
                        <td><code>{variable.variableName}</code></td>
                        <td>—</td>
                        <td><Badge kind="warning">Earlier only</Badge></td>
                        <td>Retained as a column with missing values for later records.</td>
                      </tr>
                    ))}
                    {comparison.rightOnly.map((variable) => (
                      <tr key={`right-${variable.variableName}`}>
                        <td>—</td>
                        <td><code>{variable.variableName}</code></td>
                        <td><Badge kind="warning">Later only</Badge></td>
                        <td>Retained as a column with missing values for earlier records.</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label>
                Derived dataset label
                <input value={derivedLabel} onChange={(event) => setDerivedLabel(event.target.value)} />
              </label>
              <p className="muted">
                Creating the dataset confirms the displayed field mappings. Category recoding can be reviewed in Data Preparation.
              </p>
              <Button onClick={() => void harmonise()}>Create harmonised dataset</Button>
            </>
          )}
        </section>
      )}
    </>
  );
}

function LiveDataPreparation({ projectId }: { projectId: string }) {
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getDatasetProfile>> | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    getDatasets(projectId)
      .then((items) => {
        setDatasets(items);
        const preferred =
          items.find((item) => item.sourceKind === "derived")?.id ??
          items[0]?.id ??
          "";
        setSelectedId(preferred);
      })
      .catch((err) => setStatus(message(err)));
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) {
      setProfile(null);
      return;
    }
    setStatus("");
    getDatasetProfile(projectId, selectedId)
      .then(setProfile)
      .catch((err) => {
        setProfile(null);
        setStatus(message(err));
      });
  }, [projectId, selectedId]);

  const selected = datasets.find((item) => item.id === selectedId) ?? null;

  return (
    <>
      <section className="form-panel">
        <p className="eyebrow">DATASET VERSION</p>
        <h2>Inspect prepared data</h2>
        <label>
          Dataset version
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.label} · {dataset.sourceKind}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <div className="spec-grid">
            <div><span>Records</span><strong>{selected.rowCount ?? "—"}</strong></div>
            <div><span>Variables</span><strong>{selected.columnCount ?? "—"}</strong></div>
            <div><span>Source</span><strong>{selected.sourceKind}</strong></div>
            <div>
              <span>Parents</span>
              <code>{selected.parentVersionIds.length ? selected.parentVersionIds.join(", ") : "Original upload"}</code>
            </div>
          </div>
        )}
        <p className="muted">
          Source uploads remain immutable. Harmonised data is stored as a new derived dataset with parent lineage and a transformation record.
        </p>
        {status && <p className="confirmation" role="status">{status}</p>}
      </section>

      {profile && (
        <section className="panel table-wrap">
          <div className="panel-heading">
            <h2>Dataset profile</h2>
            <Badge kind="neutral">{profile.rowCount} rows · {profile.columnCount} columns</Badge>
          </div>
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Type</th>
                <th>Missing</th>
                <th>Unique</th>
                <th>Range or categories</th>
              </tr>
            </thead>
            <tbody>
              {profile.variables.map((variable) => (
                <tr key={variable.variableName}>
                  <td><code>{variable.variableName}</code></td>
                  <td>{variable.dataType.replaceAll("_", " ")}</td>
                  <td>{variable.missingCount}</td>
                  <td>{variable.uniqueCount}</td>
                  <td>
                    {variable.range
                      ? `${variable.range.min} to ${variable.range.max}`
                      : variable.responseChoices?.map((choice) => choice.label).join(", ") ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            Form-version field harmonisation is available on the Data page. General interactive cleaning rules will be added as versioned transformations in a later release.
          </p>
        </section>
      )}
      {profile && (
        <div className="action-row">
          <Button href={`/app/projects/${projectId}/study-design`}>
            Continue to study design
          </Button>
        </div>
      )}
    </>
  );
}

function LiveStudyDesign({ projectId }: { projectId: string }) {
  type ObjectiveType = StudySpecification["researchQuestions"][number]["objectiveType"];
  type QuestionDraft = {
    id: string;
    text: string;
    objectiveType: ObjectiveType;
    outcomes: string;
    predictors: string;
    covariates: string;
    estimand: string;
  };

  const emptyQuestion = (): QuestionDraft => ({
    id: `rq-${crypto.randomUUID()}`,
    text: "",
    objectiveType: null,
    outcomes: "",
    predictors: "",
    covariates: "",
    estimand: ""
  });

  const [questions, setQuestions] = useState<QuestionDraft[]>([emptyQuestion()]);
  const [design, setDesign] = useState<StudySpecification["studyDesign"]>("cross_sectional");
  const [unit, setUnit] = useState("");
  const [repeatedMeasures, setRepeatedMeasures] = useState(false);
  const [clustered, setClustered] = useState(false);
  const [clusterVariable, setClusterVariable] = useState("");
  const [surveyWeights, setSurveyWeights] = useState(false);
  const [weightVariable, setWeightVariable] = useState("");
  const [stratified, setStratified] = useState(false);
  const [strataVariable, setStrataVariable] = useState("");
  const [samplingDesign, setSamplingDesign] = useState("");
  const [missingDataPlan, setMissingDataPlan] = useState("");
  const [statedAnalysisPlan, setStatedAnalysisPlan] = useState("");
  const [source, setSource] = useState<"saved" | "protocol" | "manual">("manual");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  function concepts(value: string): string[] {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  useEffect(() => {
    Promise.all([
      getStudySpecification(projectId),
      getProtocolExtraction(projectId),
      getProjectFiles(projectId)
    ])
      .then(async ([specification, extraction, files]) => {
        let activeExtraction = extraction;

        if (!specification && !activeExtraction) {
          const latestProtocol = files.find((item) => item.fileKind === "protocol");
          if (latestProtocol) {
            setStatus("Extracting study information from the protocol…");
            try {
              activeExtraction = await extractProtocol(projectId, latestProtocol.id);
              setStatus("Study information extracted. Review it before confirming.");
            } catch (err) {
              setStatus(message(err));
            }
          }
        }

        if (specification) {
          setQuestions(
            specification.researchQuestions.map((question) => ({
              id: question.id,
              text: question.text,
              objectiveType: question.objectiveType,
              outcomes: question.outcomes.map((item) => item.concept).join(", "),
              predictors: question.predictors.map((item) => item.concept).join(", "),
              covariates: question.covariates.map((item) => item.concept).join(", "),
              estimand: question.estimand ?? ""
            }))
          );
          setDesign(specification.studyDesign);
          setUnit(specification.unitOfAnalysis);
          setRepeatedMeasures(specification.repeatedMeasures);
          setClustered(specification.clustered);
          setClusterVariable(specification.clusterVariable ?? "");
          setSurveyWeights(specification.surveyWeights);
          setWeightVariable(specification.weightVariable ?? "");
          setStratified(specification.stratified);
          setStrataVariable(specification.strataVariable ?? "");
          setSamplingDesign(specification.samplingDesign ?? "");
          setMissingDataPlan(specification.missingDataPlan ?? "");
          setStatedAnalysisPlan(specification.statedAnalysisPlan ?? "");
          setSource("saved");
          return;
        }

        if (activeExtraction) {
          setQuestions(
            activeExtraction.researchQuestions.length
              ? activeExtraction.researchQuestions.map((question, index) => ({
                  id: `rq${index + 1}`,
                  text: question.text,
                  objectiveType: question.objectiveType,
                  outcomes: question.outcomes.join(", "),
                  predictors: question.predictors.join(", "),
                  covariates: question.covariates.join(", "),
                  estimand: question.estimand ?? ""
                }))
              : [emptyQuestion()]
          );
          setDesign(activeExtraction.studyDesign ?? "other");
          setUnit(activeExtraction.unitOfAnalysis ?? "");
          setRepeatedMeasures(activeExtraction.repeatedMeasures ?? false);
          setClustered(activeExtraction.clustered ?? false);
          setClusterVariable(activeExtraction.clusterConcept ?? "");
          setSurveyWeights(activeExtraction.surveyWeights ?? false);
          setWeightVariable(activeExtraction.weightConcept ?? "");
          setStratified(activeExtraction.stratified ?? false);
          setStrataVariable(activeExtraction.strataConcept ?? "");
          setSamplingDesign(activeExtraction.samplingDesign ?? "");
          setMissingDataPlan(activeExtraction.missingDataPlan ?? "");
          setStatedAnalysisPlan(activeExtraction.statedAnalysisPlan ?? "");
          setSource("protocol");
        }
      })
      .catch((err) => setStatus(message(err)));
  }, [projectId]);

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((current) =>
      current.map((question, itemIndex) =>
        itemIndex === index ? { ...question, ...patch } : question
      )
    );
  }

  async function save() {
    const validQuestions = questions.filter((question) => question.text.trim());
    if (validQuestions.length === 0) {
      setStatus("Add at least one research question.");
      return;
    }
    if (!unit.trim()) {
      setStatus("Confirm the unit of analysis before saving.");
      return;
    }

    const specification: StudySpecification = {
      version: `v-${Date.now()}`,
      researchQuestions: validQuestions.map((question, index) => ({
        id: question.id || `rq${index + 1}`,
        text: question.text.trim(),
        objectiveType: question.objectiveType,
        outcomes: concepts(question.outcomes).map((concept) => ({
          concept,
          datasetVariable: null,
          variableType: null,
          mappingStatus: null
        })),
        predictors: concepts(question.predictors).map((concept) => ({
          concept,
          datasetVariable: null,
          variableType: null,
          mappingStatus: null
        })),
        covariates: concepts(question.covariates).map((concept) => ({
          concept,
          datasetVariable: null,
          variableType: null,
          mappingStatus: null
        })),
        estimand: question.estimand.trim() || null
      })),
      studyDesign: design,
      unitOfAnalysis: unit.trim(),
      repeatedMeasures,
      clustered,
      clusterVariable: clustered ? clusterVariable.trim() || null : null,
      surveyWeights,
      weightVariable: surveyWeights ? weightVariable.trim() || null : null,
      stratified,
      strataVariable: stratified ? strataVariable.trim() || null : null,
      samplingDesign: samplingDesign.trim() || null,
      missingDataPlan: missingDataPlan.trim() || null,
      statedAnalysisPlan: statedAnalysisPlan.trim() || null
    };

    setBusy(true);
    setStatus("");
    try {
      await saveStudySpecification(projectId, specification);
      setSource("saved");
      setStatus(
        `Study specification saved with ${specification.researchQuestions.length} research question${specification.researchQuestions.length === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-panel study-form">
      <div className="source-note">
        <Badge kind={source === "protocol" ? "blue" : source === "saved" ? "success" : "neutral"}>
          {source === "protocol"
            ? "Extracted from protocol"
            : source === "saved"
              ? "Saved study specification"
              : "Manual study review"}
        </Badge>
        <span>
          Review the research logic here. Dataset field names are assigned later in Variable Mapping.
        </span>
      </div>

      <div className="panel-heading">
        <div>
          <p className="eyebrow">RESEARCH QUESTIONS</p>
          <h2>{questions.length} question{questions.length === 1 ? "" : "s"}</h2>
        </div>
        <Button
          variant="secondary"
          onClick={() => setQuestions((current) => [...current, emptyQuestion()])}
        >
          Add research question
        </Button>
      </div>

      <div className="method-list">
        {questions.map((question, index) => (
          <article className="method-card" key={question.id}>
            <div className="panel-heading">
              <strong>Research question {index + 1}</strong>
              {questions.length > 1 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setQuestions((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                >
                  Remove
                </button>
              )}
            </div>
            <label>
              Question
              <textarea
                value={question.text}
                onChange={(event) => updateQuestion(index, { text: event.target.value })}
              />
            </label>
            <div className="form-grid">
              <label>
                Objective type
                <select
                  value={question.objectiveType ?? ""}
                  onChange={(event) =>
                    updateQuestion(index, {
                      objectiveType: (event.target.value || null) as ObjectiveType
                    })
                  }
                >
                  <option value="">Not confirmed</option>
                  <option value="descriptive">Descriptive</option>
                  <option value="association">Association</option>
                  <option value="prediction">Prediction</option>
                  <option value="causal">Causal</option>
                  <option value="diagnostic">Diagnostic</option>
                  <option value="prognostic">Prognostic</option>
                  <option value="exploratory">Exploratory</option>
                </select>
              </label>
              <label>
                Estimand, if stated
                <input
                  value={question.estimand}
                  onChange={(event) => updateQuestion(index, { estimand: event.target.value })}
                />
              </label>
            </div>
            <label>
              Outcome concepts
              <input
                value={question.outcomes}
                onChange={(event) => updateQuestion(index, { outcomes: event.target.value })}
                placeholder="medicine stockout status, days out of stock"
              />
            </label>
            <label>
              Predictor or exposure concepts
              <input
                value={question.predictors}
                onChange={(event) => updateQuestion(index, { predictors: event.target.value })}
                placeholder="reporting completeness"
              />
            </label>
            <label>
              Covariate concepts
              <input
                value={question.covariates}
                onChange={(event) => updateQuestion(index, { covariates: event.target.value })}
                placeholder="facility level, patient volume"
              />
            </label>
          </article>
        ))}
      </div>

      <p className="eyebrow">STUDY LEVEL DESIGN</p>
      <div className="form-grid">
        <label>
          Study design
          <select
            value={design}
            onChange={(event) =>
              setDesign(event.target.value as StudySpecification["studyDesign"])
            }
          >
            <option value="cross_sectional">Cross sectional</option>
            <option value="cohort">Cohort</option>
            <option value="case_control">Case control</option>
            <option value="trial">Trial</option>
            <option value="longitudinal">Longitudinal</option>
            <option value="time_series">Time series</option>
            <option value="ecological">Ecological</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          Unit of analysis
          <input value={unit} onChange={(event) => setUnit(event.target.value)} />
        </label>
        <label>
          Sampling design
          <input
            value={samplingDesign}
            onChange={(event) => setSamplingDesign(event.target.value)}
          />
        </label>
        <label>
          Missing data plan
          <input
            value={missingDataPlan}
            onChange={(event) => setMissingDataPlan(event.target.value)}
          />
        </label>
      </div>

      <div className="form-grid">
        <label>
          <input
            type="checkbox"
            checked={repeatedMeasures}
            onChange={(event) => setRepeatedMeasures(event.target.checked)}
          />
          Repeated observations
        </label>
        <label>
          <input
            type="checkbox"
            checked={clustered}
            onChange={(event) => setClustered(event.target.checked)}
          />
          Clustered observations
        </label>
        <label>
          <input
            type="checkbox"
            checked={surveyWeights}
            onChange={(event) => setSurveyWeights(event.target.checked)}
          />
          Survey weights
        </label>
        <label>
          <input
            type="checkbox"
            checked={stratified}
            onChange={(event) => setStratified(event.target.checked)}
          />
          Stratification
        </label>
      </div>

      {clustered && (
        <label>
          Cluster variable or concept
          <input value={clusterVariable} onChange={(event) => setClusterVariable(event.target.value)} />
        </label>
      )}
      {surveyWeights && (
        <label>
          Weight variable or concept
          <input value={weightVariable} onChange={(event) => setWeightVariable(event.target.value)} />
        </label>
      )}
      {stratified && (
        <label>
          Strata variable or concept
          <input value={strataVariable} onChange={(event) => setStrataVariable(event.target.value)} />
        </label>
      )}

      <label>
        Analysis plan stated in protocol
        <textarea
          value={statedAnalysisPlan}
          onChange={(event) => setStatedAnalysisPlan(event.target.value)}
        />
      </label>

      <div className="action-row">
        <Button onClick={() => void save()}>{busy ? "Saving…" : "Confirm study specification"}</Button>
        {source === "saved" && (
          <Button href={`/app/projects/${projectId}/variables`} variant="secondary">
            Continue to variable mapping
          </Button>
        )}
      </div>
      {status && <p className="confirmation" role="status">{status}</p>}
    </section>
  );
}

function LiveVariables({ projectId }: { projectId: string }) {
  type MappingRow = {
    researchConcept: string;
    usages: string[];
    datasetVariable?: string;
    mappingStatus: "direct_match" | "probable_match" | "uncertain" | "no_match";
    evidence: string[];
    confirmed: boolean;
  };

  const [spec, setSpec] = useState<StudySpecification | null>(null);
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [variables, setVariables] = useState<Awaited<ReturnType<typeof getVariableMappingSuggestions>>["variables"]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  function conceptKey(value: string) {
    return value.trim().toLowerCase();
  }

  function usagesForSpecification(specification: StudySpecification) {
    const map = new Map<string, { concept: string; usages: string[] }>();
    specification.researchQuestions.forEach((question, index) => {
      const roles: Array<[string, StudySpecification["researchQuestions"][number]["outcomes"]]> = [
        ["Outcome", question.outcomes],
        ["Predictor", question.predictors],
        ["Covariate", question.covariates]
      ];
      for (const [role, concepts] of roles) {
        for (const variable of concepts) {
          const key = conceptKey(variable.concept);
          const existing = map.get(key) ?? { concept: variable.concept, usages: [] };
          existing.usages.push(`RQ${index + 1} · ${role}`);
          map.set(key, existing);
        }
      }
    });
    return map;
  }

  async function loadSuggestions(specification: StudySpecification, saved: VariableMapping[]) {
    const usageMap = usagesForSpecification(specification);
    if (usageMap.size === 0) {
      setRows([]);
      setStatus("No outcome, predictor or covariate concepts are defined in the study specification.");
      return;
    }

    setBusy(true);
    try {
      const response = await getVariableMappingSuggestions(projectId);
      setVariables(response.variables);
      const suggested = new Map(
        response.suggestions.map((item) => [conceptKey(item.researchConcept), item])
      );
      const existing = new Map(saved.map((item) => [conceptKey(item.researchConcept), item]));

      setRows(
        Array.from(usageMap.values()).map(({ concept, usages }) => {
          const stored = existing.get(conceptKey(concept));
          if (stored) {
            return {
              researchConcept: concept,
              usages,
              ...(stored.datasetVariable ? { datasetVariable: stored.datasetVariable } : {}),
              mappingStatus: stored.mappingStatus,
              evidence: stored.evidence,
              confirmed: Boolean(stored.confirmedBy)
            };
          }
          const candidate = suggested.get(conceptKey(concept));
          return {
            researchConcept: concept,
            usages,
            ...(candidate?.datasetVariable ? { datasetVariable: candidate.datasetVariable } : {}),
            mappingStatus: candidate?.mappingStatus ?? "no_match",
            evidence: candidate?.evidence ?? ["No mapping suggestion is available."],
            confirmed: false
          };
        })
      );
      setStatus(
        saved.length
          ? "Saved mappings loaded. Review any unconfirmed mappings."
          : "Mapping suggestions are ready. Confirm, change, or mark each concept as not represented."
      );
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    Promise.all([getStudySpecification(projectId), getVariableMappings(projectId)])
      .then(([specification, saved]) => {
        setSpec(specification);
        if (!specification) {
          setStatus("Confirm the study specification before mapping variables.");
          return;
        }
        void loadSuggestions(specification, saved);
      })
      .catch((err) => setStatus(message(err)));
  }, [projectId]);

  function updateRow(index: number, patch: Partial<MappingRow>) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row
      )
    );
  }

  async function confirmMappings() {
    if (!spec || rows.length === 0) return;
    setBusy(true);
    setStatus("");
    try {
      await saveVariableMappings(
        projectId,
        rows.map((row) => ({
          id: `map_${simpleHash(conceptKey(row.researchConcept))}`,
          researchConcept: row.researchConcept,
          ...(row.datasetVariable ? { datasetVariable: row.datasetVariable } : {}),
          mappingStatus: row.datasetVariable ? row.mappingStatus : "no_match",
          evidence: row.evidence,
          confirmed: true
        }))
      );
      setRows((current) => current.map((row) => ({ ...row, confirmed: true })));
      setStatus("Reviewed variable mappings saved and confirmed.");
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  function variableSummary(variableName?: string) {
    if (!variableName) return "Not represented";
    const variable = variables.find((item) => item.variableName === variableName);
    if (!variable) return variableName;
    const range = variable.range
      ? ` · ${variable.range.min} to ${variable.range.max}`
      : variable.responseChoices?.length
        ? ` · ${variable.responseChoices.map((choice) => choice.label).join(", ")}`
        : "";
    return `${variable.dataType.replaceAll("_", " ")}${range}`;
  }

  function humanStatus(value: MappingRow["mappingStatus"]) {
    return value.replaceAll("_", " ").replace(/^./, (character) => character.toUpperCase());
  }

  return (
    <section className="panel table-wrap">
      <div className="panel-heading">
        <div>
          <h2>Variable mappings</h2>
          <p className="muted">
            Research concepts come from the study specification. Dataset variables come from the profiled analysis data.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            spec
              ? void Promise.all([getVariableMappings(projectId)]).then(([saved]) =>
                  loadSuggestions(spec, saved)
                )
              : undefined
          }
        >
          Refresh suggestions
        </Button>
      </div>

      {rows.length > 0 ? (
        <>
          <table>
            <thead>
              <tr>
                <th>Research concept</th>
                <th>Used in</th>
                <th>Dataset variable</th>
                <th>Observed metadata</th>
                <th>Status</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.researchConcept}>
                  <td>
                    <strong>{row.researchConcept}</strong>
                    {row.confirmed && <><br /><Badge kind="success">Confirmed</Badge></>}
                  </td>
                  <td>{row.usages.join("; ")}</td>
                  <td>
                    <select
                      value={row.datasetVariable ?? ""}
                      onChange={(event) => {
                        const selected = event.target.value;
                        updateRow(index, selected
                          ? {
                              datasetVariable: selected,
                              mappingStatus:
                                row.datasetVariable === selected
                                  ? row.mappingStatus
                                  : "uncertain",
                              evidence:
                                row.datasetVariable === selected
                                  ? row.evidence
                                  : ["Researcher selected this dataset variable during mapping review."],
                              confirmed: false
                            }
                          : {
                              datasetVariable: undefined,
                              mappingStatus: "no_match",
                              evidence: ["Researcher marked this concept as not represented in the dataset."],
                              confirmed: false
                            });
                      }}
                    >
                      <option value="">Not represented</option>
                      {variables.map((variable) => (
                        <option key={variable.variableName} value={variable.variableName}>
                          {variable.variableName}
                          {variable.label && variable.label !== variable.variableName
                            ? ` · ${variable.label}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{variableSummary(row.datasetVariable)}</td>
                  <td>
                    <Badge
                      kind={
                        row.mappingStatus === "direct_match"
                          ? "success"
                          : row.mappingStatus === "probable_match"
                            ? "blue"
                            : "warning"
                      }
                    >
                      {humanStatus(row.mappingStatus)}
                    </Badge>
                  </td>
                  <td>{row.evidence.join(" ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            Direct match is reserved for exact metadata evidence. Semantic suggestions remain probable or uncertain until you confirm them.
          </p>
          <Button onClick={() => void confirmMappings()}>
            {busy ? "Working…" : "Confirm reviewed mappings"}
          </Button>
        </>
      ) : (
        <p className="muted">
          {busy ? "Preparing mapping suggestions…" : "No mappings are available yet."}
        </p>
      )}
      {rows.length > 0 && rows.every((row) => row.confirmed) && (
        <div className="action-row">
          <Button href={`/app/projects/${projectId}/analysis-plan`}>
            Continue to analysis plan
          </Button>
        </div>
      )}
      {status && <p className="confirmation" role="status">{status}</p>}
    </section>
  );
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function LiveAnalysisPlan({ projectId }: { projectId: string }) {
  const [selections, setSelections] = useState<CandidateSelection[]>([]);
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [spec, setSpec] = useState<StudySpecification | null>(null);
  const [mappings, setMappings] = useState<VariableMapping[]>([]);
  const [plan, setPlan] = useState<AnalysisPlan | null>(null);
  const [selectedMethods, setSelectedMethods] = useState<Record<string, string>>({});
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [candidateResponse, ds, existing, specification, savedMappings] =
      await Promise.all([
        getMethodCandidates(projectId),
        getDatasets(projectId),
        getAnalysisPlan(projectId),
        getStudySpecification(projectId),
        getVariableMappings(projectId)
      ]);

    setSelections(candidateResponse.selections);
    setDatasets(ds);
    setPlan(existing);
    setSpec(specification);
    setMappings(savedMappings);

    const preferred =
      existing?.datasetVersionId ??
      ds.find((dataset) => dataset.sourceKind === "derived")?.id ??
      ds[0]?.id ??
      "";
    setSelectedDatasetId(preferred);

    setSelectedMethods((current) => {
      const next = { ...current };
      for (const selection of candidateResponse.selections) {
        if (!next[selection.questionId]) {
          const executable = selection.candidates.find((candidate) => candidate.executable);
          if (executable) next[selection.questionId] = executable.methodId;
        }
      }
      return next;
    });
  }

  useEffect(() => {
    void refresh().catch((err) => setStatus(message(err)));
  }, [projectId]);

  function mappingFor(concept: string) {
    const key = concept.trim().toLowerCase();
    return mappings.find(
      (mapping) =>
        mapping.researchConcept.trim().toLowerCase() === key &&
        Boolean(mapping.confirmedBy)
    );
  }

  function resolvedVariables(question: StudySpecification["researchQuestions"][number]) {
    const outcome = question.outcomes
      .map((item) => mappingFor(item.concept)?.datasetVariable)
      .find(Boolean);
    const predictors = question.predictors.flatMap((item) => {
      const value = mappingFor(item.concept)?.datasetVariable;
      return value ? [value] : [];
    });
    const covariates = question.covariates.flatMap((item) => {
      const value = mappingFor(item.concept)?.datasetVariable;
      return value ? [value] : [];
    });
    return { outcome, predictors, covariates };
  }

  async function createPlan() {
    if (!spec) {
      setStatus("Confirm the study specification before creating an analysis plan.");
      return;
    }
    if (!selectedDatasetId) {
      setStatus("Upload and select a dataset before creating an analysis plan.");
      return;
    }

    const analyses = selections.flatMap((selection, index) => {
      const question = spec.researchQuestions.find(
        (item) => item.id === selection.questionId
      );
      const selectedMethodId = selectedMethods[selection.questionId];
      const candidate = selection.candidates.find(
        (item) => item.methodId === selectedMethodId
      );
      if (!question || !selectedMethodId || !candidate?.executable) return [];
      const resolved = resolvedVariables(question);
      if (!resolved.outcome) return [];

      return [
        {
          id: `analysis-${index + 1}`,
          researchQuestionId: question.id,
          outcome: resolved.outcome,
          predictors: resolved.predictors,
          covariates: resolved.covariates,
          candidateMethodIds: selection.candidates.map((item) => item.methodId),
          selectedMethodId,
          requiredDecisions: candidate.decisionRequired
            ? [candidate.decisionRequired]
            : [],
          warnings: selection.warnings,
          diagnostics: candidate.requiredChecks,
          addedAfterLock: false
        }
      ];
    });

    if (analyses.length === 0) {
      setStatus(
        "No research question is ready for an executable analysis. Review mappings and method blockers below."
      );
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      const created = await createAnalysisPlan(projectId, {
        versionId: `plan-${Date.now()}`,
        datasetVersionId: selectedDatasetId,
        status: "planned_before_analysis",
        analyses
      });
      setPlan(created);
      setStatus(
        `Analysis plan created with ${created.analyses.length} planned analysis${created.analyses.length === 1 ? "" : "es"}.`
      );
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    if (!plan) return;
    setBusy(true);
    try {
      const locked = await lockAnalysisPlan(projectId, plan.id);
      setPlan(locked);
      setStatus("Analysis plan locked. Planned analyses are now distinguished from later exploratory work.");
    } catch (err) {
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ANALYSIS DATASET</p>
          <h2>Build analysis plan</h2>
        </div>
        {plan && (
          <Badge kind={plan.lockedAt ? "success" : "blue"}>
            {plan.lockedAt ? "Locked" : "Draft"}
          </Badge>
        )}
      </div>

      <label>
        Dataset version
        <select
          value={selectedDatasetId}
          disabled={Boolean(plan)}
          onChange={(event) => setSelectedDatasetId(event.target.value)}
        >
          <option value="">Select dataset</option>
          {datasets.map((dataset) => (
            <option key={dataset.id} value={dataset.id}>
              {dataset.label} · {dataset.sourceKind}
            </option>
          ))}
        </select>
      </label>
      <p className="muted">
        Methodome prefers the newest derived dataset when one exists. You can change the selection before the plan is created.
      </p>

      <div className="method-list">
        {selections.map((selection, index) => {
          const question = spec?.researchQuestions.find(
            (item) => item.id === selection.questionId
          );
          const resolved = question ? resolvedVariables(question) : null;
          const mappingBlocker =
            question && !resolved?.outcome
              ? "The outcome concept does not have a confirmed dataset mapping."
              : null;
          return (
            <article className="method-card" key={selection.questionId}>
              <p className="eyebrow">RESEARCH QUESTION {index + 1}</p>
              <h3>{question?.text ?? selection.questionId}</h3>
              {resolved?.outcome && (
                <p>
                  <b>Outcome:</b> <code>{resolved.outcome}</code>
                  {resolved.predictors.length > 0 && (
                    <> · <b>Predictors:</b> <code>{resolved.predictors.join(", ")}</code></>
                  )}
                </p>
              )}

              {(mappingBlocker || selection.blockedReason) && (
                <div className="warning-panel">
                  <b>Needs review</b>
                  <p>{mappingBlocker ?? selection.blockedReason}</p>
                </div>
              )}

              {selection.warnings.map((warning) => (
                <p className="muted" key={warning}>{warning}</p>
              ))}

              {selection.candidates.map((candidate) => (
                <label className="candidate" key={candidate.methodId}>
                  <input
                    type="radio"
                    name={`candidate-${selection.questionId}`}
                    checked={selectedMethods[selection.questionId] === candidate.methodId}
                    disabled={!candidate.executable || Boolean(plan)}
                    onChange={() =>
                      setSelectedMethods((current) => ({
                        ...current,
                        [selection.questionId]: candidate.methodId
                      }))
                    }
                  />
                  <span>
                    <b>{candidate.displayName}</b>
                    <small>{candidate.rationale}</small>
                    {candidate.decisionRequired && <small>{candidate.decisionRequired}</small>}
                  </span>
                  <Badge kind={candidate.executable ? "success" : "warning"}>
                    {candidate.executable ? candidate.maturity : "Execution pending"}
                  </Badge>
                </label>
              ))}
            </article>
          );
        })}
      </div>

      {!plan ? (
        <Button onClick={() => void createPlan()}>
          {busy ? "Creating…" : "Create analysis plan"}
        </Button>
      ) : (
        <div className="action-row">
          <span>
            {plan.analyses.length} planned analysis{plan.analyses.length === 1 ? "" : "es"}
          </span>
          {!plan.lockedAt && (
            <Button onClick={() => void lock()}>
              {busy ? "Locking…" : "Lock analysis plan"}
            </Button>
          )}
          {plan.lockedAt && (
            <Button href={`/app/projects/${projectId}/analysis`}>
              Run analyses
            </Button>
          )}
        </div>
      )}
      {plan?.lockHash && (
        <p className="muted">
          SHA-256 plan hash: <code>{plan.lockHash}</code>
        </p>
      )}
      {status && <p className="confirmation" role="status">{status}</p>}
    </section>
  );
}

function LiveAnalysis({ projectId }: { projectId: string }) {
  const [plan, setPlan] = useState<AnalysisPlan | null>(null);
  const [jobs, setJobs] = useState<Record<string, { jobId: string; state: string }>>({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    getAnalysisPlan(projectId).then(setPlan).catch((err) => setStatus(message(err)));
    try {
      const stored = localStorage.getItem(`methodome:jobs:${projectId}`);
      if (stored) setJobs(JSON.parse(stored));
    } catch {
      // Ignore invalid local job cache.
    }
  }, [projectId]);

  function persist(next: Record<string, { jobId: string; state: string }>) {
    setJobs(next);
    localStorage.setItem(`methodome:jobs:${projectId}`, JSON.stringify(next));
  }

  async function run(analysis: AnalysisPlan["analyses"][number]) {
    if (!plan?.datasetVersionId || !analysis.selectedMethodId) {
      setStatus("A dataset and selected method are required in the analysis plan.");
      return;
    }
    if (!plan.lockedAt) {
      setStatus("Lock the analysis plan before running planned analyses.");
      return;
    }

    setStatus("");
    try {
      const created = await createAnalysisJob(projectId, {
        datasetVersionId: plan.datasetVersionId,
        analysisPlanId: plan.id,
        methodId: analysis.selectedMethodId,
        outcome: analysis.outcome,
        predictors: analysis.predictors,
        covariates: analysis.covariates
      });
      let next = {
        ...jobs,
        [analysis.id]: { jobId: created.jobId, state: created.state }
      };
      persist(next);
      localStorage.setItem(`methodome:last-job:${projectId}`, created.jobId);

      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const current = await getAnalysisJob(created.jobId);
        next = {
          ...next,
          [analysis.id]: { jobId: created.jobId, state: current.state }
        };
        persist(next);
        if (
          current.state === "complete" ||
          current.state === "failed" ||
          current.state === "cancelled"
        ) {
          break;
        }
      }
    } catch (err) {
      setStatus(message(err));
    }
  }

  if (!plan) {
    return (
      <section className="panel">
        <h2>No analysis plan yet</h2>
        <p>Build and lock an analysis plan before running guided analyses.</p>
        <Button href={`/app/projects/${projectId}/analysis-plan`}>Build analysis plan</Button>
        {status && <p className="confirmation" role="status">{status}</p>}
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">DETERMINISTIC EXECUTION</p>
          <h2>Run approved analyses</h2>
        </div>
        <Badge kind={plan.lockedAt ? "success" : "warning"}>
          {plan.lockedAt ? "Plan locked" : "Plan not locked"}
        </Badge>
      </div>
      <p>
        Each analysis below comes from the current analysis plan. Statistical values are calculated by the statistical Worker, not by the language model.
      </p>

      <div className="method-list">
        {plan.analyses.map((analysis, index) => {
          const job = jobs[analysis.id];
          const running =
            job &&
            !["complete", "failed", "cancelled"].includes(job.state);
          return (
            <article className="method-card" key={analysis.id}>
              <p className="eyebrow">PLANNED ANALYSIS {index + 1}</p>
              <h3>{analysis.selectedMethodId?.replaceAll("_", " ") ?? "Method not selected"}</h3>
              <p>
                <b>Outcome:</b> <code>{analysis.outcome}</code>
              </p>
              {analysis.predictors.length > 0 && (
                <p>
                  <b>Predictors:</b> <code>{analysis.predictors.join(", ")}</code>
                </p>
              )}
              {analysis.covariates.length > 0 && (
                <p>
                  <b>Covariates:</b> <code>{analysis.covariates.join(", ")}</code>
                </p>
              )}
              {analysis.warnings.map((warning) => (
                <p className="muted" key={warning}>{warning}</p>
              ))}
              <div className="action-row">
                <Button
                  onClick={() => void run(analysis)}
                >
                  {running
                    ? "Running…"
                    : job?.state === "complete"
                      ? "Run again"
                      : "Run analysis"}
                </Button>
                {job && (
                  <Badge
                    kind={
                      job.state === "complete"
                        ? "success"
                        : job.state === "failed"
                          ? "danger"
                          : "blue"
                    }
                  >
                    {job.state.replaceAll("_", " ")}
                  </Badge>
                )}
              </div>
              {job?.jobId && <code>{job.jobId}</code>}
            </article>
          );
        })}
      </div>

      {Object.values(jobs).some((job) => job.state === "complete") && (
        <Button href={`/app/projects/${projectId}/results`} variant="secondary">
          View results
        </Button>
      )}
      {status && <p className="confirmation" role="status">{status}</p>}
    </section>
  );
}

function LiveResults({ projectId }: { projectId: string }) {
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [status, setStatus] = useState("Loading results…");

  useEffect(() => {
    getAnalysisHistory()
      .then(async (history) => {
        const completeJobs = history.filter(
          (item) =>
            String(item.projectId ?? "") === projectId &&
            String(item.state ?? "") === "complete"
        );
        if (completeJobs.length === 0) {
          setResults([]);
          setStatus("No completed analyses are available for this project.");
          return;
        }
        const loaded = await Promise.all(
          completeJobs.map((item) => getAnalysisResult(String(item.jobId)))
        );
        setResults(loaded);
        setStatus("");
      })
      .catch((err) => setStatus(message(err)));
  }, [projectId]);

  if (results.length === 0) {
    return (
      <section className="panel">
        <h2>Analysis results</h2>
        <p>{status}</p>
        <Button href={`/app/projects/${projectId}/analysis`} variant="secondary">
          Go to analysis
        </Button>
      </section>
    );
  }

  return (
    <div className="method-list">
      {results.map((result, resultIndex) => (
        <section className="panel" key={result.jobId}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RESULT {resultIndex + 1}</p>
              <h2>{result.methodId.replaceAll("_", " ")}</h2>
            </div>
            <Badge kind="success">{result.software.engine}</Badge>
          </div>
          <div className="spec-grid">
            <div><span>Complete observations</span><strong>{result.n}</strong></div>
            <div><span>Engine</span><strong>{result.software.engine}</strong></div>
            <div><span>Package</span><strong>{result.software.package}</strong></div>
            <div><span>Version</span><strong>{result.software.packageVersion}</strong></div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Estimate</th>
                  <th>SE</th>
                  <th>95% CI</th>
                  <th>p</th>
                  <th>Exponentiated</th>
                </tr>
              </thead>
              <tbody>
                {result.estimates.map((estimate) => (
                  <tr key={estimate.term}>
                    <td>{estimate.term}</td>
                    <td>{estimate.estimate.toPrecision(5)}</td>
                    <td>{estimate.standardError?.toPrecision(5) ?? "—"}</td>
                    <td>
                      {estimate.confidenceInterval
                        ? `${estimate.confidenceInterval.lower.toPrecision(4)} to ${estimate.confidenceInterval.upper.toPrecision(4)}`
                        : "—"}
                    </td>
                    <td>{estimate.pValue != null ? estimate.pValue.toPrecision(4) : "—"}</td>
                    <td>{estimate.exponentiatedEstimate?.toPrecision(5) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Diagnostics</h3>
          <div className="method-list">
            {result.diagnostics.map((diagnostic) => (
              <div className="method-card" key={diagnostic.id}>
                <Badge
                  kind={
                    diagnostic.status === "passed"
                      ? "success"
                      : diagnostic.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {diagnostic.status.replaceAll("_", " ")}
                </Badge>
                <strong>{diagnostic.label}</strong>
                {diagnostic.value != null && <p>{String(diagnostic.value)}</p>}
                {diagnostic.message && <small>{diagnostic.message}</small>}
              </div>
            ))}
          </div>

          {result.warnings.length > 0 && (
            <div className="warning-panel">
              <b>Warnings</b>
              {result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          )}
          <p className="muted">
            Job <code>{result.jobId}</code>. Executed with {result.software.package} {result.software.packageVersion}.
          </p>
        </section>
      ))}
      <Button href={`/app/projects/${projectId}/reports`} variant="secondary">
        Continue to reports
      </Button>
      {status && <p className="confirmation" role="status">{status}</p>}
    </div>
  );
}

function LiveProjectSettings({ projectId }: { projectId: string }) {
  const [dataClass, setDataClass] = useState<"public" | "restricted" | "identifiable">("restricted");
  const [identifiable, setIdentifiable] = useState(false);
  const [ethicsReference, setEthicsReference] = useState("");
  const [externalModelAllowed, setExternalModelAllowed] = useState(false);
  const [qualitativeExternalAllowed, setQualitativeExternalAllowed] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    getProjectPolicy(projectId)
      .then((policy) => {
        if (!policy) return;
        const nextClass = String(policy.dataClass ?? "restricted");
        if (nextClass === "public" || nextClass === "restricted" || nextClass === "identifiable") {
          setDataClass(nextClass);
        }
        setIdentifiable(Boolean(policy.containsIdentifiableData));
        setEthicsReference(String(policy.ethicsApprovalReference ?? ""));
        setExternalModelAllowed(Boolean(policy.externalModelAllowed));
        setQualitativeExternalAllowed(Boolean(policy.qualitativeTextExternalAllowed));
      })
      .catch((err) => setStatus(message(err)));
  }, [projectId]);

  async function save() {
    setStatus("");
    try {
      await updateProjectPolicy(projectId, {
        dataClass,
        containsIdentifiableData: identifiable,
        ...(ethicsReference ? { ethicsApprovalReference: ethicsReference } : {}),
        allowedProcessors: [],
        externalModelAllowed,
        qualitativeTextExternalAllowed: qualitativeExternalAllowed,
        rowLevelQuantitativeExternalAllowed: false,
        exportRestrictions: []
      });
      setStatus("Project processing policy saved.");
    } catch (err) {
      setStatus(message(err));
    }
  }

  return (
    <section className="form-panel">
      <p className="eyebrow">PROCESSING POLICY</p>
      <h2>Project data controls</h2>
      <p className="muted">These settings are enforced by the backend before model processing is allowed.</p>
      <div className="form-grid">
        <label>
          Data class
          <select value={dataClass} onChange={(event) => setDataClass(event.target.value as typeof dataClass)}>
            <option value="public">Public</option>
            <option value="restricted">Restricted</option>
            <option value="identifiable">Identifiable</option>
          </select>
        </label>
        <label>
          Ethics approval reference
          <input value={ethicsReference} onChange={(event) => setEthicsReference(event.target.value)} />
        </label>
      </div>
      <label>
        <input type="checkbox" checked={identifiable} onChange={(event) => setIdentifiable(event.target.checked)} />
        Project contains identifiable data
      </label>
      <label>
        <input type="checkbox" checked={externalModelAllowed} onChange={(event) => setExternalModelAllowed(event.target.checked)} />
        Allow approved external model processing
      </label>
      <label>
        <input type="checkbox" checked={qualitativeExternalAllowed} onChange={(event) => setQualitativeExternalAllowed(event.target.checked)} />
        Allow approved external processing of qualitative text
      </label>
      <Button onClick={() => void save()}>Save project policy</Button>
      {status && <p className="confirmation" role="status">{status}</p>}
    </section>
  );
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function LiveReports({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const jobId = localStorage.getItem(`methodome:last-job:${projectId}`);
    const requests: Promise<unknown>[] = [
      getAuditTrail(projectId).then(setAudit)
    ];
    if (jobId) {
      requests.push(
        getAnalysisResult(jobId)
          .then(setResult)
          .catch(() => undefined)
      );
    }
    Promise.all(requests).catch((err) => setStatus(message(err)));
  }, [projectId]);

  return (
    <>
      <section className="panel">
        <p className="eyebrow">REPRODUCIBILITY EXPORTS</p>
        <h2>Current project evidence</h2>
        <p>
          Export the structured statistical result and audit trail exactly as stored by Methodome.
        </p>
        <div className="action-row">
          <Button
            variant="secondary"
            onClick={() => result && downloadJson(`methodome-${projectId}-result.json`, result)}
          >
            Download result JSON
          </Button>
          <Button
            variant="secondary"
            onClick={() => downloadJson(`methodome-${projectId}-audit.json`, audit)}
          >
            Download audit JSON
          </Button>
        </div>
        {!result && <p className="muted">Run an analysis before exporting a result.</p>}
        {status && <p className="confirmation" role="status">{status}</p>}
      </section>

      <section className="panel">
        <p className="eyebrow">REPORT GENERATION</p>
        <h2>Publication formats</h2>
        <p className="muted">
          DOCX, PDF, HTML, LaTeX, publication tables and figure bundles remain outside the current executable release. Methodome will not fabricate those exports until the report builder is implemented and validated.
        </p>
      </section>
    </>
  );
}

function LiveAudit({ projectId }: { projectId: string }) {
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    getAuditTrail(projectId).then(setEvents).catch(() => setEvents([]));
  }, [projectId]);

  return (
    <section className="panel table-wrap">
      <table>
        <thead><tr><th>Time</th><th>Action</th><th>Object</th><th>User</th></tr></thead>
        <tbody>
          {events.map((event, index) => (
            <tr key={String(event.id ?? index)}>
              <td>{String(event.timestamp ?? "")}</td>
              <td>{String(event.action ?? "")}</td>
              <td>{String(event.objectType ?? "")}</td>
              <td>{String(event.userId ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export async function performSignOut() {
  await signOut();
  window.location.href = "/sign-in";
}


export function LiveMethodsPage() {
  const [methods, setMethods] = useState<MethodRegistryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading method registry…");

  useEffect(() => {
    getMethods()
      .then((response) => {
        setMethods(response.methods);
        setStatus("");
      })
      .catch(() => setStatus("Methodome could not load the method registry."));
  }, []);

  const visible = methods.filter((method) =>
    method.displayName.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <main className="app-content">
      <PageHeader
        eyebrow="METHODS LIBRARY"
        title="Methods library"
        description="The live registry shows method maturity, execution status and required diagnostics."
      />
      <div className="catalogue-tools">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search methods"
          aria-label="Search methods"
        />
      </div>
      {status && <p className="muted">{status}</p>}
      <div className="method-list">
        {visible.map((method) => (
          <article className="method-card" key={method.id}>
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
                  {method.maturity.replace(/^./, (character) => character.toUpperCase())}
                </Badge>
                <Badge kind={method.executable ? "teal" : "neutral"}>
                  {method.executable ? "Executable" : "Execution pending"}
                </Badge>
              </div>
              <h3>{method.displayName}</h3>
              <p className="muted">{method.family.replaceAll("_", " ")}</p>
              <small>
                Diagnostics: {method.diagnostics.length ? method.diagnostics.join(", ") : "None listed"}
              </small>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

export function LiveHistoryPage() {
  const [analyses, setAnalyses] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    getAnalysisHistory().then(setAnalyses).catch(() => setAnalyses([]));
  }, []);

  return (
    <main className="app-content">
      <PageHeader
        eyebrow="ANALYSIS HISTORY"
        title="Analysis history"
        description="Every submitted analysis job is tied to a project and dataset version."
      />
      <section className="panel table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Project</th><th>Method</th><th>Dataset</th><th>Status</th></tr></thead>
          <tbody>
            {analyses.map((analysis, index) => (
              <tr key={String(analysis.jobId ?? index)}>
                <td>{String(analysis.createdAt ?? "")}</td>
                <td>{String(analysis.projectName ?? "")}</td>
                <td>{String(analysis.methodId ?? "").replaceAll("_", " ")}</td>
                <td><code>{String(analysis.datasetVersionId ?? "")}</code></td>
                <td>{String(analysis.state ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

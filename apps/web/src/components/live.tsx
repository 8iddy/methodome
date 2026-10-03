"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActivitySpinner, Badge, Button, PageHeader, ThemeToggle } from "@/components/ui";
import { ResearchAnalysisSurface, ResearchSectionContext } from "@/components/research-workspace";
import { ConversationWorkspace } from "@/components/conversation-workspace";
import {
  AnalysisWorkbench,
  AuditWorkbench,
  ReportsWorkbench,
  ResultsWorkbench,
  SourcesWorkbench,
  VariablesWorkbench
} from "@/components/workbenches";
import {
  MethodomeApiError,
  appendDatasets,
  compareDatasetSchemas,
  createProject,
  createUpload,
  verifyEmailOtp,
  resendEmailVerificationOtp,
  getAuthConfig,
  getAnalysisPlan,
  getProtocolExtraction,
  extractProtocol,
  getDatasets,
  getDatasetProfile,
  getMethods,
  getAnalysisHistory,
  getProject,
  getProjectFiles,
  getProjectPolicy,
  getProjects,
  getSession,
  getStudySpecification,
  registerDataset,
  saveStudySpecification,
  signIn,
  signUp,
  updateProjectPolicy,
  uploadFile,
  type AnalysisPlan,
  type MethodRegistryEntry,
  type BackendProject,
  type DatasetVersion,
  type ProjectFile,
  type ProtocolExtraction,
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
          <Button type="submit" loading={busy} loadingLabel="Verifying…">Verify email</Button>
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

          <Button
            type="submit"
            loading={busy}
            loadingLabel={signup ? "Creating account…" : "Signing in…"}
          >
            {signup ? "Create account" : "Sign in"}
          </Button>
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
        <Button type="submit" loading={busy} loadingLabel="Creating project…">Create project</Button>
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

  if (section === "overview") {
    return (
      <main className="app-content workspace-page">
        <ConversationWorkspace projectId={projectId} project={project} />
      </main>
    );
  }

  const sectionDescriptions: Record<string, [string, string]> = {
    protocol: ["Protocol", "Source material and extracted study information."],
    instruments: ["Instruments", "Questionnaires and codebooks used as mapping evidence."],
    data: ["Data", "Source datasets, versions and schema relationships."],
    "data-preparation": ["Data preparation", "Dataset structure, quality issues and derived versions."],
    "study-design": ["Study design", "Research questions and design facts that constrain analysis."],
    variables: ["Variable mapping", "Evidence linking research concepts to observed dataset fields."],
    "analysis-plan": ["Analysis plan", "Candidate methods, selected methods and plan lock."],
    analysis: ["Analysis", "Statistical execution, and qualitative codebook, coding and theme review."],
    results: ["Results", "Estimates, diagnostics, warnings and execution records."],
    reports: ["Reports", "Research outputs and reproducibility files."],
    "audit-trail": ["Audit record", "Versioned project actions and research decisions."],
    settings: ["Project settings", "Data policy, ethics reference and model-processing controls."]
  };
  const [title, description] = sectionDescriptions[section] ?? [
    section.replaceAll("-", " "),
    "Inspect this project record."
  ];

  return (
    <main className="app-content review-page">
      <div className="review-backline">
        <a href={`/app/projects/${projectId}/overview`}>← Research workspace</a>
        <span>{project?.name ?? "Methodome project"}</span>
      </div>
      <PageHeader
        eyebrow="REVIEW SURFACE"
        title={title}
        description={description}
      />
      <ResearchSectionContext projectId={projectId} section={section} />
      {section === "protocol" && <LiveProjectFiles projectId={projectId} mode="protocol" />}
      {section === "instruments" && <LiveProjectFiles projectId={projectId} mode="instruments" />}
      {section === "data" && (
        <>
          <SourcesWorkbench projectId={projectId} />
          <LiveData projectId={projectId} />
        </>
      )}
      {section === "data-preparation" && <LiveDataPreparation projectId={projectId} />}
      {section === "study-design" && <LiveStudyDesign projectId={projectId} />}
      {section === "variables" && <VariablesWorkbench projectId={projectId} />}
      {section === "analysis-plan" && <LiveAnalysisPlan projectId={projectId} />}
      {section === "analysis" && (
        <ResearchAnalysisSurface
          projectId={projectId}
          fallback={<AnalysisWorkbench projectId={projectId} />}
        />
      )}
      {section === "results" && <ResultsWorkbench projectId={projectId} />}
      {section === "reports" && <ReportsWorkbench projectId={projectId} />}
      {section === "audit-trail" && <AuditWorkbench projectId={projectId} />}
      {section === "settings" && <LiveProjectSettings projectId={projectId} />}
    </main>
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
  const [activity, setActivity] = useState<
    | "idle"
    | "preparing"
    | "uploading"
    | "extracting"
    | "complete"
    | "upload_error"
    | "extraction_error"
  >("idle");
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
    setActivity("preparing");
    setStatus("");
    try {
      const intent = await createUpload(projectId, {
        filename: file.name,
        mediaType: file.type || "application/octet-stream",
        fileKind: kind,
        sizeBytes: file.size
      });

      setActivity("uploading");
      await uploadFile(intent.uploadPath, file, file.type || "application/octet-stream");
      setFile(null);

      if (mode === "protocol") {
        setActivity("extracting");
        setStatus("Protocol uploaded. Methodome is extracting the study now.");
        try {
          const extracted = await extractProtocol(projectId, intent.fileId);
          setExtraction(extracted);
          setActivity("complete");
          setStatus(
            `Protocol uploaded and study information extracted. Methodome found ${extracted.researchQuestions.length} research question${extracted.researchQuestions.length === 1 ? "" : "s"}.`
          );
        } catch (err) {
          setActivity("extraction_error");
          setStatus(
            `The protocol upload completed, but study extraction needs attention: ${message(err)}`
          );
        }
      } else {
        setActivity("complete");
        setStatus("Research file uploaded.");
      }
      await refresh();
    } catch (err) {
      setActivity("upload_error");
      setStatus(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function reExtract() {
    const latest = files[0];
    if (!latest) return;
    setBusy(true);
    setActivity("extracting");
    setStatus("Extracting study information…");
    try {
      const extracted = await extractProtocol(projectId, latest.id);
      setExtraction(extracted);
      setActivity("complete");
      setStatus("Study information extracted from the latest protocol.");
    } catch (err) {
      setActivity("extraction_error");
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
        <Button
          onClick={() => void upload()}
          loading={busy}
          loadingLabel={
            activity === "uploading"
              ? "Uploading…"
              : activity === "extracting"
                ? "Extracting…"
                : "Preparing…"
          }
          disabled={!file && !busy}
        >
          Upload file
        </Button>
        {mode === "protocol" && files.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => void reExtract()}
            loading={busy && activity === "extracting"}
            loadingLabel="Extracting…"
          >
            Re-extract latest protocol
          </Button>
        )}
        {activity !== "idle" && (
          <div className="activity-flow" aria-live="polite">
            <div className={activity === "upload_error" ? "activity-step error" : "activity-step"}>
              {activity === "preparing" || activity === "uploading" ? (
                <ActivitySpinner label="Uploading research file" />
              ) : activity === "upload_error" ? (
                <span className="activity-step-mark error">!</span>
              ) : (
                <span className="activity-step-mark complete">✓</span>
              )}
              <span>
                <b>Upload research file</b>
                <small>
                  {activity === "preparing"
                    ? "Preparing secure storage"
                    : activity === "uploading"
                      ? "Uploading to Methodome"
                      : "Upload complete"}
                </small>
              </span>
            </div>
            {mode === "protocol" && (
              <div className={`activity-step ${activity === "extraction_error" ? "error" : ""}`}>
                {activity === "extracting" ? (
                  <ActivitySpinner label="Extracting study information" />
                ) : activity === "complete" ? (
                  <span className="activity-step-mark complete">✓</span>
                ) : activity === "extraction_error" ? (
                  <span className="activity-step-mark error">!</span>
                ) : (
                  <span className="activity-step-mark">2</span>
                )}
                <span>
                  <b>Extract study information</b>
                  <small>
                    {activity === "extracting"
                      ? "Reading research questions, objectives and study design"
                      : activity === "complete"
                        ? "Extraction complete"
                        : activity === "extraction_error"
                          ? "Extraction needs attention"
                          : "Starts automatically after upload"}
                  </small>
                </span>
              </div>
            )}
          </div>
        )}
        {status && <p className="confirmation" role="status">{status}</p>}
        {mode === "instruments" && (
          <div className="action-row">
            {files.length > 0 ? (
              <Button href={`/app/projects/${projectId}/data`}>
                Continue to data
              </Button>
            ) : (
              <Button href={`/app/projects/${projectId}/data`} variant="quiet">
                Continue without an instrument
              </Button>
            )}
          </div>
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
            This is Methodome’s reading of the protocol. Correct anything that is wrong in the study design; approving the analysis plan confirms the interpretation it is built on.
          </p>
          <div className="action-row">
            <Button href={`/app/projects/${projectId}/instruments`}>
              Continue to instruments
            </Button>
            <Button href={`/app/projects/${projectId}/study-design`} variant="quiet">
              Review study information now
            </Button>
          </div>
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
        // Interpretation is the orchestrator's job, done once in the
        // conversation. This screen only shows and corrects what exists.
        const activeExtraction = extraction;
        const latestProtocol = files.find((item) => item.fileKind === "protocol");
        if (!specification && !activeExtraction) {
          setStatus(
            latestProtocol
              ? "Methodome has not interpreted the protocol yet. It does that in the conversation; you can also describe the study here by hand."
              : "No protocol has been handed over yet. Attach it in the conversation, or describe the study here by hand."
          );
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

      <div className="study-question-list">
        {questions.map((question, index) => (
          <article className="study-question-card" key={question.id}>
            <div className="study-question-header">
              <div>
                <p className="eyebrow">RESEARCH QUESTION {index + 1}</p>
                <h3>Question {index + 1}</h3>
              </div>
              <div className="study-question-actions">
                {source === "protocol" && <Badge kind="teal">Methodome suggested</Badge>}
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
            </div>

            <label className="question-field">
              <span>Research question</span>
              <textarea
                value={question.text}
                onChange={(event) => updateQuestion(index, { text: event.target.value })}
              />
            </label>

            <div className="question-meta-grid">
              <label>
                <span>Objective type</span>
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
                  <option value="qualitative">Qualitative</option>
                  <option value="exploratory">Exploratory</option>
                </select>
                <small className="field-hint">
                  Methodome classifies this from the question and protocol. Change it only if the analytical intent is different.
                </small>
              </label>

              <label>
                <span>Estimand or target quantity</span>
                <input
                  value={question.estimand}
                  onChange={(event) => updateQuestion(index, { estimand: event.target.value })}
                  placeholder="Filled when the protocol supports a specific target quantity"
                />
                <small className="field-hint">
                  Left blank when the protocol does not support a defensible estimand.
                </small>
              </label>
            </div>

            <div className="concept-grid">
              <label>
                <span>Outcome concepts</span>
                <textarea
                  value={question.outcomes}
                  onChange={(event) => updateQuestion(index, { outcomes: event.target.value })}
                  placeholder="What is being described, explained, compared, predicted or affected?"
                />
              </label>
              <label>
                <span>Predictor or exposure concepts</span>
                <textarea
                  value={question.predictors}
                  onChange={(event) => updateQuestion(index, { predictors: event.target.value })}
                  placeholder="Exposures, interventions, groups or explanatory concepts"
                />
              </label>
              <label>
                <span>Covariate concepts</span>
                <textarea
                  value={question.covariates}
                  onChange={(event) => updateQuestion(index, { covariates: event.target.value })}
                  placeholder="Adjustment variables stated or defined in the protocol"
                />
              </label>
            </div>
          </article>
        ))}
      </div>

      <section className="study-level-card">
        <div className="study-level-heading">
          <div>
            <p className="eyebrow">STUDY LEVEL DESIGN</p>
            <h2>Methodological structure</h2>
          </div>
          {source === "protocol" && <Badge kind="teal">Pre-filled from protocol</Badge>}
        </div>

        <div className="study-design-grid">
          <label>
            <span>Study design</span>
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
            <span>Unit of analysis</span>
            <input value={unit} onChange={(event) => setUnit(event.target.value)} />
          </label>
          <label>
            <span>Sampling design</span>
            <input
              value={samplingDesign}
              onChange={(event) => setSamplingDesign(event.target.value)}
              placeholder="How analytical units were selected"
            />
          </label>
          <label>
            <span>Missing data plan</span>
            <input
              value={missingDataPlan}
              onChange={(event) => setMissingDataPlan(event.target.value)}
              placeholder="Protocol-defined handling, if stated"
            />
          </label>
        </div>

        <div className="design-flags" aria-label="Study design features">
          <label className={repeatedMeasures ? "selected" : ""}>
            <input
              type="checkbox"
              checked={repeatedMeasures}
              onChange={(event) => setRepeatedMeasures(event.target.checked)}
            />
            <span>
              <strong>Repeated observations</strong>
              <small>Same analytical units measured more than once.</small>
            </span>
          </label>
          <label className={clustered ? "selected" : ""}>
            <input
              type="checkbox"
              checked={clustered}
              onChange={(event) => setClustered(event.target.checked)}
            />
            <span>
              <strong>Clustered observations</strong>
              <small>Observations nested within a higher-level unit.</small>
            </span>
          </label>
          <label className={surveyWeights ? "selected" : ""}>
            <input
              type="checkbox"
              checked={surveyWeights}
              onChange={(event) => setSurveyWeights(event.target.checked)}
            />
            <span>
              <strong>Survey weights</strong>
              <small>Sampling or analysis weights are part of the design.</small>
            </span>
          </label>
          <label className={stratified ? "selected" : ""}>
            <input
              type="checkbox"
              checked={stratified}
              onChange={(event) => setStratified(event.target.checked)}
            />
            <span>
              <strong>Stratification</strong>
              <small>Sampling or analysis strata are explicitly defined.</small>
            </span>
          </label>
        </div>

        <div className="study-design-grid conditional-fields">
          {clustered && (
            <label>
              <span>Cluster variable or concept</span>
              <input value={clusterVariable} onChange={(event) => setClusterVariable(event.target.value)} />
            </label>
          )}
          {surveyWeights && (
            <label>
              <span>Weight variable or concept</span>
              <input value={weightVariable} onChange={(event) => setWeightVariable(event.target.value)} />
            </label>
          )}
          {stratified && (
            <label>
              <span>Strata variable or concept</span>
              <input value={strataVariable} onChange={(event) => setStrataVariable(event.target.value)} />
            </label>
          )}
        </div>
      </section>

      <label>
        Analysis plan stated in protocol
        <textarea
          value={statedAnalysisPlan}
          onChange={(event) => setStatedAnalysisPlan(event.target.value)}
        />
      </label>

      <div className="action-row">
        <Button onClick={() => void save()} loading={busy} loadingLabel="Saving study design…">Confirm study specification</Button>
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

function LiveAnalysisPlan({ projectId }: { projectId: string }) {
  const [plan, setPlan] = useState<AnalysisPlan | null>(null);
  const [spec, setSpec] = useState<StudySpecification | null>(null);
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [status, setStatus] = useState("Loading Methodome's analysis plan…");

  useEffect(() => {
    Promise.all([
      getAnalysisPlan(projectId),
      getStudySpecification(projectId),
      getDatasets(projectId)
    ])
      .then(([currentPlan, specification, currentDatasets]) => {
        setPlan(currentPlan);
        setSpec(specification);
        setDatasets(currentDatasets);
        setStatus("");
      })
      .catch((err) => setStatus(message(err)));
  }, [projectId]);

  if (!plan) {
    return (
      <section className="panel analysis-plan-reader">
        <p className="eyebrow">METHODOME BUILDS THIS</p>
        <h2>The analysis plan is not ready yet</h2>
        <p>
          You do not need to construct a statistical plan by hand. Methodome will create it
          after the study design and analytical variables are sufficiently resolved. If a
          genuine methodological choice remains, the workspace will ask you one specific
          question and explain why it matters.
        </p>
        {status ? (
          <div className="mapping-thinking">
            <ActivitySpinner label="Reading analysis state" />
            <span>{status}</span>
          </div>
        ) : (
          <Button href={`/app/projects/${projectId}/overview`}>
            Return to workspace
          </Button>
        )}
      </section>
    );
  }

  const dataset = datasets.find((item) => item.id === plan.datasetVersionId);
  const questions = new Map(
    spec?.researchQuestions.map((question) => [question.id, question]) ?? []
  );

  return (
    <section className="panel analysis-plan-reader">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">METHODOME'S ANALYSIS PLAN</p>
          <h2>{plan.lockedAt ? "Approved analysis plan" : "Draft analysis plan"}</h2>
          <p className="muted">
            This is an inspection surface. Methodome constructs the plan from the protocol,
            confirmed analytical variables and deterministic method rules.
          </p>
        </div>
        <Badge kind={plan.lockedAt ? "success" : "warning"}>
          {plan.lockedAt ? "Locked" : "Awaiting approval"}
        </Badge>
      </div>

      <div className="plan-summary-line">
        <span>
          <small>Analysis dataset</small>
          <strong>{dataset?.label ?? plan.datasetVersionId ?? "Not resolved"}</strong>
        </span>
        <span>
          <small>Planned analyses</small>
          <strong>{plan.analyses.length}</strong>
        </span>
      </div>

      <div className="plan-narrative-list">
        {plan.analyses.map((analysis, index) => {
          const question = questions.get(analysis.researchQuestionId);
          return (
            <article className="plan-narrative" key={analysis.id}>
              <div className="plan-narrative-number">
                {String(index + 1).padStart(2, "0")}
              </div>
              <div>
                <p className="eyebrow">RESEARCH QUESTION</p>
                <h3>{question?.text ?? analysis.researchQuestionId}</h3>
                {analysis.selectedMethodId ? (
                  <p>
                    Methodome proposes <strong>{analysis.selectedMethodId.replaceAll("_", " ")}</strong>
                    {" "}using <code>{analysis.outcome}</code> as the outcome
                    {analysis.predictors.length > 0
                      ? <> and <code>{analysis.predictors.join(", ")}</code> as predictor{analysis.predictors.length === 1 ? "" : "s"}</>
                      : null}.
                  </p>
                ) : (
                  <div className="plain-decision-note">
                    <b>One methodological decision remains.</b>
                    <p>
                      Methodome found more than one defensible analysis for this question.
                      The workspace will present the alternatives in plain language before
                      anything is executed.
                    </p>
                  </div>
                )}
                {analysis.warnings.length > 0 && (
                  <details>
                    <summary>Method notes and diagnostics</summary>
                    {analysis.warnings.map((warning) => (
                      <p className="muted" key={warning}>{warning}</p>
                    ))}
                  </details>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="action-row">
        <Button href={`/app/projects/${projectId}/overview`}>
          Return to workspace
        </Button>
        {plan.lockedAt && (
          <Button href={`/app/projects/${projectId}/analysis`} variant="secondary">
            Inspect execution
          </Button>
        )}
      </div>

      {plan.lockHash && (
        <details className="technical-plan-record">
          <summary>Technical plan record</summary>
          <p className="muted">
            SHA-256 plan hash: <code>{plan.lockHash}</code>
          </p>
        </details>
      )}
      {status && <p className="confirmation" role="status">{status}</p>}
    </section>
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

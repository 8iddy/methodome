"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, PageHeader } from "@/components/ui";
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
          router.replace("/sign-in");
        }
      })
      .catch(() => {
        if (!active) return;
        setState("blocked");
        router.replace("/sign-in");
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (signup) {
        await signUp({ name, email, password });
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

  return (
    <main className="auth">
      <a href="/" className="auth-brand">
        <span className="brand"><span className="mark">M</span><span>Methodome</span></span>
      </a>
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
        <Button type="submit">{busy ? "Working…" : signup ? "Create account" : "Sign in"}</Button>
        {error && <p className="confirmation" role="alert">{error}</p>}
        <p className="muted">
          {signup ? "Already have an account? " : "Need an account? "}
          <a href={`${signup ? "/sign-in" : "/sign-up"}?next=${encodeURIComponent(destination)}`}>
            {signup ? "Sign in" : "Create one"}
          </a>
        </p>
      </form>
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

  return (
    <main className="app-content">
      <LiveProjectStage projectId={projectId} />
      <LiveWorkflowGuide projectId={projectId} />
      <PageHeader
        eyebrow={section.replaceAll("-", " ").toUpperCase()}
        title={title}
        description="This workspace is connected to the Methodome API."
      />
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
    instruments: false,
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
          instruments: files.some(
            (file) => file.fileKind === "instrument" || file.fileKind === "codebook"
          ),
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
    ["Instruments", state.instruments],
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
      getAnalysisHistory()
    ])
      .then(([files, datasets, specification, mappings, plan, history]) => {
        const base = `/app/projects/${projectId}`;
        if (!files.some((file) => file.fileKind === "protocol")) {
          return setNext({
            label: "Add a protocol",
            detail: "Upload the research protocol so Methodome can extract and retain the study logic.",
            href: `${base}/protocol`
          });
        }
        if (!files.some((file) => file.fileKind === "instrument" || file.fileKind === "codebook")) {
          return setNext({
            label: "Add an instrument or codebook",
            detail: "Question text and codebook metadata improve later variable mapping.",
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
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [specification, setSpecification] = useState<StudySpecification | null>(null);
  const [plan, setPlan] = useState<AnalysisPlan | null>(null);

  useEffect(() => {
    void Promise.all([
      getDatasets(projectId).then(setDatasets),
      getStudySpecification(projectId).then(setSpecification),
      getAnalysisPlan(projectId).then(setPlan)
    ]);
  }, [projectId]);

  return (
    <section className="panel summary-card">
      <div><span>Research type</span><strong>{project?.researchType.replaceAll("_", " ") ?? "Loading"}</strong></div>
      <div><span>Current stage</span><strong>{project?.state.replaceAll("_", " ") ?? "Loading"}</strong></div>
      <div><span>Dataset versions</span><strong>{datasets.length}</strong></div>
      <div><span>Study design</span>{specification ? <Badge kind="success">Confirmed</Badge> : <Badge kind="warning">Required</Badge>}</div>
      <div><span>Analysis plan</span>{plan ? <Badge kind={plan.lockedAt ? "success" : "blue"}>{plan.lockedAt ? "Locked" : "Draft"}</Badge> : <Badge kind="warning">Required</Badge>}</div>
    </section>
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

  async function refresh() {
    const current = await getProjectFiles(projectId);
    setFiles(
      current.filter((item) =>
        mode === "protocol"
          ? item.fileKind === "protocol"
          : item.fileKind === "instrument" || item.fileKind === "codebook"
      )
    );
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
      setStatus("Research file uploaded.");
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
        <p className="eyebrow">{mode === "protocol" ? "PROTOCOL SOURCE" : "RESEARCH INSTRUMENTS"}</p>
        <h2>{mode === "protocol" ? "Upload protocol" : "Upload instrument or codebook"}</h2>
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
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <Button onClick={() => void upload()}>{busy ? "Uploading…" : "Upload file"}</Button>
        {status && <p className="confirmation" role="status">{status}</p>}
      </section>

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
        {files.length === 0 && <p className="muted">No files uploaded yet.</p>}
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
    </>
  );
}

function LiveStudyDesign({ projectId }: { projectId: string }) {
  const [question, setQuestion] = useState("");
  const [outcome, setOutcome] = useState("");
  const [outcomeType, setOutcomeType] = useState<"binary" | "continuous" | "count">("binary");
  const [predictor, setPredictor] = useState("");
  const [predictorType, setPredictorType] = useState<"binary" | "categorical_nominal" | "continuous">("continuous");
  const [design, setDesign] = useState<StudySpecification["studyDesign"]>("cross_sectional");
  const [unit, setUnit] = useState("observation");
  const [clustered, setClustered] = useState(false);
  const [clusterVariable, setClusterVariable] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    getStudySpecification(projectId).then((spec) => {
      if (!spec) return;
      const rq = spec.researchQuestions[0];
      setQuestion(rq?.text ?? "");
      setOutcome(rq?.outcomes[0]?.datasetVariable ?? "");
      if (rq?.outcomes[0]?.variableType === "continuous" || rq?.outcomes[0]?.variableType === "count" || rq?.outcomes[0]?.variableType === "binary") {
        setOutcomeType(rq.outcomes[0].variableType);
      }
      setPredictor(rq?.predictors[0]?.datasetVariable ?? "");
      if (rq?.predictors[0]?.variableType === "continuous" || rq?.predictors[0]?.variableType === "binary" || rq?.predictors[0]?.variableType === "categorical_nominal") {
        setPredictorType(rq.predictors[0].variableType);
      }
      setDesign(spec.studyDesign);
      setUnit(spec.unitOfAnalysis);
      setClustered(spec.clustered);
      setClusterVariable(spec.clusterVariable ?? "");
    }).catch(() => undefined);
  }, [projectId]);

  async function save() {
    const specification: StudySpecification = {
      version: `v-${Date.now()}`,
      researchQuestions: [
        {
          id: "rq1",
          text: question,
          objectiveType: "association",
          outcomes: [
            {
              concept: outcome || "Outcome",
              datasetVariable: outcome,
              variableType: outcomeType,
              mappingStatus: "direct_match"
            }
          ],
          predictors: [
            {
              concept: predictor || "Predictor",
              datasetVariable: predictor,
              variableType: predictorType,
              mappingStatus: "direct_match"
            }
          ],
          covariates: [],
          estimand: null
        }
      ],
      studyDesign: design,
      unitOfAnalysis: unit,
      repeatedMeasures: false,
      clustered,
      clusterVariable: clustered ? clusterVariable : null,
      surveyWeights: false,
      weightVariable: null,
      stratified: false,
      strataVariable: null,
      samplingDesign: null,
      missingDataPlan: "Complete case for the first executable analysis.",
      statedAnalysisPlan: null
    };
    try {
      await saveStudySpecification(projectId, specification);
      setStatus("Study specification saved.");
    } catch (err) {
      setStatus(message(err));
    }
  }

  return (
    <section className="form-panel study-form">
      <label>Research question<input value={question} onChange={(e) => setQuestion(e.target.value)} /></label>
      <div className="form-grid">
        <label>Outcome variable<input value={outcome} onChange={(e) => setOutcome(e.target.value)} /></label>
        <label>Outcome type<select value={outcomeType} onChange={(e) => setOutcomeType(e.target.value as typeof outcomeType)}><option value="binary">Binary</option><option value="continuous">Continuous</option><option value="count">Count</option></select></label>
        <label>Primary predictor<input value={predictor} onChange={(e) => setPredictor(e.target.value)} /></label>
        <label>Predictor type<select value={predictorType} onChange={(e) => setPredictorType(e.target.value as typeof predictorType)}><option value="continuous">Continuous</option><option value="binary">Binary</option><option value="categorical_nominal">Categorical</option></select></label>
        <label>Study design<select value={design} onChange={(e) => setDesign(e.target.value as StudySpecification["studyDesign"])}><option value="cross_sectional">Cross sectional</option><option value="cohort">Cohort</option><option value="case_control">Case control</option><option value="trial">Trial</option><option value="longitudinal">Longitudinal</option></select></label>
        <label>Unit of analysis<input value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
      </div>
      <label><input type="checkbox" checked={clustered} onChange={(e) => setClustered(e.target.checked)} /> Observations are clustered</label>
      {clustered && <label>Cluster variable<input value={clusterVariable} onChange={(e) => setClusterVariable(e.target.value)} /></label>}
      <Button onClick={() => void save()}>Save study specification</Button>
      {status && <p className="confirmation" role="status">{status}</p>}
    </section>
  );
}

function LiveVariables({ projectId }: { projectId: string }) {
  const [spec, setSpec] = useState<StudySpecification | null>(null);
  const [mappings, setMappings] = useState<Array<Record<string, unknown>>>([]);
  const [status, setStatus] = useState("");

  async function refresh() {
    const [s, m] = await Promise.all([
      getStudySpecification(projectId),
      getVariableMappings(projectId)
    ]);
    setSpec(s);
    setMappings(m);
  }

  useEffect(() => {
    void refresh().catch((err) => setStatus(message(err)));
  }, [projectId]);

  async function confirmFromSpecification() {
    if (!spec) return;
    const question = spec.researchQuestions[0];
    const variables = [...(question?.outcomes ?? []), ...(question?.predictors ?? []), ...(question?.covariates ?? [])];
    try {
      await saveVariableMappings(
        projectId,
        variables.map((variable) => ({
          id: `map_${crypto.randomUUID().replaceAll("-", "")}`,
          researchConcept: variable.concept,
          ...(variable.datasetVariable ? { datasetVariable: variable.datasetVariable } : {}),
          mappingStatus: variable.datasetVariable ? "direct_match" : "no_match",
          evidence: ["Confirmed from the current study specification."],
          confirmed: true
        }))
      );
      setStatus("Variable mappings confirmed.");
      await refresh();
    } catch (err) {
      setStatus(message(err));
    }
  }

  return (
    <section className="panel table-wrap">
      <div className="panel-heading"><h2>Variable mappings</h2><Button onClick={() => void confirmFromSpecification()}>Confirm current mappings</Button></div>
      <table>
        <thead><tr><th>Research concept</th><th>Dataset variable</th><th>Status</th></tr></thead>
        <tbody>
          {mappings.map((mapping, index) => (
            <tr key={String(mapping.id ?? index)}>
              <td>{String(mapping.researchConcept ?? "")}</td>
              <td><code>{String(mapping.datasetVariable ?? "Not represented")}</code></td>
              <td>{String(mapping.mappingStatus ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {status && <p className="confirmation" role="status">{status}</p>}
    </section>
  );
}

function LiveAnalysisPlan({ projectId }: { projectId: string }) {
  const [selections, setSelections] = useState<CandidateSelection[]>([]);
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [plan, setPlan] = useState<AnalysisPlan | null>(null);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [status, setStatus] = useState("");

  async function refresh() {
    const [candidateResponse, ds, existing] = await Promise.all([
      getMethodCandidates(projectId),
      getDatasets(projectId),
      getAnalysisPlan(projectId)
    ]);
    setSelections(candidateResponse.selections);
    setDatasets(ds);
    setPlan(existing);
    const first = candidateResponse.selections[0]?.candidates.find((candidate) => candidate.executable)?.methodId;
    if (first) setSelectedMethod((current) => current || first);
  }

  useEffect(() => {
    void refresh().catch((err) => setStatus(message(err)));
  }, [projectId]);

  async function createPlan() {
    const spec = await getStudySpecification(projectId);
    const selection = selections[0];
    const question = spec?.researchQuestions.find((item) => item.id === selection?.questionId);
    const outcome = question?.outcomes[0]?.datasetVariable;
    if (!selection || !question || !outcome || !selectedMethod || datasets.length === 0) {
      setStatus("A study specification, dataset and method candidate are required.");
      return;
    }
    const candidate = selection.candidates.find((item) => item.methodId === selectedMethod);
    try {
      const created = await createAnalysisPlan(projectId, {
        versionId: `plan-${Date.now()}`,
        datasetVersionId: datasets[0].id,
        status: "planned_before_analysis",
        analyses: [
          {
            id: "analysis-1",
            researchQuestionId: question.id,
            outcome,
            predictors: question.predictors.flatMap((item) => item.datasetVariable ? [item.datasetVariable] : []),
            covariates: question.covariates.flatMap((item) => item.datasetVariable ? [item.datasetVariable] : []),
            candidateMethodIds: selection.candidates.map((item) => item.methodId),
            selectedMethodId: selectedMethod,
            requiredDecisions: candidate?.decisionRequired ? [candidate.decisionRequired] : [],
            warnings: selection.warnings,
            diagnostics: candidate?.requiredChecks ?? [],
            addedAfterLock: false
          }
        ]
      });
      setPlan(created);
      setStatus("Analysis plan created.");
    } catch (err) {
      setStatus(message(err));
    }
  }

  async function lock() {
    if (!plan) return;
    try {
      const locked = await lockAnalysisPlan(projectId, plan.id);
      setPlan(locked);
      setStatus("Analysis plan locked.");
    } catch (err) {
      setStatus(message(err));
    }
  }

  return (
    <section className="panel">
      <h2>Method candidates</h2>
      {selections.map((selection) => (
        <div key={selection.questionId} className="method-list">
          {selection.candidates.map((candidate) => (
            <label className="method-card" key={candidate.methodId}>
              <input
                type="radio"
                name="candidate"
                checked={selectedMethod === candidate.methodId}
                disabled={!candidate.executable}
                onChange={() => setSelectedMethod(candidate.methodId)}
              />
              <strong>{candidate.displayName}</strong>
              {!candidate.executable && <Badge kind="warning">Execution pending</Badge>}
              <p>{candidate.rationale}</p>
              {candidate.decisionRequired && <small>{candidate.decisionRequired}</small>}
            </label>
          ))}
          {selection.blockedReason && <p className="confirmation">{selection.blockedReason}</p>}
        </div>
      ))}
      {!plan ? <Button onClick={() => void createPlan()}>Create analysis plan</Button> : (
        <div className="action-row">
          <Badge kind={plan.lockedAt ? "success" : "blue"}>{plan.lockedAt ? "Locked" : "Draft"}</Badge>
          {!plan.lockedAt && <Button onClick={() => void lock()}>Lock analysis plan</Button>}
        </div>
      )}
      {status && <p className="confirmation" role="status">{status}</p>}
    </section>
  );
}

function LiveAnalysis({ projectId }: { projectId: string }) {
  const [plan, setPlan] = useState<AnalysisPlan | null>(null);
  const [state, setState] = useState("");
  const [jobId, setJobId] = useState("");

  useEffect(() => {
    getAnalysisPlan(projectId).then(setPlan).catch((err) => setState(message(err)));
  }, [projectId]);

  async function run() {
    const analysis = plan?.analyses[0];
    if (!plan?.datasetVersionId || !analysis?.selectedMethodId) {
      setState("A dataset and selected method are required in the analysis plan.");
      return;
    }
    try {
      const created = await createAnalysisJob(projectId, {
        datasetVersionId: plan.datasetVersionId,
        analysisPlanId: plan.id,
        methodId: analysis.selectedMethodId,
        outcome: analysis.outcome,
        predictors: analysis.predictors,
        covariates: analysis.covariates
      });
      setJobId(created.jobId);
      localStorage.setItem(`methodome:last-job:${projectId}`, created.jobId);
      setState(created.state);

      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const current = await getAnalysisJob(created.jobId);
        setState(current.state);
        if (current.state === "complete" || current.state === "failed" || current.state === "cancelled") break;
      }
    } catch (err) {
      setState(message(err));
    }
  }

  return (
    <section className="panel">
      <h2>Execute approved analysis</h2>
      <p>{plan?.lockedAt ? "The current analysis plan is locked." : "Lock the analysis plan before treating this run as planned analysis."}</p>
      <Button onClick={() => void run()}>Run analysis</Button>
      {jobId && <p><code>{jobId}</code></p>}
      {state && <p className="confirmation" role="status">Job state: {state}</p>}
      {state === "complete" && <Button href={`/app/projects/${projectId}/results`} variant="secondary">View results</Button>}
    </section>
  );
}

function LiveResults({ projectId }: { projectId: string }) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const jobId = localStorage.getItem(`methodome:last-job:${projectId}`);
    if (!jobId) {
      setStatus("Run an analysis first.");
      return;
    }
    getAnalysisResult(jobId).then(setResult).catch((err) => setStatus(message(err)));
  }, [projectId]);

  if (!result) return <section className="panel"><p>{status || "Loading result…"}</p></section>;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div><p className="eyebrow">STRUCTURED RESULT</p><h2>{result.methodId.replaceAll("_", " ")}</h2></div>
        <Badge kind="success">{result.software.engine}</Badge>
      </div>
      <p><b>N:</b> {result.n}</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Term</th><th>Estimate</th><th>SE</th><th>95% CI</th><th>p</th><th>Exp.</th></tr></thead>
          <tbody>
            {result.estimates.map((estimate) => (
              <tr key={estimate.term}>
                <td>{estimate.term}</td>
                <td>{estimate.estimate.toPrecision(5)}</td>
                <td>{estimate.standardError?.toPrecision(5) ?? "—"}</td>
                <td>{estimate.confidenceInterval ? `${estimate.confidenceInterval.lower.toPrecision(4)} to ${estimate.confidenceInterval.upper.toPrecision(4)}` : "—"}</td>
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
            <Badge kind={diagnostic.status === "passed" ? "success" : diagnostic.status === "failed" ? "danger" : "warning"}>{diagnostic.status}</Badge>
            <strong>{diagnostic.label}</strong>
            {diagnostic.value != null && <p>{String(diagnostic.value)}</p>}
            {diagnostic.message && <small>{diagnostic.message}</small>}
          </div>
        ))}
      </div>
      <p className="muted">Executed with {result.software.package} {result.software.packageVersion} on {result.software.engine}.</p>
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
  const [methods, setMethods] = useState<Array<Record<string, unknown>>>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getMethods().then((response) => setMethods(response.methods)).catch(() => setMethods([]));
  }, []);

  const visible = methods.filter((method) =>
    String(method.displayName ?? "").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <main className="app-content">
      <PageHeader
        eyebrow="METHODS LIBRARY"
        title="Methods library"
        description="The live registry controls analytical eligibility and execution maturity."
      />
      <div className="catalogue-tools">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search methods" />
      </div>
      <div className="method-list">
        {visible.map((method) => (
          <article className="method-card" key={String(method.id)}>
            <Badge kind={String(method.maturity) === "validated" ? "success" : String(method.maturity) === "supported" ? "blue" : "warning"}>
              {String(method.maturity)}
            </Badge>
            <h3>{String(method.displayName)}</h3>
            <p>{String(method.family)}</p>
            <small>{Array.isArray(method.diagnostics) ? method.diagnostics.join(", ") : ""}</small>
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

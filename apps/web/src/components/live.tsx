"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, PageHeader, Stage } from "@/components/ui";
import { ProjectPage as PrototypeProjectPage } from "@/components/workspace";
import {
  MethodomeApiError,
  createAnalysisJob,
  createAnalysisPlan,
  createProject,
  createUpload,
  getAnalysisJob,
  getAnalysisPlan,
  getAnalysisResult,
  getAuditTrail,
  getDatasets,
  getMethodCandidates,
  getMethods,
  getAnalysisHistory,
  getProject,
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
  uploadFile,
  type AnalysisPlan,
  type AnalysisResult,
  type BackendProject,
  type CandidateSelection,
  type DatasetVersion,
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
      router.push("/app/projects");
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
          <a href={signup ? "/sign-in" : "/sign-up"}>
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
      <Stage />
      <PageHeader
        eyebrow={section.replaceAll("-", " ").toUpperCase()}
        title={title}
        description="This workspace is connected to the Methodome API."
      />
      {section === "overview" && <LiveOverview projectId={projectId} project={project} />}
      {section === "data" && <LiveData projectId={projectId} />}
      {section === "study-design" && <LiveStudyDesign projectId={projectId} />}
      {section === "variables" && <LiveVariables projectId={projectId} />}
      {section === "analysis-plan" && <LiveAnalysisPlan projectId={projectId} />}
      {section === "analysis" && <LiveAnalysis projectId={projectId} />}
      {section === "results" && <LiveResults projectId={projectId} />}
      {section === "audit-trail" && <LiveAudit projectId={projectId} />}
      {![
        "overview",
        "data",
        "study-design",
        "variables",
        "analysis-plan",
        "analysis",
        "results",
        "audit-trail"
      ].includes(section) && <PrototypeProjectPage section={section} />}
    </main>
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

function LiveData({ projectId }: { projectId: string }) {
  const [datasets, setDatasets] = useState<DatasetVersion[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setDatasets(await getDatasets(projectId));
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
        <Button onClick={() => void upload()}>{busy ? "Uploading…" : "Upload dataset"}</Button>
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
    const first = candidateResponse.selections[0]?.candidates[0]?.methodId;
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
                onChange={() => setSelectedMethod(candidate.methodId)}
              />
              <strong>{candidate.displayName}</strong>
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

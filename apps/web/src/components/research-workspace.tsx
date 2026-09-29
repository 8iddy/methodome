"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import {
  advanceProjectOrchestrator,
  confirmQualitativeCodebook,
  confirmQualitativeThemes,
  getAnalysisPlan,
  getProjectOrchestrator,
  getProjectReadiness,
  getQualitativeAnalysis,
  lockAnalysisPlan,
  reviewQualitativeCodings,
  updateAnalysisPlanMethods,
  type AnalysisPlan,
  type BackendProject,
  type OrchestratorAutomaticAction,
  type OrchestratorDecision,
  type ProjectReadiness,
  type QualitativeAnalysisDetail,
  type QualitativeCodebook,
  type QualitativeTheme
} from "@/lib/api";

type OrchestratorPayload = Awaited<ReturnType<typeof getProjectOrchestrator>>;

function human(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusKind(value: string): "success" | "warning" | "danger" | "blue" | "neutral" | "teal" {
  if (["complete", "ready", "locked", "qualitative_complete"].includes(value)) return "success";
  if (["blocked", "method_blocked"].includes(value)) return "danger";
  if (value.includes("review") || value.includes("waiting") || value.includes("gap")) return "warning";
  if (value.includes("working") || value.includes("execute") || value.includes("coding")) return "blue";
  return "neutral";
}

function decisionHref(projectId: string, decision: OrchestratorDecision, readiness: ProjectReadiness) {
  const base = `/app/projects/${projectId}`;
  if (decision.kind === "confirm_study_design") return `${base}/study-design`;
  if (decision.kind === "review_mapping" || decision.kind === "resolve_mapping_gap") return `${base}/variables`;
  if (decision.kind === "select_method" || decision.kind === "approve_plan") return `${base}/analysis-plan`;
  if (
    decision.kind === "review_qualitative_codebook" ||
    decision.kind === "review_qualitative_codings" ||
    decision.kind === "review_qualitative_themes"
  ) {
    return `${base}/analysis${decision.analysisId ? `?workstream=${encodeURIComponent(decision.analysisId)}` : ""}`;
  }
  if (decision.kind === "review_results") return `${base}/results`;
  return `${base}/${readiness.nextAction.targetSection}`;
}

export function ResearchWorkspaceHome({
  projectId,
  project
}: {
  projectId: string;
  project: BackendProject | null;
}) {
  const [payload, setPayload] = useState<OrchestratorPayload | null>(null);
  const [plan, setPlan] = useState<AnalysisPlan | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const [next, currentPlan] = await Promise.all([
      getProjectOrchestrator(projectId),
      getAnalysisPlan(projectId)
    ]);
    setPayload(next);
    setPlan(currentPlan);
  }

  useEffect(() => {
    refresh().catch((err) =>
      setError(err instanceof Error ? err.message : "Methodome could not read this project.")
    );
  }, [projectId]);

  async function advance(action?: OrchestratorAutomaticAction) {
    setBusy(action ?? "advance");
    setError("");
    setNotice("");
    try {
      const result = await advanceProjectOrchestrator(projectId, action);
      setPayload({
        orchestrator: result.orchestrator,
        readiness: result.readiness,
        registryVersion: payload?.registryVersion ?? "",
        datasetVersionId: result.datasetVersionId
      });
      setNotice(result.message ?? "Methodome updated the project.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Methodome could not continue.");
    } finally {
      setBusy("");
    }
  }

  async function selectMethod(decision: OrchestratorDecision, methodId: string) {
    if (!plan || !decision.analysisId) return;
    setBusy(`${decision.id}:${methodId}`);
    setError("");
    try {
      await updateAnalysisPlanMethods(projectId, plan.id, [
        { analysisId: decision.analysisId, methodId }
      ]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Method selection was not saved.");
    } finally {
      setBusy("");
    }
  }

  async function approvePlan() {
    if (!plan) return;
    setBusy("approve-plan");
    setError("");
    try {
      await lockAnalysisPlan(projectId, plan.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The analysis plan was not locked.");
    } finally {
      setBusy("");
    }
  }

  if (!payload) {
    return (
      <section className="workspace-loading">
        <span className="pulse-dot" />
        <p>Reading the study record…</p>
        {error && <p className="inline-error">{error}</p>}
      </section>
    );
  }

  const { orchestrator, readiness } = payload;
  const completeTasks = orchestrator.tasks.filter((task) => task.status === "complete").length;
  const waitingTasks = orchestrator.tasks.filter((task) => task.status === "waiting" || task.status === "blocked").length;

  return (
    <div className="research-workspace">
      <header className="workspace-header">
        <div className="workspace-heading">
          <p className="workspace-kicker">RESEARCH WORKSPACE</p>
          <h1>{project?.name ?? "Research project"}</h1>
          <p className="workspace-summary">
            {project?.description || orchestrator.summary}
          </p>
        </div>
        <div className="workspace-state">
          <span className={`state-dot ${orchestrator.status}`} />
          <div>
            <small>Methodome status</small>
            <strong>{human(orchestrator.status)}</strong>
          </div>
        </div>
      </header>

      <section className="workspace-now">
        <div className="now-label">NOW</div>
        <div className="now-body">
          <p className="orchestrator-summary">{orchestrator.summary}</p>
          <h2>{orchestrator.nextAction.label}</h2>
          <p>{orchestrator.nextAction.detail}</p>

          {orchestrator.automaticAction && (
            <div className="now-actions">
              <Button onClick={() => void advance(orchestrator.automaticAction)}>
                {busy ? "Working…" : "Continue"}
              </Button>
              <span className="action-note">This step does not require a research decision.</span>
            </div>
          )}

          {!orchestrator.automaticAction && orchestrator.decisions.length === 0 && (
            <div className="now-actions">
              <Button href={`/app/projects/${projectId}/${orchestrator.nextAction.targetSection}`}>
                Open review
              </Button>
            </div>
          )}
        </div>
      </section>

      {orchestrator.decisions.length > 0 && (
        <section className="decision-stack" aria-label="Research decisions">
          <div className="section-rule">
            <span>YOUR DECISION</span>
            <small>{orchestrator.decisions.length} item{orchestrator.decisions.length === 1 ? "" : "s"}</small>
          </div>

          {orchestrator.decisions.map((decision) => (
            <article className="decision-row" key={decision.id}>
              <div className="decision-index" aria-hidden="true">?</div>
              <div className="decision-content">
                <div className="decision-title-row">
                  <Badge kind="warning">{human(decision.kind)}</Badge>
                  {decision.blocking && <span className="blocking-note">Needed before Methodome continues</span>}
                </div>
                <h3>{decision.prompt}</h3>

                {decision.kind === "select_method" && decision.options?.length ? (
                  <div className="method-decision-options">
                    {decision.options.map((option) => (
                      <button
                        className="method-decision"
                        key={option.id}
                        disabled={Boolean(busy)}
                        onClick={() => void selectMethod(decision, option.id)}
                      >
                        <span>
                          <b>{option.label}</b>
                          {option.detail && <small>{option.detail}</small>}
                        </span>
                        <span>{busy === `${decision.id}:${option.id}` ? "Saving…" : "Select"}</span>
                      </button>
                    ))}
                  </div>
                ) : decision.kind === "approve_plan" && plan ? (
                  <div className="decision-actions">
                    <Button onClick={() => void approvePlan()}>
                      {busy === "approve-plan" ? "Locking…" : "Approve and lock plan"}
                    </Button>
                    <Button href={`/app/projects/${projectId}/analysis-plan`} variant="quiet">
                      Inspect plan
                    </Button>
                  </div>
                ) : (
                  <div className="decision-actions">
                    <Button href={decisionHref(projectId, decision, readiness)}>
                      Review
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="workspace-ledger">
        <div className="section-rule">
          <span>STUDY STATE</span>
          <small>{completeTasks} completed · {waitingTasks} waiting</small>
        </div>
        <div className="ledger-list">
          {orchestrator.tasks.map((task) => (
            <div className="ledger-row" key={task.id}>
              <span className={`task-mark ${task.status}`}>
                {task.status === "complete" ? "✓" : task.status === "blocked" ? "!" : ""}
              </span>
              <div>
                <b>{task.label}</b>
                <p>{task.detail}</p>
              </div>
              <Badge kind={statusKind(task.status)}>{human(task.status)}</Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-questions">
        <div className="section-rule">
          <span>RESEARCH QUESTIONS</span>
          <small>{readiness.questions.length} recognised</small>
        </div>
        <div className="question-list">
          {readiness.questions.map((question, index) => (
            <article className="question-row" key={question.questionId}>
              <div className="question-number">{String(index + 1).padStart(2, "0")}</div>
              <div className="question-main">
                <div className="question-meta">
                  <span>{human(question.mode)}</span>
                  {question.objectiveType && <span>{human(question.objectiveType)}</span>}
                </div>
                <h3>{question.text}</h3>
                {question.variables.length > 0 && (
                  <div className="variable-line">
                    {question.variables.map((variable) => (
                      <span key={`${variable.role}:${variable.concept}`}>
                        <small>{variable.role}</small>
                        <b>{variable.datasetVariable ?? variable.concept}</b>
                      </span>
                    ))}
                  </div>
                )}
                {question.blockers.map((blocker) => (
                  <p className="question-warning" key={`${blocker.code}:${blocker.concept ?? ""}`}>
                    {blocker.message}
                  </p>
                ))}
                {question.warnings.map((warning) => (
                  <p className="question-warning" key={warning}>{warning}</p>
                ))}
              </div>
              <Badge kind={statusKind(question.status)}>{human(question.status)}</Badge>
            </article>
          ))}
        </div>
      </section>

      <footer className="workspace-foot">
        <span>Registry {payload.registryVersion}</span>
        <Link href={`/app/projects/${projectId}/audit-trail`}>Audit record</Link>
        <Link href={`/app/projects/${projectId}/settings`}>Processing policy</Link>
      </footer>

      {notice && <p className="workspace-notice" role="status">{notice}</p>}
      {error && <p className="workspace-error" role="alert">{error}</p>}
    </div>
  );
}

export function ResearchSectionContext({
  projectId,
  section
}: {
  projectId: string;
  section: string;
}) {
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);

  useEffect(() => {
    getProjectReadiness(projectId, section)
      .then((result) => setReadiness(result.readiness))
      .catch(() => setReadiness(null));
  }, [projectId, section]);

  if (!readiness?.guidance.visible) return null;

  return (
    <div className="section-context">
      <span className="section-context-mark" />
      <div>
        <small>Project next action</small>
        <b>{readiness.nextAction.label}</b>
        <p>{readiness.nextAction.detail}</p>
      </div>
      <Button
        href={`/app/projects/${projectId}/${readiness.nextAction.targetSection}`}
        variant="quiet"
      >
        Open
      </Button>
    </div>
  );
}

export function ResearchAnalysisSurface({
  projectId,
  fallback
}: {
  projectId: string;
  fallback: React.ReactNode;
}) {
  const search = useSearchParams();
  const requested = search.get("workstream");
  const [payload, setPayload] = useState<OrchestratorPayload | null>(null);

  useEffect(() => {
    getProjectOrchestrator(projectId).then(setPayload).catch(() => setPayload(null));
  }, [projectId]);

  const qualitativeDecision = payload?.orchestrator.decisions.find((decision) =>
    decision.kind.startsWith("review_qualitative_")
  );
  const qualitativeQuestion = payload?.readiness.questions.find((question) =>
    Boolean(question.qualitativeWorkstream)
  );
  const analysisId =
    requested ??
    qualitativeDecision?.analysisId ??
    qualitativeQuestion?.qualitativeWorkstream?.id ??
    null;

  const nextCode = payload?.orchestrator.nextAction.code ?? "";
  const qualitativeNext = nextCode.includes("qualitative");

  if (!analysisId && !qualitativeNext) return <>{fallback}</>;

  return (
    <QualitativeWorkbench
      projectId={projectId}
      analysisId={analysisId}
      payload={payload}
      onChanged={() => getProjectOrchestrator(projectId).then(setPayload)}
    />
  );
}

function QualitativeWorkbench({
  projectId,
  analysisId,
  payload,
  onChanged
}: {
  projectId: string;
  analysisId: string | null;
  payload: OrchestratorPayload | null;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<QualitativeAnalysisDetail | null>(null);
  const [codebook, setCodebook] = useState<QualitativeCodebook | null>(null);
  const [themes, setThemes] = useState<QualitativeTheme[]>([]);
  const [synthesis, setSynthesis] = useState("");
  const [codingChoices, setCodingChoices] = useState<Record<string, "confirmed" | "rejected">>({});
  const [reviewNoCode, setReviewNoCode] = useState<Record<string, boolean>>({});
  const [manualCodes, setManualCodes] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(id = analysisId) {
    if (!id) return;
    const next = await getQualitativeAnalysis(projectId, id);
    setDetail(next);
    if (next?.latestCodebook) {
      setCodebook(structuredClone(next.latestCodebook.codebook));
    }
    if (next?.latestThemes) {
      setThemes(structuredClone(next.latestThemes.themes));
      setSynthesis(next.latestThemes.synthesis);
    }
  }

  useEffect(() => {
    load().catch((err) =>
      setError(err instanceof Error ? err.message : "Qualitative work could not be loaded.")
    );
  }, [projectId, analysisId]);

  async function advanceQualitative() {
    const action = payload?.orchestrator.automaticAction;
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      await advanceProjectOrchestrator(projectId, action);
      setNotice("Methodome completed the next source-linked step.");
      onChanged();
      const refreshed = await getProjectOrchestrator(projectId);
      const id =
        refreshed.orchestrator.decisions.find((decision) =>
          decision.kind.startsWith("review_qualitative_")
        )?.analysisId ??
        refreshed.readiness.questions.find((question) => question.qualitativeWorkstream)
          ?.qualitativeWorkstream?.id ??
        analysisId;
      await load(id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Methodome could not continue qualitative analysis.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCodebook() {
    if (!analysisId || !codebook) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmQualitativeCodebook(projectId, analysisId, codebook);
      setDetail(result.detail);
      setNotice("Codebook confirmed. It is now frozen for this coding workstream.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Codebook review was not saved.");
    } finally {
      setBusy(false);
    }
  }

  const pendingSegments = useMemo(
    () => detail?.segments.filter((segment) => segment.codingState !== "reviewed").slice(0, 12) ?? [],
    [detail]
  );

  const codingsBySegment = useMemo(() => {
    const map = new Map<string, NonNullable<QualitativeAnalysisDetail["codings"]>>();
    for (const coding of detail?.codings ?? []) {
      const list = map.get(coding.segmentId) ?? [];
      list.push(coding);
      map.set(coding.segmentId, list);
    }
    return map;
  }, [detail]);

  async function saveCodingBatch() {
    if (!analysisId || !detail) return;
    const decisions: Array<{
      segmentId: string;
      codeId: string;
      status: "confirmed" | "rejected";
    }> = [];
    const reviewedSegmentIds: string[] = [];

    for (const segment of pendingSegments) {
      const proposed = (codingsBySegment.get(segment.id) ?? []).filter(
        (coding) => coding.status === "proposed"
      );
      const allResolved = proposed.every(
        (coding) => Boolean(codingChoices[coding.id])
      );
      if (proposed.length > 0 && allResolved) {
        for (const coding of proposed) {
          decisions.push({
            segmentId: segment.id,
            codeId: coding.codeId,
            status: codingChoices[coding.id]
          });
        }
        reviewedSegmentIds.push(segment.id);
      } else if (proposed.length === 0 && reviewNoCode[segment.id]) {
        reviewedSegmentIds.push(segment.id);
      }
      if ((manualCodes[segment.id] ?? []).length > 0 && proposed.length === 0) {
        reviewedSegmentIds.push(segment.id);
      }
    }

    const manualAssignments = Object.entries(manualCodes).flatMap(([segmentId, codeIds]) =>
      codeIds.map((codeId) => ({ segmentId, codeId }))
    );

    if (reviewedSegmentIds.length === 0) {
      setError("Review at least one segment before saving this batch.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await reviewQualitativeCodings(projectId, analysisId, {
        decisions,
        manualAssignments,
        reviewedSegmentIds: Array.from(new Set(reviewedSegmentIds))
      });
      setDetail(result.detail);
      setCodingChoices({});
      setReviewNoCode({});
      setManualCodes({});
      setNotice("Coding review saved.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Coding review was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function saveThemes() {
    if (!analysisId || !detail) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmQualitativeThemes(projectId, analysisId, {
        themes,
        synthesis
      });
      setDetail(result.detail);
      setNotice("Themes and synthesis confirmed.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Theme review was not saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!analysisId) {
    return (
      <section className="workbench-empty">
        <p className="workspace-kicker">QUALITATIVE ANALYSIS</p>
        <h2>{payload?.orchestrator.nextAction.label ?? "Prepare qualitative work"}</h2>
        <p>{payload?.orchestrator.nextAction.detail}</p>
        {payload?.orchestrator.automaticAction && (
          <Button onClick={() => void advanceQualitative()}>
            {busy ? "Working…" : "Continue"}
          </Button>
        )}
        {error && <p className="workspace-error">{error}</p>}
      </section>
    );
  }

  if (!detail) {
    return <section className="workspace-loading"><p>Loading qualitative workstream…</p>{error && <p>{error}</p>}</section>;
  }

  const status = detail.analysis.status;
  const proposedCodebook = status === "codebook_review" && codebook;

  return (
    <div className="qual-workbench">
      <header className="qual-header">
        <div>
          <p className="workspace-kicker">QUALITATIVE WORKBENCH</p>
          <h2>Source-linked analysis</h2>
          <p>{detail.segments.length} source segments · {detail.analysis.sourceFileIds.length} source file{detail.analysis.sourceFileIds.length === 1 ? "" : "s"}</p>
        </div>
        <Badge kind={statusKind(status)}>{human(status)}</Badge>
      </header>

      {["prepared", "codebook_confirmed", "coding_in_progress", "coding_confirmed"].includes(status) && (
        <section className="workspace-now compact-now">
          <div className="now-label">NEXT</div>
          <div className="now-body">
            <h2>{payload?.orchestrator.nextAction.label}</h2>
            <p>{payload?.orchestrator.nextAction.detail}</p>
            {payload?.orchestrator.automaticAction && (
              <Button onClick={() => void advanceQualitative()}>
                {busy ? "Working…" : "Continue"}
              </Button>
            )}
          </div>
        </section>
      )}

      {proposedCodebook && (
        <section className="qual-review-section">
          <div className="section-rule">
            <span>CODEBOOK REVIEW</span>
            <small>{codebook.codes.length} proposed codes</small>
          </div>
          <p className="review-intro">
            Edit any code that does not fit the study. Coding cannot start until you confirm this version.
          </p>
          <div className="codebook-editor">
            {codebook.codes.map((code, index) => (
              <article className="code-editor-row" key={code.id}>
                <span className="code-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="code-fields">
                  <input
                    value={code.label}
                    aria-label={`Code ${index + 1} label`}
                    onChange={(event) =>
                      setCodebook({
                        codes: codebook.codes.map((item) =>
                          item.id === code.id ? { ...item, label: event.target.value } : item
                        )
                      })
                    }
                  />
                  <textarea
                    value={code.definition}
                    aria-label={`Code ${index + 1} definition`}
                    onChange={(event) =>
                      setCodebook({
                        codes: codebook.codes.map((item) =>
                          item.id === code.id ? { ...item, definition: event.target.value } : item
                        )
                      })
                    }
                  />
                  <div className="criteria-grid">
                    <label>
                      Include
                      <textarea
                        value={code.inclusionCriteria.join("\n")}
                        onChange={(event) =>
                          setCodebook({
                            codes: codebook.codes.map((item) =>
                              item.id === code.id
                                ? {
                                    ...item,
                                    inclusionCriteria: event.target.value
                                      .split("\n")
                                      .map((value) => value.trim())
                                      .filter(Boolean)
                                  }
                                : item
                            )
                          })
                        }
                      />
                    </label>
                    <label>
                      Exclude
                      <textarea
                        value={code.exclusionCriteria.join("\n")}
                        onChange={(event) =>
                          setCodebook({
                            codes: codebook.codes.map((item) =>
                              item.id === code.id
                                ? {
                                    ...item,
                                    exclusionCriteria: event.target.value
                                      .split("\n")
                                      .map((value) => value.trim())
                                      .filter(Boolean)
                                  }
                                : item
                            )
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="review-footer">
            <Button onClick={() => void saveCodebook()}>{busy ? "Saving…" : "Confirm codebook"}</Button>
            <span>After coding begins, this codebook version cannot be edited.</span>
          </div>
        </section>
      )}

      {status === "coding_review" && (
        <section className="qual-review-section">
          <div className="section-rule">
            <span>CODING REVIEW</span>
            <small>{detail.segments.filter((segment) => segment.codingState === "reviewed").length} of {detail.segments.length} reviewed</small>
          </div>
          <p className="review-intro">
            Review each model proposal against its source text. Segments with no proposed code still need an explicit review.
          </p>
          <div className="segment-review-list">
            {pendingSegments.map((segment) => {
              const proposed = (codingsBySegment.get(segment.id) ?? []).filter(
                (coding) => coding.status === "proposed"
              );
              return (
                <article className="segment-review" key={segment.id}>
                  <div className="segment-ref">
                    <span>SEG {String(segment.segmentIndex + 1).padStart(3, "0")}</span>
                    <small>chars {segment.startChar}–{segment.endChar}</small>
                  </div>
                  <blockquote>{segment.text}</blockquote>
                  {proposed.length > 0 ? (
                    <div className="coding-proposals">
                      {proposed.map((coding) => {
                        const code = detail.latestCodebook?.codebook.codes.find((item) => item.id === coding.codeId);
                        return (
                          <div className="coding-proposal" key={coding.id}>
                            <div>
                              <b>{code?.label ?? coding.codeId}</b>
                              {coding.rationale && <p>{coding.rationale}</p>}
                            </div>
                            <div className="binary-review">
                              <button
                                className={codingChoices[coding.id] === "confirmed" ? "selected" : ""}
                                onClick={() =>
                                  setCodingChoices((current) => ({ ...current, [coding.id]: "confirmed" }))
                                }
                              >
                                Accept
                              </button>
                              <button
                                className={codingChoices[coding.id] === "rejected" ? "selected reject" : ""}
                                onClick={() =>
                                  setCodingChoices((current) => ({ ...current, [coding.id]: "rejected" }))
                                }
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <label className="no-code-review">
                      <input
                        type="checkbox"
                        checked={Boolean(reviewNoCode[segment.id])}
                        onChange={(event) =>
                          setReviewNoCode((current) => ({
                            ...current,
                            [segment.id]: event.target.checked
                          }))
                        }
                      />
                      Reviewed. No code applies to this segment.
                    </label>
                  )}
                  {detail.latestCodebook && (
                    <label className="manual-code">
                      Add researcher code
                      <select
                        value=""
                        onChange={(event) => {
                          const codeId = event.target.value;
                          if (!codeId) return;
                          setManualCodes((current) => ({
                            ...current,
                            [segment.id]: Array.from(new Set([...(current[segment.id] ?? []), codeId]))
                          }));
                        }}
                      >
                        <option value="">Select a code…</option>
                        {detail.latestCodebook.codebook.codes.map((code) => (
                          <option key={code.id} value={code.id}>{code.label}</option>
                        ))}
                      </select>
                      {(manualCodes[segment.id] ?? []).map((codeId) => (
                        <span className="manual-code-chip" key={codeId}>
                          {detail.latestCodebook?.codebook.codes.find((code) => code.id === codeId)?.label ?? codeId}
                          <button
                            aria-label="Remove manual code"
                            onClick={() =>
                              setManualCodes((current) => ({
                                ...current,
                                [segment.id]: (current[segment.id] ?? []).filter((id) => id !== codeId)
                              }))
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </label>
                  )}
                </article>
              );
            })}
          </div>
          <div className="review-footer">
            <Button onClick={() => void saveCodingBatch()}>{busy ? "Saving…" : "Save reviewed batch"}</Button>
            <span>Showing up to 12 unreviewed segments at a time.</span>
          </div>
        </section>
      )}

      {status === "theme_review" && detail.latestThemes && (
        <section className="qual-review-section">
          <div className="section-rule">
            <span>THEME REVIEW</span>
            <small>{themes.length} candidate themes</small>
          </div>
          <p className="review-intro">
            Theme evidence stays tied to confirmed codes and source segments. Edit the wording, not the evidence links.
          </p>
          <div className="theme-editor">
            {themes.map((theme, index) => (
              <article className="theme-editor-row" key={theme.id}>
                <span className="code-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="code-fields">
                  <input
                    value={theme.label}
                    onChange={(event) =>
                      setThemes((current) =>
                        current.map((item) =>
                          item.id === theme.id ? { ...item, label: event.target.value } : item
                        )
                      )
                    }
                  />
                  <textarea
                    value={theme.summary}
                    onChange={(event) =>
                      setThemes((current) =>
                        current.map((item) =>
                          item.id === theme.id ? { ...item, summary: event.target.value } : item
                        )
                      )
                    }
                  />
                  <div className="theme-evidence">
                    <span>{theme.codeIds.length} codes</span>
                    <span>{theme.evidenceSegmentIds.length} source segments</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <label className="synthesis-editor">
            Synthesis
            <textarea value={synthesis} onChange={(event) => setSynthesis(event.target.value)} />
          </label>
          <div className="review-footer">
            <Button onClick={() => void saveThemes()}>{busy ? "Saving…" : "Confirm themes and synthesis"}</Button>
          </div>
        </section>
      )}

      {status === "complete" && detail.latestThemes && (
        <section className="qual-complete">
          <div className="section-rule">
            <span>CONFIRMED SYNTHESIS</span>
            <Badge kind="success">Complete</Badge>
          </div>
          <p className="qual-synthesis">{detail.latestThemes.synthesis}</p>
          <div className="confirmed-themes">
            {detail.latestThemes.themes.map((theme) => (
              <article key={theme.id}>
                <h3>{theme.label}</h3>
                <p>{theme.summary}</p>
                <small>{theme.evidenceSegmentIds.length} linked source segments</small>
              </article>
            ))}
          </div>
        </section>
      )}

      {notice && <p className="workspace-notice" role="status">{notice}</p>}
      {error && <p className="workspace-error" role="alert">{error}</p>}
    </div>
  );
}

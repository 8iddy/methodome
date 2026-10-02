"use client";

// Secondary workbenches. Each one renders state the backend has already
// decided (readiness, research outputs) and sends corrections back to it.
// None of them works out workflow progress on its own.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import {
  getAuditTrail,
  getDatasetProfile,
  getProjectFiles,
  getProjectReadiness,
  getResearchOutputs,
  getVariableMappings,
  saveVariableMappings,
  type DatasetProfile,
  type ProjectFile,
  type ProjectReadiness,
  type QualitativeOutput,
  type QuantitativeOutput,
  type ResearchOutputs,
  type VariableMapping
} from "@/lib/api";

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

function human(value: string) {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function conversationHref(projectId: string) {
  return `/app/projects/${projectId}/overview`;
}

function StateMark({
  tone,
  children
}: {
  tone: "done" | "attention" | "progress" | "problem" | "quiet";
  children: React.ReactNode;
}) {
  return <span className={`wb-state ${tone}`}>{children}</span>;
}

function useResearchOutputs(projectId: string) {
  const [outputs, setOutputs] = useState<ResearchOutputs | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setOutputs(await getResearchOutputs(projectId));
      setError("");
    } catch (reason) {
      setError(errorText(reason, "Could not load the project's outputs."));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the view current for as long as the server reports work in flight.
  const running = Boolean(outputs?.activity && outputs.activity !== "idle");
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(interval);
  }, [running, load]);

  return { outputs, error };
}

/* ---------------------------------------------------------------- Variables */

type VariableRow = {
  concept: string;
  usedIn: string[];
  datasetVariable?: string;
  confirmed: boolean;
  represented: boolean;
};

function rowsFromReadiness(readiness: ProjectReadiness): VariableRow[] {
  const rows = new Map<string, VariableRow>();
  readiness.questions.forEach((question, index) => {
    for (const variable of question.variables) {
      const key = variable.concept.trim().toLowerCase();
      const row = rows.get(key) ?? {
        concept: variable.concept,
        usedIn: [],
        confirmed: variable.confirmed,
        represented: variable.represented,
        ...(variable.datasetVariable
          ? { datasetVariable: variable.datasetVariable }
          : {})
      };
      row.usedIn.push(`RQ${index + 1} ${variable.role}`);
      rows.set(key, row);
    }
  });
  return Array.from(rows.values());
}

function variableState(row: VariableRow) {
  if (row.confirmed && row.represented) {
    return <StateMark tone="done">Resolved</StateMark>;
  }
  if (row.confirmed) {
    return <StateMark tone="problem">Not in dataset</StateMark>;
  }
  if (row.datasetVariable) {
    return <StateMark tone="attention">Needs confirmation</StateMark>;
  }
  return <StateMark tone="attention">Unresolved</StateMark>;
}

export function VariablesWorkbench({ projectId }: { projectId: string }) {
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);
  const [mappings, setMappings] = useState<VariableMapping[]>([]);
  const [profile, setProfile] = useState<DatasetProfile | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [state, saved] = await Promise.all([
        getProjectReadiness(projectId, "variables"),
        getVariableMappings(projectId).catch(() => [] as VariableMapping[])
      ]);
      setReadiness(state.readiness);
      setMappings(saved);
      if (state.datasetVersionId) {
        setProfile(
          await getDatasetProfile(projectId, state.datasetVersionId).catch(
            () => null
          )
        );
      }
      setError("");
    } catch (reason) {
      setError(errorText(reason, "Could not load the variable mappings."));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(row: VariableRow, datasetVariable: string | null) {
    const stored = mappings.find(
      (item) =>
        item.researchConcept.trim().toLowerCase() ===
        row.concept.trim().toLowerCase()
    );
    const unchanged =
      datasetVariable !== null && stored?.datasetVariable === datasetVariable;
    setSaving(true);
    setError("");
    try {
      await saveVariableMappings(projectId, [
        {
          id: stored?.id ?? "new",
          researchConcept: row.concept,
          ...(datasetVariable ? { datasetVariable } : {}),
          mappingStatus:
            datasetVariable === null
              ? "no_match"
              : unchanged && stored && stored.mappingStatus !== "no_match"
                ? stored.mappingStatus
                : "uncertain",
          evidence: [
            ...(stored?.evidence ?? []),
            datasetVariable === null
              ? "Researcher confirmed in the variable workbench that this concept is not represented in the dataset."
              : `Researcher confirmed in the variable workbench that “${datasetVariable}” represents this concept.`
          ],
          confirmed: true
        }
      ]);
      setEditing(null);
      await load();
    } catch (reason) {
      setError(errorText(reason, "Could not save that mapping."));
    } finally {
      setSaving(false);
    }
  }

  if (!readiness) {
    return (
      <section className="wb">
        <p className="wb-note">{error || "Loading variable mappings…"}</p>
      </section>
    );
  }

  const rows = rowsFromReadiness(readiness);
  const summary = readiness.mappingSummary;
  const evidenceFor = (concept: string) =>
    mappings.find(
      (item) =>
        item.researchConcept.trim().toLowerCase() ===
        concept.trim().toLowerCase()
    )?.evidence ?? [];

  if (rows.length === 0) {
    return (
      <section className="wb">
        <p className="wb-note">
          {readiness.stages.studyDesign === "missing"
            ? "Methodome maps variables once it has interpreted the study design."
            : "This study has no quantitative concepts that need a dataset field."}
        </p>
      </section>
    );
  }

  return (
    <section className="wb">
      <p className="wb-summary">
        {summary.representedCount} of {summary.totalConcepts} concepts are
        mapped to a dataset field
        {summary.unreviewedCount > 0 &&
          `, ${summary.unreviewedCount} need${summary.unreviewedCount === 1 ? "s" : ""} your decision`}
        {summary.gapCount > 0 &&
          `, ${summary.gapCount} confirmed as not in the dataset`}
        .
      </p>

      <div className="wb-table-scroll">
        <table className="wb-table">
          <thead>
            <tr>
              <th scope="col">Research concept</th>
              <th scope="col">Dataset field</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isEditing = editing === row.concept;
              const evidence = evidenceFor(row.concept);
              return (
                <tr key={row.concept}>
                  <th scope="row">
                    {row.concept}
                    <small>{row.usedIn.join(" · ")}</small>
                    {evidence.length > 0 && (
                      <details>
                        <summary>Evidence</summary>
                        <ul>
                          {evidence.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </th>
                  <td>
                    {isEditing ? (
                      <select
                        value={choice}
                        onChange={(event) => setChoice(event.target.value)}
                        aria-label={`Dataset field for ${row.concept}`}
                      >
                        <option value="">Choose a field…</option>
                        {(profile?.variables ?? []).map((variable) => (
                          <option
                            key={variable.variableName}
                            value={variable.variableName}
                          >
                            {variable.variableName}
                            {variable.label &&
                            variable.label !== variable.variableName
                              ? ` — ${variable.label}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    ) : row.datasetVariable ? (
                      <code>{row.datasetVariable}</code>
                    ) : (
                      <span className="wb-muted">—</span>
                    )}
                  </td>
                  <td>{variableState(row)}</td>
                  <td className="wb-actions">
                    {isEditing ? (
                      <>
                        <Button
                          onClick={() => void save(row, choice)}
                          disabled={!choice || saving}
                        >
                          Use this field
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => void save(row, null)}
                          disabled={saving}
                        >
                          Not in dataset
                        </Button>
                        <Button
                          variant="quiet"
                          onClick={() => setEditing(null)}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        {!row.confirmed && row.datasetVariable && (
                          <Button
                            onClick={() => void save(row, row.datasetVariable!)}
                            disabled={saving}
                          >
                            Confirm
                          </Button>
                        )}
                        <Button
                          variant="quiet"
                          onClick={() => {
                            setEditing(row.concept);
                            setChoice(row.datasetVariable ?? "");
                          }}
                          disabled={saving}
                        >
                          {row.datasetVariable ? "Change" : "Choose field"}
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      <p className="wb-note">
        Changes here are picked up by Methodome in the{" "}
        <Link href={conversationHref(projectId)}>conversation</Link>.
      </p>
    </section>
  );
}

/* ----------------------------------------------------------------- Analysis */

const QUANTITATIVE_STATE: Record<
  QuantitativeOutput["state"],
  { label: string; tone: "done" | "attention" | "progress" | "problem" | "quiet" }
> = {
  awaiting_method: { label: "Method decision needed", tone: "attention" },
  awaiting_approval: { label: "Awaiting plan approval", tone: "attention" },
  not_started: { label: "Approved, not yet run", tone: "quiet" },
  running: { label: "Running", tone: "progress" },
  complete: { label: "Complete", tone: "done" },
  failed: { label: "Did not complete", tone: "problem" }
};

const QUALITATIVE_STAGE: Record<string, string> = {
  prepared: "Sources segmented; codebook not yet drafted",
  codebook_review: "Codebook drafted, awaiting your review",
  codebook_confirmed: "Codebook confirmed; coding not yet proposed",
  coding_in_progress: "Coding in progress",
  coding_review: "Coding proposed, awaiting your review",
  coding_confirmed: "Coding confirmed; themes not yet drafted",
  theme_review: "Themes drafted, awaiting your review",
  complete: "Themes and synthesis confirmed"
};

function VariablesLine({ analysis }: { analysis: QuantitativeOutput }) {
  return (
    <span className="wb-variables">
      outcome <code>{analysis.outcome}</code>
      {analysis.predictors.length > 0 && (
        <>
          {" · "}predictor{analysis.predictors.length > 1 ? "s" : ""}{" "}
          {analysis.predictors.map((name) => (
            <code key={name}>{name}</code>
          ))}
        </>
      )}
      {analysis.covariates.length > 0 && (
        <>
          {" · "}adjusted for{" "}
          {analysis.covariates.map((name) => (
            <code key={name}>{name}</code>
          ))}
        </>
      )}
    </span>
  );
}

export function AnalysisWorkbench({ projectId }: { projectId: string }) {
  const { outputs, error } = useResearchOutputs(projectId);

  if (!outputs) {
    return (
      <section className="wb">
        <p className="wb-note">{error || "Loading analysis status…"}</p>
      </section>
    );
  }

  if (outputs.quantitative.length === 0 && outputs.qualitative.length === 0) {
    return (
      <section className="wb">
        <p className="wb-note">
          No analysis has been planned yet. Methodome builds the plan once the
          study design and variables are resolved, then asks you to approve it
          in the <Link href={conversationHref(projectId)}>conversation</Link>.
        </p>
      </section>
    );
  }

  return (
    <section className="wb">
      {outputs.quantitative.length > 0 && (
        <>
          <h2 className="wb-heading">Statistical analyses</h2>
          <p className="wb-summary">
            {outputs.plan?.lockedAt
              ? "The plan is approved and locked. Statistics are computed deterministically in Python."
              : "The plan is a draft. Nothing runs until you approve it in the conversation."}
          </p>
          <ul className="wb-list">
            {outputs.quantitative.map((analysis) => {
              const state = QUANTITATIVE_STATE[analysis.state];
              return (
                <li key={analysis.analysisId}>
                  <div>
                    <small>{analysis.researchQuestion}</small>
                    <strong>
                      {analysis.method ?? "Method not yet chosen"}
                      {analysis.exploratory && (
                        <span className="wb-tag">Exploratory</span>
                      )}
                    </strong>
                    <VariablesLine analysis={analysis} />
                  </div>
                  <div className="wb-list-side">
                    <StateMark tone={state.tone}>{state.label}</StateMark>
                    {analysis.state === "complete" && (
                      <Link href={`/app/projects/${projectId}/results`}>
                        View result
                      </Link>
                    )}
                    {(analysis.state === "awaiting_method" ||
                      analysis.state === "awaiting_approval") && (
                      <Link href={conversationHref(projectId)}>
                        Decide in conversation
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {outputs.qualitative.length > 0 && (
        <>
          <h2 className="wb-heading">Qualitative workstreams</h2>
          <ul className="wb-list">
            {outputs.qualitative.map((workstream) => (
              <li key={workstream.analysisId}>
                <div>
                  <small>{workstream.researchQuestion}</small>
                  <strong>
                    {QUALITATIVE_STAGE[workstream.status] ??
                      human(workstream.status)}
                  </strong>
                  <span className="wb-variables">
                    {workstream.sourceFiles.length} source
                    {workstream.sourceFiles.length === 1 ? "" : "s"} ·{" "}
                    {workstream.segmentCount} segments ·{" "}
                    {workstream.reviewedSegmentCount} reviewed
                  </span>
                </div>
                <div className="wb-list-side">
                  <StateMark tone={workstream.complete ? "done" : "progress"}>
                    {workstream.complete ? "Complete" : "In progress"}
                  </StateMark>
                  <Link
                    href={`/app/projects/${projectId}/analysis?workstream=${workstream.analysisId}`}
                  >
                    Open codebook, coding and themes
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ Results */

function QuantitativeResult({ analysis }: { analysis: QuantitativeOutput }) {
  const result = analysis.result;
  if (!result) return null;
  const table = result.table;
  const software = result.software as {
    engine?: string;
    package?: string;
    packageVersion?: string;
  };

  return (
    <article className="wb-result">
      <header>
        <small>{analysis.researchQuestion}</small>
        <h3>
          {table.method}
          {analysis.exploratory && <span className="wb-tag">Exploratory</span>}
        </h3>
        <VariablesLine analysis={analysis} />
      </header>

      <div className="wb-table-scroll">
        <table className="wb-table numeric">
          <caption>n = {table.n}</caption>
          <thead>
            <tr>
              <th scope="col">Term</th>
              <th scope="col">Estimate</th>
              <th scope="col">95% CI</th>
              <th scope="col">p</th>
            </tr>
          </thead>
          <tbody>
            {table.estimates.map((row) => (
              <tr key={row.term}>
                <th scope="row">{row.term}</th>
                <td>{row.estimate}</td>
                <td>{row.confidenceInterval ?? "—"}</td>
                <td>{row.pValue ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.warnings.length > 0 && (
        <ul className="wb-warnings">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <details open={result.allDiagnostics.some((item) => item.status === "failed")}>
        <summary>
          Diagnostics ({result.allDiagnostics.length}
          {table.diagnosticsNeedingReview.length > 0 &&
            `, ${table.diagnosticsNeedingReview.length} to review`}
          )
        </summary>
        <table className="wb-table">
          <tbody>
            {result.allDiagnostics.map((item) => (
              <tr key={item.label}>
                <th scope="row">
                  {item.label}
                  {item.message && <small>{item.message}</small>}
                </th>
                <td>
                  <code>{item.value ?? "—"}</code>
                </td>
                <td>
                  <StateMark
                    tone={
                      item.status === "passed"
                        ? "done"
                        : item.status === "failed"
                          ? "problem"
                          : "attention"
                    }
                  >
                    {human(item.status)}
                  </StateMark>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details>
        <summary>Execution record</summary>
        <dl className="wb-facts">
          <div>
            <dt>Computed with</dt>
            <dd>
              {[software.engine, software.package, software.packageVersion]
                .filter(Boolean)
                .join(" · ") || "—"}
            </dd>
          </div>
          <div>
            <dt>Run identifier</dt>
            <dd>
              <code>{table.jobId}</code>
            </dd>
          </div>
        </dl>
      </details>
    </article>
  );
}

function QualitativeResult({
  projectId,
  workstream
}: {
  projectId: string;
  workstream: QualitativeOutput;
}) {
  return (
    <article className="wb-result">
      <header>
        <small>{workstream.researchQuestion}</small>
        <h3>Qualitative findings</h3>
        <span className="wb-variables">
          {workstream.sourceFiles.map((file) => file.filename).join(", ")} ·{" "}
          {workstream.segmentCount} source segments
        </span>
      </header>

      {workstream.themes ? (
        <>
          {workstream.themes.synthesis && (
            <p className="wb-synthesis">{workstream.themes.synthesis}</p>
          )}
          {workstream.themes.themes.map((theme) => (
            <section className="wb-theme" key={theme.id}>
              <h4>{theme.label}</h4>
              <p>{theme.summary}</p>
              {theme.codes.length > 0 && (
                <p className="wb-variables">
                  Codes: {theme.codes.join(", ")}
                </p>
              )}
              {theme.evidence.length > 0 && (
                <details>
                  <summary>
                    {theme.evidence.length} supporting source segment
                    {theme.evidence.length === 1 ? "" : "s"}
                  </summary>
                  {theme.evidence.map((segment) => (
                    <blockquote key={segment.segmentId}>
                      {segment.text}
                      <cite>
                        {segment.filename}, segment {segment.segmentIndex + 1}
                      </cite>
                    </blockquote>
                  ))}
                </details>
              )}
            </section>
          ))}
        </>
      ) : (
        <p className="wb-note">
          {QUALITATIVE_STAGE[workstream.status] ?? human(workstream.status)}.
          Themes appear here once you have confirmed them.{" "}
          <Link
            href={`/app/projects/${projectId}/analysis?workstream=${workstream.analysisId}`}
          >
            Open the qualitative workbench
          </Link>
        </p>
      )}

      {workstream.codebook && (
        <details>
          <summary>
            Codebook version {workstream.codebook.version} (
            {workstream.codebook.codes.length} codes)
          </summary>
          <table className="wb-table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Definition</th>
                <th scope="col">Confirmed segments</th>
              </tr>
            </thead>
            <tbody>
              {workstream.codebook.codes.map((code) => (
                <tr key={code.id}>
                  <th scope="row">{code.label}</th>
                  <td>{code.definition}</td>
                  <td>{code.confirmedSegmentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </article>
  );
}

export function ResultsWorkbench({ projectId }: { projectId: string }) {
  const { outputs, error } = useResearchOutputs(projectId);

  if (!outputs) {
    return (
      <section className="wb">
        <p className="wb-note">{error || "Loading results…"}</p>
      </section>
    );
  }

  const completed = outputs.quantitative.filter((item) => item.result);
  const pending = outputs.quantitative.filter((item) => !item.result);

  if (completed.length === 0 && outputs.qualitative.length === 0) {
    return (
      <section className="wb">
        <p className="wb-note">
          {pending.length > 0
            ? `${pending.length} planned ${pending.length === 1 ? "analysis has" : "analyses have"} not produced a result yet. `
            : "There are no results yet. "}
          Results appear here and in the{" "}
          <Link href={conversationHref(projectId)}>conversation</Link> as soon
          as approved analyses finish.
        </p>
      </section>
    );
  }

  return (
    <section className="wb">
      {completed.map((analysis) => (
        <QuantitativeResult key={analysis.analysisId} analysis={analysis} />
      ))}
      {outputs.qualitative.map((workstream) => (
        <QualitativeResult
          key={workstream.analysisId}
          projectId={projectId}
          workstream={workstream}
        />
      ))}
      {pending.length > 0 && (
        <p className="wb-note">
          {pending.length} other planned{" "}
          {pending.length === 1 ? "analysis has" : "analyses have"} no result
          yet. See the{" "}
          <Link href={`/app/projects/${projectId}/analysis`}>
            analysis workbench
          </Link>
          .
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ Reports */

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * A plain-text summary assembled only from stored outputs: no wording is
 * generated and no number is recomputed.
 */
function resultsSummaryMarkdown(projectId: string, outputs: ResearchOutputs) {
  const lines: string[] = [
    "# Methodome results summary",
    "",
    `Project: ${projectId}`,
    `Methodology release: ${outputs.methodologyKnowledgeVersion}`
  ];
  if (outputs.plan) {
    lines.push(
      `Analysis plan: ${outputs.plan.versionId}${
        outputs.plan.lockedAt
          ? ` (locked ${outputs.plan.lockedAt}, hash ${outputs.plan.lockHash})`
          : " (draft, not approved)"
      }`,
      `Study specification version: ${outputs.plan.studySpecificationVersion}`
    );
  }

  for (const analysis of outputs.quantitative) {
    lines.push("", `## ${analysis.method ?? "Method not chosen"}`, "");
    lines.push(`Research question: ${analysis.researchQuestion}`);
    lines.push(
      `Outcome: ${analysis.outcome}` +
        (analysis.predictors.length
          ? `; predictors: ${analysis.predictors.join(", ")}`
          : "") +
        (analysis.covariates.length
          ? `; covariates: ${analysis.covariates.join(", ")}`
          : "")
    );
    lines.push(
      `Status: ${QUANTITATIVE_STATE[analysis.state].label}${
        analysis.exploratory ? " (exploratory, added after plan lock)" : ""
      }`
    );
    if (analysis.result) {
      const table = analysis.result.table;
      lines.push("", `n = ${table.n}`, "", "| Term | Estimate | 95% CI | p |", "|---|---|---|---|");
      for (const row of table.estimates) {
        lines.push(
          `| ${row.term} | ${row.estimate} | ${row.confidenceInterval ?? "—"} | ${row.pValue ?? "—"} |`
        );
      }
      if (analysis.result.allDiagnostics.length > 0) {
        lines.push("", "Diagnostics:");
        for (const item of analysis.result.allDiagnostics) {
          lines.push(
            `- ${item.label}: ${item.value ?? "—"} (${item.status.replaceAll("_", " ")})`
          );
        }
      }
      for (const warning of analysis.result.warnings) {
        lines.push("", `Warning: ${warning}`);
      }
      lines.push("", `Run identifier: ${table.jobId}`);
    }
  }

  for (const workstream of outputs.qualitative) {
    lines.push("", "## Qualitative findings", "");
    lines.push(`Research question: ${workstream.researchQuestion}`);
    lines.push(
      `Sources: ${workstream.sourceFiles.map((file) => file.filename).join(", ")} (${workstream.segmentCount} segments)`
    );
    lines.push(
      `Status: ${QUALITATIVE_STAGE[workstream.status] ?? workstream.status}`
    );
    if (workstream.themes) {
      if (workstream.themes.synthesis) {
        lines.push("", workstream.themes.synthesis);
      }
      for (const theme of workstream.themes.themes) {
        lines.push("", `### ${theme.label}`, "", theme.summary);
        if (theme.codes.length) lines.push("", `Codes: ${theme.codes.join(", ")}`);
        for (const segment of theme.evidence) {
          lines.push(
            "",
            `> ${segment.text.replaceAll("\n", " ")}`,
            `> — ${segment.filename}, segment ${segment.segmentIndex + 1}`
          );
        }
      }
    } else {
      lines.push("", "Themes have not been confirmed by a researcher yet.");
    }
  }

  return `${lines.join("\n")}\n`;
}

export function ReportsWorkbench({ projectId }: { projectId: string }) {
  const { outputs, error } = useResearchOutputs(projectId);
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState("");

  if (!outputs) {
    return (
      <section className="wb">
        <p className="wb-note">{error || "Loading exportable outputs…"}</p>
      </section>
    );
  }

  const quantitativeDone = outputs.quantitative.filter((item) => item.result).length;
  const qualitativeDone = outputs.qualitative.filter((item) => item.themes).length;
  const hasOutput = quantitativeDone + qualitativeDone > 0;

  async function downloadRecord() {
    setBusy(true);
    setExportError("");
    try {
      const audit = await getAuditTrail(projectId);
      download(
        `methodome-${projectId}-analysis-record.json`,
        JSON.stringify({ outputs, audit }, null, 2),
        "application/json"
      );
    } catch (reason) {
      setExportError(errorText(reason, "Could not prepare the analysis record."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wb">
      <p className="wb-summary">
        {hasOutput
          ? `Ready to export: ${quantitativeDone} statistical result${quantitativeDone === 1 ? "" : "s"} and ${qualitativeDone} confirmed qualitative analysis${qualitativeDone === 1 ? "" : "es"}.`
          : "Nothing has been completed yet, so exports would only contain the plan and audit record."}
      </p>

      <ul className="wb-list">
        <li>
          <div>
            <strong>Results summary</strong>
            <span className="wb-variables">
              Readable tables, diagnostics, themes and supporting source
              segments, assembled from stored outputs. Markdown.
            </span>
          </div>
          <div className="wb-list-side">
            <Button
              variant="secondary"
              disabled={!hasOutput}
              onClick={() =>
                download(
                  `methodome-${projectId}-results-summary.md`,
                  resultsSummaryMarkdown(projectId, outputs!),
                  "text/markdown"
                )
              }
            >
              Download
            </Button>
          </div>
        </li>
        <li>
          <div>
            <strong>Complete analysis record</strong>
            <span className="wb-variables">
              Plan, results, qualitative outputs and the full audit trail, for
              reproducibility. JSON.
            </span>
          </div>
          <div className="wb-list-side">
            <Button
              variant="secondary"
              loading={busy}
              loadingLabel="Preparing…"
              onClick={() => void downloadRecord()}
            >
              Download
            </Button>
          </div>
        </li>
      </ul>

      {exportError && (
        <p className="workspace-error" role="alert">
          {exportError}
        </p>
      )}
      <p className="wb-note">
        Formatted manuscripts (DOCX, PDF, LaTeX) and publication figures are
        not available yet. Methodome does not produce those formats until the
        report builder is implemented and validated.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ Sources */

const SOURCE_ROLES: Array<{ kind: string; label: string; purpose: string }> = [
  { kind: "protocol", label: "Protocol", purpose: "Defines the research questions and design." },
  { kind: "instrument", label: "Instruments", purpose: "Link question wording to dataset fields." },
  { kind: "codebook", label: "Codebooks", purpose: "Link coded fields to their meaning." },
  { kind: "dataset", label: "Datasets", purpose: "Analysed quantitatively; originals are never modified." },
  { kind: "transcript", label: "Transcripts", purpose: "Segmented and coded in the qualitative workstream." },
  { kind: "other", label: "Unclassified", purpose: "Methodome could not infer a research role." }
];

function fileSize(bytes?: number) {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SourcesWorkbench({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [outputs, setOutputs] = useState<ResearchOutputs | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getProjectFiles(projectId)
      .then(setFiles)
      .catch((reason) =>
        setError(errorText(reason, "Could not load the project's sources."))
      );
    getResearchOutputs(projectId)
      .then(setOutputs)
      .catch(() => setOutputs(null));
  }, [projectId]);

  if (!files) {
    return (
      <section className="wb">
        <p className="wb-note">{error || "Loading sources…"}</p>
      </section>
    );
  }

  const workstreamsFor = (fileId: string) =>
    (outputs?.qualitative ?? []).filter((workstream) =>
      workstream.sourceFiles.some((file) => file.fileId === fileId)
    );

  return (
    <section className="wb">
      <h2 className="wb-heading">Research material</h2>
      <p className="wb-summary">
        {files.length === 0
          ? "No material has been handed over yet."
          : `${files.length} file${files.length === 1 ? "" : "s"} in this project.`}{" "}
        Add protocols, instruments, data or transcripts in the{" "}
        <Link href={conversationHref(projectId)}>conversation</Link>; Methodome
        identifies each file's role.
      </p>

      {SOURCE_ROLES.map((role) => {
        const inRole = files.filter((file) => file.fileKind === role.kind);
        if (inRole.length === 0) return null;
        return (
          <div className="wb-source-group" key={role.kind}>
            <h3>
              {role.label} <span>{role.purpose}</span>
            </h3>
            <ul className="wb-list">
              {inRole.map((file) => {
                const workstreams = workstreamsFor(file.id);
                return (
                  <li key={file.id}>
                    <div>
                      <strong>{file.filename}</strong>
                      <span className="wb-variables">
                        {[
                          fileSize(file.sizeBytes),
                          `added ${new Date(file.createdAt).toLocaleDateString()}`
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {workstreams.map((workstream) => (
                        <span className="wb-variables" key={workstream.analysisId}>
                          Used for “{workstream.researchQuestion}”:{" "}
                          {workstream.segmentCount} segments.{" "}
                          <Link
                            href={`/app/projects/${projectId}/analysis?workstream=${workstream.analysisId}`}
                          >
                            Open coding
                          </Link>
                        </span>
                      ))}
                      <details>
                        <summary>Integrity</summary>
                        <code>SHA-256 {file.checksumSha256}</code>
                      </details>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

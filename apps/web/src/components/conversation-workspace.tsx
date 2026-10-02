"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ActivitySpinner, Button } from "@/components/ui";
import {
  createUpload,
  getProjectConversation,
  resolveProjectConversationDecision,
  sendProjectConversationMessage,
  uploadFile,
  type BackendProject,
  type OrchestratorDecision,
  type ProjectConversationMessage
} from "@/lib/api";

type DatasetVariable = { name: string; label?: string };

type ResultTable = {
  jobId: string;
  method: string;
  n: number;
  estimates: Array<{
    term: string;
    estimate: string;
    confidenceInterval: string | null;
    pValue: string | null;
  }>;
  diagnosticsNeedingReview: string[];
  diagnostics?: Array<{ label: string; status: string; value: string | null }>;
};

function human(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

const STATUS_LABELS: Record<string, string> = {
  waiting_for_researcher: "Needs your decision",
  working: "Working",
  ready_to_execute: "Working",
  complete: "Analysis complete",
  blocked: "Blocked"
};

function decisionLabel(kind: OrchestratorDecision["kind"]) {
  if (kind === "approve_plan") return "Approval needed";
  if (kind === "provide_input") return "Missing material";
  if (kind.startsWith("review_qualitative")) return "Review needed";
  return "Decision needed";
}

function ConversationDecisionCard({
  projectId,
  decision,
  datasetVariables,
  busy: workspaceBusy,
  onResolved
}: {
  projectId: string;
  decision: OrchestratorDecision;
  datasetVariables: DatasetVariable[];
  busy: boolean;
  onResolved: () => Promise<void>;
}) {
  const [mappingValue, setMappingValue] = useState("");
  const [error, setError] = useState("");
  const [resolving, setResolving] = useState(false);
  const busy = workspaceBusy || resolving;
  const fieldListId = useId();

  async function resolve(response: {
    choiceId?: string;
    datasetVariable?: string;
    confirmNotRepresented?: boolean;
    approved?: boolean;
  }) {
    setError("");
    setResolving(true);
    try {
      await resolveProjectConversationDecision(
        projectId,
        decision.id,
        response
      );
      await onResolved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Methodome could not record that research decision."
      );
    } finally {
      setResolving(false);
    }
  }

  const detailedQualitativeReview =
    decision.kind === "review_qualitative_codebook" ||
    decision.kind === "review_qualitative_codings" ||
    decision.kind === "review_qualitative_themes";

  return (
    <article className="conversation-decision">
      <small>{decisionLabel(decision.kind)}</small>
      <p className="conversation-decision-prompt">{decision.prompt}</p>

      {decision.kind === "select_method" && decision.options && (
        <div className="conversation-choice-list">
          {decision.options.map((option) => (
            <button
              type="button"
              className="conversation-choice"
              key={option.id}
              disabled={busy}
              onClick={() => void resolve({ choiceId: option.id })}
            >
              <strong>{option.label}</strong>
              {option.detail && <span>{option.detail}</span>}
            </button>
          ))}
        </div>
      )}

      {decision.kind === "approve_plan" &&
        (decision.studyInterpretation || decision.plannedAnalyses?.length) && (
          <dl className="conversation-facts">
            {decision.studyInterpretation && (
              <>
                <div>
                  <dt>Study design</dt>
                  <dd>
                    {decision.studyInterpretation.studyDesign.replaceAll("_", " ")}
                  </dd>
                </div>
                <div>
                  <dt>Unit of analysis</dt>
                  <dd>{decision.studyInterpretation.unitOfAnalysis}</dd>
                </div>
              </>
            )}
            {decision.plannedAnalyses?.map((analysis, index) => (
              <div key={index}>
                <dt>
                  {decision.plannedAnalyses!.length > 1
                    ? `Analysis ${index + 1}`
                    : "Planned analysis"}
                </dt>
                <dd>
                  <span className="conversation-fact-question">
                    {analysis.researchQuestion}
                  </span>
                  <strong>{analysis.method}</strong>
                  <span className="conversation-fact-variables">
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
                </dd>
              </div>
            ))}
            {decision.studyInterpretation &&
              !decision.plannedAnalyses?.length && (
                <div>
                  <dt>Research questions</dt>
                  <dd>
                    <ol>
                      {decision.studyInterpretation.researchQuestions.map(
                        (question, index) => (
                          <li key={index}>{question}</li>
                        )
                      )}
                    </ol>
                  </dd>
                </div>
              )}
          </dl>
        )}

      {decision.kind === "approve_plan" && (
        <div className="conversation-decision-actions">
          <Button
            onClick={() => void resolve({ approved: true })}
            disabled={busy}
          >
            {decision.confirmsStudyInterpretation
              ? "Confirm and run the analysis"
              : "Run the analysis"}
          </Button>
          <Link
            className="conversation-inspect-link"
            href={`/app/projects/${projectId}/analysis-plan`}
          >
            Review the full plan
          </Link>
          {decision.confirmsStudyInterpretation && (
            <Link
              className="conversation-inspect-link"
              href={`/app/projects/${projectId}/study-design`}
            >
              Inspect or correct the study design
            </Link>
          )}
        </div>
      )}

      {decision.kind === "confirm_study_design" &&
        (decision.options?.length ? (
          <div className="conversation-choice-list">
            {decision.options.map((option) => (
              <button
                type="button"
                className="conversation-choice"
                key={option.id}
                disabled={busy}
                onClick={() => void resolve({ choiceId: option.id })}
              >
                <strong>{option.label}</strong>
                {option.detail && <span>{option.detail}</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className="conversation-decision-actions">
            <Button
              onClick={() => void resolve({ approved: true })}
              disabled={busy}
            >
              Continue with this interpretation
            </Button>
            <Link
              className="conversation-inspect-link"
              href={`/app/projects/${projectId}/study-design`}
            >
              Correct something
            </Link>
          </div>
        ))}

      {(decision.kind === "review_mapping" ||
        decision.kind === "resolve_mapping_gap") && (
        <div className="conversation-mapping-decision">
          {decision.options?.length ? (
            <div className="conversation-choice-list">
              {decision.options.map((option) => (
                <button
                  type="button"
                  className="conversation-choice"
                  key={option.id}
                  disabled={busy}
                  onClick={() =>
                    void resolve({ datasetVariable: option.id })
                  }
                >
                  <strong>
                    Use <code>{option.label}</code>
                  </strong>
                  {option.detail && <span>{option.detail}</span>}
                </button>
              ))}
            </div>
          ) : null}

          <label>
            <span>
              {decision.options?.length
                ? "Or choose a different dataset field"
                : "Dataset field"}
            </span>
            <input
              value={mappingValue}
              onChange={(event) => setMappingValue(event.target.value)}
              placeholder={
                datasetVariables.length > 0
                  ? "Choose or type a field name"
                  : "Exact dataset field name"
              }
              list={datasetVariables.length > 0 ? fieldListId : undefined}
              disabled={busy}
            />
            {datasetVariables.length > 0 && (
              <datalist id={fieldListId}>
                {datasetVariables.map((variable) => (
                  <option key={variable.name} value={variable.name}>
                    {variable.label}
                  </option>
                ))}
              </datalist>
            )}
          </label>

          <div className="conversation-decision-actions">
            <Button
              onClick={() =>
                void resolve({ datasetVariable: mappingValue.trim() })
              }
              disabled={busy || !mappingValue.trim()}
            >
              Use this field
            </Button>
            <Button
              variant="quiet"
              onClick={() =>
                void resolve({ confirmNotRepresented: true })
              }
              disabled={busy}
            >
              It is not in this dataset
            </Button>
          </div>
        </div>
      )}

      {decision.kind === "provide_input" && (
        <p className="conversation-decision-hint">
          Attach the missing material or explain it in the message box below.
        </p>
      )}

      {detailedQualitativeReview && (
        <div className="conversation-decision-actions">
          <Link
            className="button secondary"
            href={`/app/projects/${projectId}/analysis`}
          >
            Review source-linked evidence
          </Link>
          <span className="conversation-decision-hint">
            This review needs the source text, so it opens in the workbench.
          </span>
        </div>
      )}

      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

function MessageAttachments({
  message
}: {
  message: ProjectConversationMessage;
}) {
  if (message.attachmentFileIds.length === 0) return null;
  const classified = Array.isArray(message.metadata?.classifiedAttachments)
    ? (message.metadata.classifiedAttachments as Array<{
        fileId?: string;
        filename?: string;
        fileKind?: string;
      }>)
    : [];

  if (classified.length === 0) {
    return (
      <span className="conversation-attachment-count">
        {message.attachmentFileIds.length} attached file
        {message.attachmentFileIds.length === 1 ? "" : "s"}
      </span>
    );
  }

  return (
    <ul className="conversation-attachments">
      {classified.map((attachment, index) => (
        <li key={attachment.fileId ?? `${attachment.filename}-${index}`}>
          <strong>{attachment.filename ?? "Research file"}</strong>
          <span>
            {attachment.fileKind && attachment.fileKind !== "other"
              ? human(attachment.fileKind)
              : "Role not identified"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ResultTables({ tables }: { tables: ResultTable[] }) {
  return (
    <>
      {tables.map((table) => (
        <figure className="conversation-result" key={table.jobId}>
          <figcaption>
            <strong>{table.method}</strong>
            <span>n = {table.n}</span>
          </figcaption>
          {table.estimates.length > 0 ? (
            <div className="conversation-result-scroll">
              <table>
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
          ) : (
            <p>This method returned no coefficient-level estimates.</p>
          )}
          {table.diagnosticsNeedingReview.length > 0 && (
            <details>
              <summary>
                {table.diagnosticsNeedingReview.length} diagnostic
                {table.diagnosticsNeedingReview.length === 1 ? "" : "s"} to
                review before reporting
              </summary>
              <ul>
                {(
                  table.diagnostics ??
                  table.diagnosticsNeedingReview.map((label) => ({
                    label,
                    status: "review",
                    value: null
                  }))
                ).map((item) => (
                  <li key={item.label}>
                    {item.label}
                    {item.value && <span>{item.value}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </figure>
      ))}
    </>
  );
}

function ConversationMessage({
  projectId,
  message
}: {
  projectId: string;
  message: ProjectConversationMessage;
}) {
  if (message.role === "activity") {
    return (
      <p className="conversation-activity">
        <span aria-hidden="true" />
        {message.content}
      </p>
    );
  }

  const paragraphs = message.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const isResult = message.messageKind === "result";
  const hasResultDetails =
    isResult &&
    Array.isArray(message.metadata?.analysisJobIds) &&
    message.metadata.analysisJobIds.length > 0;
  const resultTables =
    isResult && Array.isArray(message.metadata?.resultTables)
      ? (message.metadata.resultTables as ResultTable[])
      : [];
  // With structured tables the middle paragraphs (the same numbers as prose)
  // are redundant; keep only the opening and closing sentences.
  const shownParagraphs =
    resultTables.length > 0 && paragraphs.length > 2
      ? [paragraphs[0]!]
      : paragraphs;

  return (
    <article
      className={`conversation-message ${message.role} ${message.messageKind}`}
    >
      <small>{message.role === "researcher" ? "You" : "Methodome"}</small>
      {shownParagraphs.map((paragraph, index) => (
        <p
          key={index}
          className={
            isResult && index > 0 && index < shownParagraphs.length - 1
              ? "conversation-statistics"
              : undefined
          }
        >
          {paragraph}
        </p>
      ))}
      {resultTables.length > 0 && <ResultTables tables={resultTables} />}
      {message.role === "researcher" && <MessageAttachments message={message} />}
      {hasResultDetails && (
        <Link
          className="conversation-inspect-link"
          href={`/app/projects/${projectId}/results`}
        >
          Open full results, diagnostics and provenance
        </Link>
      )}
    </article>
  );
}

export function ConversationWorkspace({
  projectId,
  project
}: {
  projectId: string;
  project: BackendProject | null;
}) {
  const [messages, setMessages] = useState<ProjectConversationMessage[]>([]);
  const [decisions, setDecisions] = useState<OrchestratorDecision[]>([]);
  const [datasetVariables, setDatasetVariables] = useState<DatasetVariable[]>(
    []
  );
  const [status, setStatus] = useState("working");
  const [loaded, setLoaded] = useState(false);
  const [knowledgeVersion, setKnowledgeVersion] = useState("");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileStates, setFileStates] = useState<
    Record<string, "queued" | "uploading" | "uploaded">
  >({});
  const [dragging, setDragging] = useState(false);
  // `submitting` covers only this browser's own request in flight. Whether
  // Methodome is working is reported by the server as `activity`.
  const [submitting, setSubmitting] = useState(false);
  const [activity, setActivity] = useState<
    "idle" | "working" | "running_analysis"
  >("idle");
  const busy = submitting || activity !== "idle";
  const [error, setError] = useState("");
  const threadEnd = useRef<HTMLDivElement>(null);

  async function refresh() {
    const result = await getProjectConversation(projectId);
    setMessages(result.messages);
    setDecisions(
      result.orchestrator.decisions.filter((decision) => decision.blocking)
    );
    setDatasetVariables(result.datasetVariables ?? []);
    setActivity(result.activity ?? "idle");
    setStatus(result.orchestrator.status);
    setKnowledgeVersion(result.methodologyKnowledgeVersion);
    setLoaded(true);
    return result;
  }

  useEffect(() => {
    void refresh().catch((reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not load the project conversation."
      )
    );
  }, [projectId]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, decisions.length, busy]);

  useEffect(() => {
    if (activity === "idle") return;
    const interval = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(interval);
  }, [activity, projectId]);

  async function afterDecision() {
    await refresh();
  }

  function fileKey(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  function addFiles(next: File[]) {
    setFiles((current) => {
      const existing = new Set(current.map(fileKey));
      return [
        ...current,
        ...next.filter((file) => !existing.has(fileKey(file)))
      ];
    });
    setFileStates((current) => {
      const updated = { ...current };
      for (const file of next) {
        if (!updated[fileKey(file)]) updated[fileKey(file)] = "queued";
      }
      return updated;
    });
  }

  function removeFile(file: File) {
    setFiles((current) =>
      current.filter((item) => fileKey(item) !== fileKey(file))
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = content.trim();
    if ((!message && files.length === 0) || busy) return;
    setSubmitting(true);
    setError("");

    try {
      const attachmentFileIds: string[] = [];
      for (const file of files) {
        const key = fileKey(file);
        setFileStates((current) => ({ ...current, [key]: "uploading" }));
        const upload = await createUpload(projectId, {
          filename: file.name,
          mediaType: file.type || "application/octet-stream",
          fileKind: "other",
          sizeBytes: file.size
        });
        await uploadFile(
          upload.uploadPath,
          file,
          file.type || "application/octet-stream"
        );
        attachmentFileIds.push(upload.fileId);
        setFileStates((current) => ({ ...current, [key]: "uploaded" }));
      }

      await sendProjectConversationMessage(
        projectId,
        message ||
          `I attached ${files.length} research file${files.length === 1 ? "" : "s"}.`,
        attachmentFileIds
      );
      setContent("");
      setFiles([]);
      setFileStates({});
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Methodome could not send that message."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const started = messages.length > 0;
  // An open decision renders as its own card, so the checkpoint message that
  // only repeats the same prompt would say everything twice.
  const openPrompts = new Set(decisions.map((decision) => decision.prompt));
  const visibleMessages = messages.filter(
    (message) =>
      !(message.messageKind === "checkpoint" && openPrompts.has(message.content))
  );
  // Before anything has been handed over, the welcome text already asks for
  // the study material; a separate "missing material" card would repeat it.
  const visibleDecisions = started
    ? decisions
    : decisions.filter((decision) => decision.kind !== "provide_input");

  return (
    <div className="conversation-workspace">
      <header className="conversation-header">
        <div>
          <h1>{project?.name ?? "Research project"}</h1>
          {project?.description && <p>{project.description}</p>}
        </div>
        {loaded && started && (
          <span className={`conversation-status ${status}`}>
            {STATUS_LABELS[status] ?? human(status)}
          </span>
        )}
      </header>

      <section
        className="conversation-thread"
        aria-label="Conversation with Methodome"
        aria-live="polite"
      >
        {loaded && !started && (
          <article className="conversation-message methodome welcome">
            <small>Methodome</small>
            <p>
              Tell me what you want to learn from this study and attach the
              protocol, instruments, data or transcripts. I will read them,
              work through every step I can do safely, and stop only where
              your scientific judgement is needed.
            </p>
          </article>
        )}

        {visibleMessages.map((message) => (
          <ConversationMessage
            key={message.id}
            projectId={projectId}
            message={message}
          />
        ))}

        {visibleDecisions.map((decision) => (
          <ConversationDecisionCard
            key={decision.id}
            projectId={projectId}
            decision={decision}
            datasetVariables={datasetVariables}
            busy={busy}
            onResolved={afterDecision}
          />
        ))}

        {busy && (
          <p className="conversation-activity working">
            <ActivitySpinner label="Methodome is working" />
            {submitting
              ? "Sending…"
              : activity === "running_analysis"
                ? "Running the approved analysis…"
                : "Methodome is working…"}
          </p>
        )}
        <div ref={threadEnd} className="conversation-thread-end" />
      </section>

      <form
        className={`conversation-composer ${dragging ? "is-dragging" : ""}`}
        onSubmit={submit}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {files.length > 0 && (
          <ul className="composer-files">
            {files.map((file) => {
              const state = fileStates[fileKey(file)] ?? "queued";
              return (
                <li key={fileKey(file)}>
                  {state === "uploading" && (
                    <ActivitySpinner label={`Uploading ${file.name}`} />
                  )}
                  <strong>{file.name}</strong>
                  <span>
                    {state === "uploading"
                      ? "Uploading…"
                      : state === "uploaded"
                        ? "Uploaded"
                        : ""}
                  </span>
                  {state === "queued" && !busy && (
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => removeFile(file)}
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={
            started
              ? "Answer Methodome, add material, or ask why…"
              : "Describe the research problem…"
          }
          aria-label="Message to Methodome"
          rows={2}
          maxLength={8000}
          disabled={busy}
        />
        <div className="composer-actions">
          <label className="composer-attach">
            Attach files
            <input
              type="file"
              multiple
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
              disabled={busy}
            />
          </label>
          <Button
            type="submit"
            loading={busy}
            loadingLabel="Working…"
            disabled={!content.trim() && files.length === 0}
          >
            Send
          </Button>
        </div>
      </form>

      {error && (
        <p className="workspace-error" role="alert">
          {error}
        </p>
      )}
      <p className="conversation-footnote">
        Statistics are computed deterministically and every decision is kept
        in the{" "}
        <Link href={`/app/projects/${projectId}/audit-trail`}>audit record</Link>
        {knowledgeVersion ? `. Methodology release ${knowledgeVersion}.` : "."}
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ActivitySpinner, Badge, Button } from "@/components/ui";
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

function human(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function ConversationDecisionCard({
  projectId,
  decision,
  busy,
  onResolved
}: {
  projectId: string;
  decision: OrchestratorDecision;
  busy: boolean;
  onResolved: () => Promise<void>;
}) {
  const [mappingValue, setMappingValue] = useState(
    decision.options?.[0]?.id ?? ""
  );
  const [error, setError] = useState("");

  async function resolve(response: {
    choiceId?: string;
    datasetVariable?: string;
    confirmNotRepresented?: boolean;
    approved?: boolean;
  }) {
    setError("");
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
    }
  }

  const detailedQualitativeReview =
    decision.kind === "review_qualitative_codebook" ||
    decision.kind === "review_qualitative_codings" ||
    decision.kind === "review_qualitative_themes";

  return (
    <article className="conversation-decision">
      <small>METHODOME NEEDS YOUR INPUT</small>
      <p>{decision.prompt}</p>

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

      {decision.kind === "approve_plan" && (
        <div className="conversation-decision-actions">
          <Button
            onClick={() => void resolve({ approved: true })}
            disabled={busy}
          >
            Run the analysis
          </Button>
          <Link
            className="conversation-inspect-link"
            href={`/app/projects/${projectId}/analysis-plan`}
          >
            Review details
          </Link>
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
                  <strong>Use {option.label}</strong>
                  {option.detail && <span>{option.detail}</span>}
                </button>
              ))}
            </div>
          ) : null}

          <label>
            <span>
              {decision.options?.length
                ? "Or enter a different dataset field"
                : "Dataset field"}
            </span>
            <input
              value={mappingValue}
              onChange={(event) => setMappingValue(event.target.value)}
              placeholder="Exact dataset field name"
              disabled={busy}
            />
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
              It is not represented
            </Button>
          </div>
        </div>
      )}

      {decision.kind === "provide_input" && (
        <p className="conversation-decision-hint">
          Attach the missing research material or explain the missing
          information in the composer below.
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
            This checkpoint stays explicit because it requires source-level
            qualitative judgment.
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

export function ConversationWorkspace({
  projectId,
  project
}: {
  projectId: string;
  project: BackendProject | null;
}) {
  const [messages, setMessages] = useState<ProjectConversationMessage[]>([]);
  const [decisions, setDecisions] = useState<OrchestratorDecision[]>([]);
  const [status, setStatus] = useState("working");
  const [knowledgeVersion, setKnowledgeVersion] = useState("");
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const threadEnd = useRef<HTMLDivElement>(null);

  async function refresh() {
    const result = await getProjectConversation(projectId);
    setMessages(result.messages);
    setDecisions(
      result.orchestrator.decisions.filter((decision) => decision.blocking)
    );
    setStatus(result.orchestrator.status);
    setKnowledgeVersion(result.methodologyKnowledgeVersion);
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
    if (!busy) return;
    const interval = window.setInterval(() => {
      void refresh()
        .then((result) => {
          if (
            ["waiting_for_researcher", "complete", "blocked"].includes(
              result.orchestrator.status
            )
          ) {
            setBusy(false);
          }
        })
        .catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(interval);
  }, [busy, projectId]);

  async function afterDecision() {
    setBusy(true);
    await refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = content.trim();
    if ((!message && files.length === 0) || busy) return;
    setBusy(true);
    setError("");

    try {
      const attachmentFileIds: string[] = [];
      for (const file of files) {
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
      }

      await sendProjectConversationMessage(
        projectId,
        message ||
          `I attached ${files.length} research file${files.length === 1 ? "" : "s"}.`,
        attachmentFileIds
      );
      setContent("");
      setFiles([]);
      await refresh();
    } catch (reason) {
      setBusy(false);
      setError(
        reason instanceof Error
          ? reason.message
          : "Methodome could not send that message."
      );
    }
  }

  return (
    <div className="conversation-workspace">
      <header className="conversation-project-header">
        <div>
          <p className="workspace-kicker">RESEARCH CONVERSATION</p>
          <h1>{project?.name ?? "Research project"}</h1>
          {project?.description && <p>{project.description}</p>}
        </div>
        <Badge
          kind={
            status === "complete"
              ? "success"
              : status === "blocked"
                ? "danger"
                : "blue"
          }
        >
          {human(status)}
        </Badge>
      </header>

      <section
        className="conversation-primary"
        aria-label="Conversation with Methodome"
      >
        <div
          className="conversation-thread conversation-thread-primary"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <article className="conversation-message methodome">
              <small>METHODOME</small>
              <p>
                Tell me what you are trying to learn, or attach the protocol
                and research data. I’ll work through every safe step and pause
                only when your scientific judgment is needed.
              </p>
            </article>
          )}

          {messages.map((message) => (
            <article
              className={`conversation-message ${message.role} ${message.messageKind}`}
              key={message.id}
            >
              <small>
                {message.role === "researcher"
                  ? "YOU"
                  : message.role === "activity"
                    ? "ACTIVITY"
                    : "METHODOME"}
              </small>
              <p>{message.content}</p>
              {message.attachmentFileIds.length > 0 && (
                <span className="attachment-count">
                  {message.attachmentFileIds.length} attached file
                  {message.attachmentFileIds.length === 1 ? "" : "s"}
                </span>
              )}
            </article>
          ))}

          {decisions.map((decision) => (
            <ConversationDecisionCard
              key={decision.id}
              projectId={projectId}
              decision={decision}
              busy={busy}
              onResolved={afterDecision}
            />
          ))}

          {busy && (
            <div className="conversation-thinking">
              <ActivitySpinner label="Methodome is continuing the research" />
              <span>Methodome is continuing every safe step…</span>
            </div>
          )}
          <div ref={threadEnd} />
        </div>

        <form
          className="conversation-compose conversation-compose-primary"
          onSubmit={submit}
        >
          {files.length > 0 && (
            <div className="composer-files">
              {files.map((file) => (
                <span key={`${file.name}-${file.size}`}>{file.name}</span>
              ))}
            </div>
          )}
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Describe the research problem, answer Methodome, or ask why…"
            rows={3}
            maxLength={8000}
            disabled={busy}
          />
          <div className="composer-actions">
            <label className="attachment-button">
              Attach files
              <input
                type="file"
                multiple
                onChange={(event) =>
                  setFiles(Array.from(event.target.files ?? []))
                }
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
          Methodology: {knowledgeVersion || "loading"}. Scientific decisions,
          results and provenance remain auditable in the project record.
        </p>
      </section>
    </div>
  );
}

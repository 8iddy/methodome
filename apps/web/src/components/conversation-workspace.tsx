"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ActivitySpinner, Badge, Button } from "@/components/ui";
import {
  createUpload,
  getProjectConversation,
  sendProjectConversationMessage,
  uploadFile,
  type BackendProject,
  type ProjectConversationMessage
} from "@/lib/api";

function human(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ConversationWorkspace({
  projectId,
  project
}: {
  projectId: string;
  project: BackendProject | null;
}) {
  const [messages, setMessages] = useState<ProjectConversationMessage[]>([]);
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
    setStatus(result.orchestrator.status);
    setKnowledgeVersion(result.methodologyKnowledgeVersion);
  }

  useEffect(() => {
    void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the project conversation."));
  }, [projectId]);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!busy) return;
    const interval = window.setInterval(() => {
      void refresh().then(() => {
        if (["waiting_for_researcher", "complete", "blocked"].includes(status)) setBusy(false);
      }).catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(interval);
  }, [busy, projectId, status]);

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
        await uploadFile(upload.uploadPath, file, file.type || "application/octet-stream");
        attachmentFileIds.push(upload.fileId);
      }
      await sendProjectConversationMessage(
        projectId,
        message || `I attached ${files.length} research file${files.length === 1 ? "" : "s"}.`,
        attachmentFileIds
      );
      setContent("");
      setFiles([]);
      await refresh();
    } catch (reason) {
      setBusy(false);
      setError(reason instanceof Error ? reason.message : "Methodome could not send that message.");
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
        <Badge kind={status === "complete" ? "success" : status === "blocked" ? "danger" : "blue"}>
          {human(status)}
        </Badge>
      </header>

      <section className="conversation-primary" aria-label="Conversation with Methodome">
        <div className="conversation-thread conversation-thread-primary" aria-live="polite">
          {messages.length === 0 && (
            <article className="conversation-message methodome">
              <small>METHODOME</small>
              <p>Tell me what you are trying to learn, or attach the protocol and research data. I’ll work through every safe step and pause only when your scientific judgment is needed.</p>
            </article>
          )}
          {messages.map((message) => (
            <article className={`conversation-message ${message.role} ${message.messageKind}`} key={message.id}>
              <small>{message.role === "researcher" ? "YOU" : message.role === "activity" ? "ACTIVITY" : "METHODOME"}</small>
              <p>{message.content}</p>
              {message.attachmentFileIds.length > 0 && <span className="attachment-count">{message.attachmentFileIds.length} attached file{message.attachmentFileIds.length === 1 ? "" : "s"}</span>}
              {message.messageKind === "checkpoint" && (
                <Link className="conversation-inspect-link" href={`/app/projects/${projectId}/study-design`}>Inspect the project record</Link>
              )}
            </article>
          ))}
          {busy && (
            <div className="conversation-thinking">
              <ActivitySpinner label="Methodome is continuing the research" />
              <span>Methodome is continuing every safe step…</span>
            </div>
          )}
          <div ref={threadEnd} />
        </div>

        <form className="conversation-compose conversation-compose-primary" onSubmit={submit}>
          {files.length > 0 && <div className="composer-files">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}
          <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Describe the research problem, answer Methodome, or ask why…" rows={3} maxLength={8000} disabled={busy} />
          <div className="composer-actions">
            <label className="attachment-button">
              Attach files
              <input type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} disabled={busy} />
            </label>
            <Button type="submit" loading={busy} loadingLabel="Working…" disabled={!content.trim() && files.length === 0}>Send</Button>
          </div>
        </form>
        {error && <p className="workspace-error" role="alert">{error}</p>}
        <p className="conversation-footnote">Methodology: {knowledgeVersion || "loading"}. Decisions, results, and source links remain in the project record and audit trail.</p>
      </section>
    </div>
  );
}

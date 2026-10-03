"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { getModelUsage, getSession, type ModelUsageSummary } from "@/lib/api";

const PURPOSE_LABELS: Record<string, string> = {
  document_conversion: "Reading uploaded documents",
  protocol_extraction: "Interpreting protocols",
  protocol_question_refinement: "Refining research questions",
  variable_mapping: "Proposing variable mappings",
  project_assistant: "Answering in the conversation",
  qualitative_codebook: "Drafting qualitative codebooks",
  qualitative_coding: "Proposing qualitative coding",
  qualitative_themes: "Drafting qualitative themes"
};

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function AccountPage() {
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [usage, setUsage] = useState<ModelUsageSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getSession()
      .then((session) => setUser(session?.user ?? null))
      .catch(() => setUser(null));
    getModelUsage(30)
      .then(setUsage)
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Could not load model usage."
        )
      );
  }, []);

  return (
    <main className="app-content review-page">
      <PageHeader
        eyebrow="ACCOUNT"
        title="Account"
        description="Your sign-in details and how much language-model work Methodome has done for you."
      />

      <section className="wb">
        <h2 className="wb-heading">Signed in as</h2>
        <dl className="wb-facts">
          <div>
            <dt>Name</dt>
            <dd>{user?.name ?? "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user?.email ?? "—"}</dd>
          </div>
        </dl>
        <p className="wb-note">
          Data-processing controls (data class, identifiable data, external
          model permission) are set per project under Project settings.
        </p>
      </section>

      <section className="wb">
        <h2 className="wb-heading">Model usage, last 30 days</h2>
        {usage ? (
          <>
            <p className="wb-summary">
              {usage.totals.calls} model call{usage.totals.calls === 1 ? "" : "s"}
              {usage.totals.failures > 0 &&
                `, ${usage.totals.failures} failed`}
              , about {compact(usage.totals.inputChars)} characters sent and{" "}
              {compact(usage.totals.outputChars)} received. Statistical
              computation never uses a language model and is not counted here.
            </p>
            {usage.byPurpose.length > 0 && (
              <div className="wb-table-scroll">
                <table className="wb-table numeric usage">
                  <thead>
                    <tr>
                      <th scope="col">Task</th>
                      <th scope="col">Model</th>
                      <th scope="col">Calls</th>
                      <th scope="col">Failed</th>
                      <th scope="col">Sent</th>
                      <th scope="col">Received</th>
                      <th scope="col">Avg time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.byPurpose.map((row) => (
                      <tr key={`${row.purpose}:${row.model}`}>
                        <th scope="row">
                          {PURPOSE_LABELS[row.purpose] ?? row.purpose}
                        </th>
                        <td>{row.model.replace("@cf/", "")}</td>
                        <td>{row.calls}</td>
                        <td>{row.failures || "—"}</td>
                        <td>{compact(row.inputChars)}</td>
                        <td>{compact(row.outputChars)}</td>
                        <td>{(row.averageDurationMs / 1000).toFixed(1)}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <p className="wb-note">{error || "Loading usage…"}</p>
        )}
      </section>
    </main>
  );
}

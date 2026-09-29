import crypto from "node:crypto";

const API = (
  process.env.METHODOME_API_URL ?? "https://api.methodome.com/api"
).replace(/\/$/, "");
const APP_ORIGIN =
  process.env.METHODOME_APP_ORIGIN ?? "https://methodome.com";

const email =
  `conversation-smoke-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")}@methodome.com`;
const password =
  `Mth!${crypto.randomBytes(24).toString("base64url")}9a`;
const cookies = new Map();
let projectId = null;

function updateCookies(headers) {
  const values =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);
  for (const header of values) {
    if (!header) continue;
    const pair = header.split(";", 1)[0];
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (value) cookies.set(name, value);
    else cookies.delete(name);
  }
}

function cookieHeader() {
  return [...cookies.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function request(path, init = {}, expected = [200]) {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("origin")) headers.set("origin", APP_ORIGIN);
  const cookie = cookieHeader();
  if (cookie) headers.set("cookie", cookie);
  if (init.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API}${path}`, { ...init, headers });
  updateCookies(response.headers);
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!expected.includes(response.status)) {
    throw new Error(
      `${init.method ?? "GET"} ${path} returned ${response.status}: ${JSON.stringify(payload)}`
    );
  }
  return { status: response.status, payload };
}

async function uploadConversationFile(
  filename,
  content,
  mediaType = "text/plain"
) {
  const intent = await request(
    `/projects/${projectId}/uploads`,
    {
      method: "POST",
      body: JSON.stringify({
        filename,
        mediaType,
        fileKind: "other",
        sizeBytes: Buffer.byteLength(content)
      })
    },
    [201]
  );

  const uploadPath = intent.payload.uploadPath;
  const uploadUrl = uploadPath.startsWith("http")
    ? uploadPath
    : `${API.replace(/\/api$/, "")}${uploadPath}`;
  const headers = new Headers({
    "content-type": mediaType,
    origin: APP_ORIGIN
  });
  const cookie = cookieHeader();
  if (cookie) headers.set("cookie", cookie);

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body: content
  });
  updateCookies(response.headers);
  if (!response.ok) {
    throw new Error(
      `Conversation file upload returned ${response.status}: ${await response.text()}`
    );
  }
  return intent.payload.fileId;
}

async function waitForConversation(predicate, label, attempts = 90) {
  let latest = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = (
      await request(`/projects/${projectId}/conversation`, {}, [200])
    ).payload;
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(
    `Timed out waiting for ${label}. Last state: ${JSON.stringify(
      latest?.orchestrator ?? latest
    )}`
  );
}

async function resolveDecision(decisionId, response) {
  return request(
    `/projects/${projectId}/conversation/decisions/${encodeURIComponent(
      decisionId
    )}`,
    {
      method: "POST",
      body: JSON.stringify(response)
    },
    [202]
  );
}

async function main() {
  console.log("Methodome conversation-first end-to-end smoke test");
  console.log(`API: ${API}`);

  try {
    await request(
      "/auth/sign-up/email",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Methodome Conversation Smoke Test",
          email,
          password
        })
      },
      [200]
    );
    const session = await request("/auth/get-session", {}, [200]);
    if (!session.payload?.user?.id) {
      throw new Error("Conversation smoke session was not established.");
    }
    console.log("PASS conversation auth");

    const project = await request(
      "/projects",
      {
        method: "POST",
        body: JSON.stringify({
          name: `Conversation Research Project ${Date.now()}`,
          description:
            "Temporary end-to-end validation of conversation-first orchestration.",
          researchType: "quantitative"
        })
      },
      [201]
    );
    projectId = project.payload.project.id;
    console.log("PASS conversation project creation");

    const protocolFileId = await uploadConversationFile(
      "protocol.txt",
      [
        "Study title: Synthetic association study.",
        "Objective: assess whether predictor x is associated with outcome y.",
        "Research question: Is x associated with y?",
        "Primary outcome: y.",
        "Primary predictor: x.",
        "Study design: cross sectional.",
        "Unit of analysis: observation.",
        "There are no repeated measures, clusters, survey weights, or strata."
      ].join("\n")
    );
    const instrumentFileId = await uploadConversationFile(
      "questionnaire.csv",
      "variable,question\nx,Predictor x\ny,Outcome y\n",
      "text/csv"
    );
    const datasetFileId = await uploadConversationFile(
      "facility_data.csv",
      "x,y\n1,3\n2,5\n3,7\n4,9\n5,11\n6,13\n",
      "text/csv"
    );

    await request(
      `/projects/${projectId}/conversation/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          content:
            "I want to understand whether x is associated with y. Use the attached protocol, questionnaire and dataset and carry the analysis forward.",
          attachmentFileIds: [
            protocolFileId,
            instrumentFileId,
            datasetFileId
          ]
        })
      },
      [202]
    );
    console.log("PASS conversation research handoff");

    let conversation = await waitForConversation(
      (payload) =>
        payload.orchestrator.status === "waiting_for_researcher" ||
        payload.orchestrator.status === "complete",
      "first scientific checkpoint"
    );
    let studyInterpretationConfirmed = false;

    for (let checkpoint = 0; checkpoint < 4; checkpoint += 1) {
      const studyDecision = conversation.orchestrator.decisions.find(
        (decision) => decision.kind === "confirm_study_design"
      );
      if (!studyDecision) break;

      if (studyDecision.options?.length) {
        const association =
          studyDecision.options.find(
            (option) => option.id === "association"
          ) ?? studyDecision.options[0];
        if (!association) {
          throw new Error(
            `Study-design checkpoint did not expose a usable interpretation: ${JSON.stringify(
              studyDecision
            )}`
          );
        }
        await resolveDecision(studyDecision.id, {
          choiceId: association.id
        });
      } else {
        await resolveDecision(studyDecision.id, { approved: true });
      }
      studyInterpretationConfirmed = true;
      console.log("PASS in-thread study interpretation confirmation");

      conversation = await waitForConversation(
        (payload) =>
          payload.orchestrator.status === "waiting_for_researcher" &&
          !payload.orchestrator.decisions.some(
            (decision) => decision.id === studyDecision.id
          ),
        "post-study-interpretation checkpoint"
      );
    }

    const methodDecision = conversation.orchestrator.decisions.find(
      (decision) => decision.kind === "select_method"
    );
    if (!methodDecision) {
      throw new Error(
        `Expected a method interpretation checkpoint: ${JSON.stringify(
          conversation.orchestrator
        )}`
      );
    }
    if (
      !methodDecision.options?.some(
        (option) => option.id === "linear_regression"
      )
    ) {
      throw new Error(
        `Linear regression was not a defensible conversation option: ${JSON.stringify(
          methodDecision
        )}`
      );
    }

    await resolveDecision(methodDecision.id, {
      choiceId: "linear_regression"
    });
    console.log("PASS in-thread method decision");

    conversation = await waitForConversation(
      (payload) =>
        payload.orchestrator.decisions.some(
          (decision) => decision.kind === "approve_plan"
        ),
      "analysis plan approval"
    );
    const planDecision = conversation.orchestrator.decisions.find(
      (decision) => decision.kind === "approve_plan"
    );
    if (!planDecision) {
      throw new Error("Conversation did not surface plan approval.");
    }

    await resolveDecision(planDecision.id, { approved: true });
    console.log("PASS in-thread plan approval");

    conversation = await waitForConversation(
      (payload) =>
        payload.orchestrator.status === "complete" &&
        payload.messages.some(
          (message) =>
            message.messageKind === "result" &&
            Array.isArray(message.metadata?.analysisJobIds) &&
            message.metadata.analysisJobIds.length > 0
        ),
      "server-side statistical completion",
      120
    );

    const resultMessage = [...conversation.messages]
      .reverse()
      .find(
        (message) =>
          message.messageKind === "result" &&
          Array.isArray(message.metadata?.analysisJobIds)
      );
    const analysisJobId = resultMessage?.metadata?.analysisJobIds?.[0];
    if (typeof analysisJobId !== "string") {
      throw new Error("Conversation result did not reference a completed job.");
    }
    if (!resultMessage.content.includes("Linear regression")) {
      throw new Error(
        `Conversation did not return the deterministic method result: ${resultMessage.content}`
      );
    }
    console.log("PASS result returned to persistent conversation");

    const result = await request(
      `/analysis-jobs/${analysisJobId}/result`,
      {},
      [200]
    );
    const slope = result.payload.result.estimates.find(
      (estimate) => estimate.term === "x"
    )?.estimate;
    if (typeof slope !== "number" || Math.abs(slope - 2) > 1e-6) {
      throw new Error(`Unexpected deterministic regression slope: ${slope}`);
    }
    if (result.payload.result.software.engine !== "python") {
      throw new Error("Conversation result was not backed by the Python engine.");
    }
    console.log("PASS conversation result backed by Python");

    const reloaded = await request(
      `/projects/${projectId}/conversation`,
      {},
      [200]
    );
    if (
      !reloaded.payload.messages.some(
        (message) => message.id === resultMessage.id
      )
    ) {
      throw new Error("Conversation did not survive reload.");
    }
    console.log("PASS conversation persistence");

    const audit = await request(
      `/projects/${projectId}/audit`,
      {},
      [200]
    );
    const actions = new Set(audit.payload.events.map((event) => event.action));
    const requiredAuditActions = [
      "orchestrator_protocol_information_extracted",
      "orchestrator_variable_mappings_proposed",
      "conversation_analysis_method_selected",
      "conversation_analysis_plan_approved",
      "analysis_completed"
    ];
    if (studyInterpretationConfirmed) {
      requiredAuditActions.push(
        "conversation_study_interpretation_confirmed"
      );
    }
    for (const action of requiredAuditActions) {
      if (!actions.has(action)) {
        throw new Error(`Conversation audit is missing ${action}.`);
      }
    }
    console.log("PASS conversation methodology and execution provenance");

    await request(
      `/projects/${projectId}`,
      { method: "DELETE" },
      [204]
    );
    projectId = null;
    await request("/account", { method: "DELETE" }, [204]);
    cookies.clear();

    console.log("METHODOME CONVERSATION E2E PASS");
  } catch (error) {
    console.error("METHODOME CONVERSATION E2E FAIL");
    console.error(error instanceof Error ? error.message : error);

    if (projectId) {
      try {
        await request(
          `/projects/${projectId}`,
          { method: "DELETE" },
          [204]
        );
        projectId = null;
      } catch {
        // Preserve the original failure.
      }
    }
    try {
      await request("/account", { method: "DELETE" }, [204, 409]);
    } catch {
      // Preserve the original failure.
    }
    process.exitCode = 1;
  }
}

await main();

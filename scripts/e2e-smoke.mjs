import crypto from "node:crypto";

const API = (process.env.METHODOME_API_URL ?? "https://api.methodome.com/api").replace(/\/$/, "");
const APP_ORIGIN = process.env.METHODOME_APP_ORIGIN ?? "https://methodome.com";
const email = `smoke-${Date.now()}-${crypto.randomBytes(4).toString("hex")}@methodome.com`;
const password = `Mth!${crypto.randomBytes(24).toString("base64url")}9a`;
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
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
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

async function uploadResearchFile(kind, filename, content, mediaType = "text/plain") {
  const intent = await request(
    `/projects/${projectId}/uploads`,
    {
      method: "POST",
      body: JSON.stringify({
        filename,
        mediaType,
        fileKind: kind,
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
    throw new Error(`Research file upload returned ${response.status}: ${await response.text()}`);
  }

  return intent.payload.fileId;
}

async function uploadDataset(label, filename, csv) {
  const intent = await request(
    `/projects/${projectId}/uploads`,
    {
      method: "POST",
      body: JSON.stringify({
        filename,
        mediaType: "text/csv",
        fileKind: "dataset",
        sizeBytes: Buffer.byteLength(csv)
      })
    },
    [201]
  );

  const uploadPath = intent.payload.uploadPath;
  const uploadUrl = uploadPath.startsWith("http")
    ? uploadPath
    : `${API.replace(/\/api$/, "")}${uploadPath}`;

  const headers = new Headers({
    "content-type": "text/csv",
    origin: APP_ORIGIN
  });
  const cookie = cookieHeader();
  if (cookie) headers.set("cookie", cookie);
  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers,
    body: csv
  });
  updateCookies(uploaded.headers);
  if (!uploaded.ok) {
    throw new Error(`Dataset upload returned ${uploaded.status}: ${await uploaded.text()}`);
  }

  const lines = csv.trim().split(/\r?\n/);
  const registered = await request(
    `/projects/${projectId}/datasets`,
    {
      method: "POST",
      body: JSON.stringify({
        fileId: intent.payload.fileId,
        label,
        rowCount: Math.max(0, lines.length - 1),
        columnCount: lines[0].split(",").length
      })
    },
    [201]
  );

  return registered.payload.datasetVersionId;
}

async function main() {
  console.log("Methodome end-to-end smoke test");
  console.log(`API: ${API}`);

  try {
    const unauthenticated = await request("/projects", {}, [401]);
    if (unauthenticated.payload?.error?.code !== "UNAUTHENTICATED") {
      throw new Error("Protected projects endpoint did not reject an unauthenticated request.");
    }
    console.log("PASS unauthenticated protection");

    await request(
      "/auth/sign-up/email",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Methodome Smoke Test",
          email,
          password
        })
      },
      [200]
    );

    const session = await request("/auth/get-session", {}, [200]);
    if (!session.payload?.user?.id) throw new Error("Better Auth session was not established.");
    console.log("PASS auth session");

    const project = await request(
      "/projects",
      {
        method: "POST",
        body: JSON.stringify({
          name: `Smoke Research Project ${Date.now()}`,
          description: "Temporary Methodome end-to-end validation project.",
          researchType: "quantitative"
        })
      },
      [201]
    );
    projectId = project.payload.project.id;
    console.log("PASS project creation");

    await uploadResearchFile(
      "protocol",
      "smoke-protocol.txt",
      "Objective: assess whether x is associated with y. Design: cross sectional."
    );
    await uploadResearchFile(
      "instrument",
      "smoke-instrument.csv",
      "variable,question\nx,Predictor x\ny,Outcome y\n",
      "text/csv"
    );
    const sourceFiles = await request(`/projects/${projectId}/files`, {}, [200]);
    const sourceKinds = sourceFiles.payload.files.map((item) => item.fileKind);
    if (!sourceKinds.includes("protocol") || !sourceKinds.includes("instrument")) {
      throw new Error("Protocol or instrument file was not persisted.");
    }
    console.log("PASS protocol and instrument storage");

    const day1 = await uploadDataset(
      "Day 1 Form v1",
      "day1.csv",
      "x,y,facility_type\n1,3,HC II\n2,5,HC III\n3,7,HC III\n"
    );
    const day2 = await uploadDataset(
      "Day 2 Form v2",
      "day2.csv",
      "predictor,outcome,facility_level\n4,9,Health Centre III\n5,11,HCII\n6,13,Hospital\n"
    );
    console.log("PASS two source datasets");

    const [day1Profile, day2Profile] = await Promise.all([
      request(`/projects/${projectId}/datasets/${day1}/profile`, {}, [200]),
      request(`/projects/${projectId}/datasets/${day2}/profile`, {}, [200])
    ]);
    if (day1Profile.payload.profile.rowCount !== 3 || day2Profile.payload.profile.rowCount !== 3) {
      throw new Error("Dataset profiling returned an unexpected row count.");
    }
    console.log("PASS dataset profiling");

    const schemaComparison = await request(
      `/projects/${projectId}/schema-comparison`,
      {
        method: "POST",
        body: JSON.stringify({
          leftDatasetVersionId: day1,
          rightDatasetVersionId: day2,
          leftVariables: day1Profile.payload.profile.variables.map((variable) => ({
            variableName: variable.variableName,
            label: variable.label,
            dataType: variable.dataType,
            responseChoices: variable.responseChoices
          })),
          rightVariables: day2Profile.payload.profile.variables.map((variable) => ({
            variableName: variable.variableName,
            label: variable.label,
            dataType: variable.dataType,
            responseChoices: variable.responseChoices
          }))
        })
      },
      [200]
    );
    if (!schemaComparison.payload.comparison) {
      throw new Error("Schema comparison did not return a comparison object.");
    }
    console.log("PASS form-version schema comparison");

    const appended = await request(
      `/projects/${projectId}/datasets/append`,
      {
        method: "POST",
        body: JSON.stringify({
          sourceDatasetVersionIds: [day1, day2],
          label: "Harmonised analysis dataset",
          reason: "Smoke test of changing Kobo form versions.",
          mappings: [
            { sourceDatasetVersionId: day1, sourceVariable: "x", targetVariable: "x" },
            { sourceDatasetVersionId: day1, sourceVariable: "y", targetVariable: "y" },
            {
              sourceDatasetVersionId: day1,
              sourceVariable: "facility_type",
              targetVariable: "facility_level",
              categoryMap: { "HC II": "HCII", "HC III": "HCIII" }
            },
            { sourceDatasetVersionId: day2, sourceVariable: "predictor", targetVariable: "x" },
            { sourceDatasetVersionId: day2, sourceVariable: "outcome", targetVariable: "y" },
            {
              sourceDatasetVersionId: day2,
              sourceVariable: "facility_level",
              targetVariable: "facility_level",
              categoryMap: { "Health Centre III": "HCIII" }
            }
          ]
        })
      },
      [201]
    );
    const analysisDatasetId = appended.payload.datasetVersionId;
    if (appended.payload.rowCount !== 6) throw new Error("Harmonised dataset row count is not 6.");
    console.log("PASS harmonised append");

    const specification = {
      version: `smoke-${Date.now()}`,
      researchQuestions: [
        {
          id: "rq1",
          text: "Is x associated with y?",
          objectiveType: "association",
          outcomes: [
            {
              concept: "Outcome y",
              datasetVariable: "y",
              variableType: "continuous",
              mappingStatus: "direct_match"
            }
          ],
          predictors: [
            {
              concept: "Predictor x",
              datasetVariable: "x",
              variableType: "continuous",
              mappingStatus: "direct_match"
            }
          ],
          covariates: [],
          estimand: null
        }
      ],
      studyDesign: "cross_sectional",
      unitOfAnalysis: "observation",
      repeatedMeasures: false,
      clustered: false,
      clusterVariable: null,
      surveyWeights: false,
      weightVariable: null,
      stratified: false,
      strataVariable: null,
      samplingDesign: null,
      missingDataPlan: "Complete case",
      statedAnalysisPlan: null
    };

    await request(
      `/projects/${projectId}/study-specification`,
      { method: "PUT", body: JSON.stringify({ specification }) },
      [200]
    );
    console.log("PASS study specification");

    await request(
      `/projects/${projectId}/variable-mappings`,
      {
        method: "PUT",
        body: JSON.stringify({
          mappings: [
            {
              id: `map_${crypto.randomUUID().replaceAll("-", "")}`,
              researchConcept: "Outcome y",
              datasetVariable: "y",
              mappingStatus: "direct_match",
              evidence: ["Smoke test confirmed mapping."],
              confirmed: true
            },
            {
              id: `map_${crypto.randomUUID().replaceAll("-", "")}`,
              researchConcept: "Predictor x",
              datasetVariable: "x",
              mappingStatus: "direct_match",
              evidence: ["Smoke test confirmed mapping."],
              confirmed: true
            }
          ]
        })
      },
      [200]
    );
    console.log("PASS variable mappings");

    const candidates = await request(
      `/projects/${projectId}/method-candidates`,
      {},
      [200]
    );
    const methodIds = candidates.payload.selections[0].candidates.map((item) => item.methodId);
    if (!methodIds.includes("linear_regression")) {
      throw new Error("Linear regression was not returned as a valid candidate.");
    }
    console.log("PASS deterministic method selection");

    const plan = await request(
      `/projects/${projectId}/analysis-plan`,
      {
        method: "POST",
        body: JSON.stringify({
          versionId: "smoke-plan-v1",
          datasetVersionId: analysisDatasetId,
          status: "planned_before_analysis",
          analyses: [
            {
              id: "analysis-1",
              researchQuestionId: "rq1",
              outcome: "y",
              predictors: ["x"],
              covariates: [],
              candidateMethodIds: methodIds,
              selectedMethodId: "linear_regression",
              requiredDecisions: [],
              warnings: [],
              diagnostics: ["residuals", "influence", "multicollinearity"],
              addedAfterLock: false
            }
          ]
        })
      },
      [201]
    );

    const locked = await request(
      `/projects/${projectId}/analysis-plan/${plan.payload.plan.id}/lock`,
      { method: "POST" },
      [200]
    );
    if (!locked.payload.plan.lockHash) throw new Error("Analysis plan lock hash was not created.");
    console.log("PASS analysis plan lock");

    const job = await request(
      `/projects/${projectId}/analysis-jobs`,
      {
        method: "POST",
        body: JSON.stringify({
          datasetVersionId: analysisDatasetId,
          analysisPlanId: plan.payload.plan.id,
          methodId: "linear_regression",
          outcome: "y",
          predictors: ["x"],
          covariates: [],
          filters: []
        })
      },
      [202]
    );

    let state = job.payload.state;
    for (let attempt = 0; attempt < 80 && state !== "complete"; attempt += 1) {
      if (state === "failed" || state === "cancelled") {
        throw new Error(`Analysis ended in state ${state}.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const current = await request(`/analysis-jobs/${job.payload.jobId}`, {}, [200]);
      state = current.payload.state;
    }
    if (state !== "complete") throw new Error(`Analysis did not complete. Final state: ${state}`);
    console.log("PASS queued Python execution");

    const result = await request(`/analysis-jobs/${job.payload.jobId}/result`, {}, [200]);
    const slope = result.payload.result.estimates.find((item) => item.term === "x")?.estimate;
    if (typeof slope !== "number" || Math.abs(slope - 2) > 1e-6) {
      throw new Error(`Unexpected regression slope: ${slope}`);
    }
    if (result.payload.result.software.engine !== "python") {
      throw new Error("Statistical result was not produced by the Python engine.");
    }
    console.log("PASS structured statistical result");

    const audit = await request(`/projects/${projectId}/audit`, {}, [200]);
    const actions = audit.payload.events.map((event) => event.action);
    if (!actions.includes("datasets_harmonised_and_appended") || !actions.includes("analysis_completed")) {
      throw new Error("Expected provenance events are missing from the audit trail.");
    }
    console.log("PASS audit provenance");

    await request(`/projects/${projectId}`, { method: "DELETE" }, [204]);
    projectId = null;
    await request("/account", { method: "DELETE" }, [204]);
    cookies.clear();

    const protectedAfterCleanup = await request("/projects", {}, [401]);
    if (protectedAfterCleanup.payload?.error?.code !== "UNAUTHENTICATED") {
      throw new Error("Deleted smoke session still had access to protected project data.");
    }

    console.log("PASS cleanup and session invalidation");
    console.log("METHODOME E2E PASS");
  } catch (error) {
    console.error("METHODOME E2E FAIL");
    console.error(error instanceof Error ? error.message : error);
    if (projectId) {
      try {
        await request(`/projects/${projectId}`, { method: "DELETE" }, [204]);
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

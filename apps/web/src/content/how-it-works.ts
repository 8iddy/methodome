export interface WorkflowStep {
  number: string;
  id: string;
  title: string;
  summary: string;
  details: string[];
  output: string;
}

export const workflowSteps: WorkflowStep[] = [
  {
    number: "01",
    id: "research-inputs",
    title: "Research inputs",
    summary:
      "A Methodome project starts with the evidence that defines the study.",
    details: [
      "Upload a research protocol.",
      "Add questionnaires, instruments or codebooks when available.",
      "Upload the dataset or datasets used for analysis."
    ],
    output: "Project source record"
  },
  {
    number: "02",
    id: "study-understanding",
    title: "Study understanding",
    summary:
      "Methodome represents the research intent before selecting a statistical method.",
    details: [
      "Identify research questions and objectives.",
      "Record the study design and unit of analysis.",
      "Represent outcomes, exposures, predictors and design features.",
      "Keep extracted information available for researcher review."
    ],
    output: "Study specification"
  },
  {
    number: "03",
    id: "data-layer",
    title: "Data layer",
    summary:
      "Source data stays unchanged while Methodome profiles and prepares analysis-ready versions.",
    details: [
      "Profile variables, types, missing values, ranges and categories.",
      "Compare multiple form versions where fieldwork changed over time.",
      "Create harmonised or derived datasets without overwriting the source.",
      "Keep parent dataset lineage and checksums."
    ],
    output: "Versioned dataset"
  },
  {
    number: "04",
    id: "variable-mapping",
    title: "Variable mapping",
    summary:
      "Research concepts are connected to observable fields in the dataset.",
    details: [
      "Use instrument metadata and codebooks where available.",
      "Show candidate dataset variables and the evidence behind each mapping.",
      "Require review for uncertain mappings.",
      "Keep concepts that are not represented in the data visible."
    ],
    output: "Confirmed mappings"
  },
  {
    number: "05",
    id: "method-selection",
    title: "Method selection",
    summary:
      "The method registry checks which analyses fit the confirmed study specification.",
    details: [
      "Generate candidate methods for each research question.",
      "Apply deterministic eligibility rules.",
      "Show maturity, required checks, warnings and unresolved decisions.",
      "Keep unsupported methods out of automatic execution."
    ],
    output: "Candidate methods"
  },
  {
    number: "06",
    id: "analysis-plan",
    title: "Analysis plan",
    summary:
      "The researcher reviews the proposed analyses before computation begins.",
    details: [
      "Review outcome, predictors, covariates and selected dataset version.",
      "Approve the selected method for each research question.",
      "Record warnings and required diagnostics.",
      "Lock the plan when it is ready."
    ],
    output: "Locked plan + SHA-256"
  },
  {
    number: "07",
    id: "computation",
    title: "Deterministic computation",
    summary:
      "Approved jobs move from the web application to the statistical execution layer.",
    details: [
      "The API creates an analysis job.",
      "The Methodome queue coordinates execution.",
      "The API Worker calls the Python statistics Worker.",
      "Python or R produces the statistical values."
    ],
    output: "Structured statistical result"
  },
  {
    number: "08",
    id: "review",
    title: "Review and diagnostics",
    summary:
      "A result is reviewed together with its assumptions, warnings and execution record.",
    details: [
      "Inspect estimates and confidence intervals.",
      "Review diagnostic statuses and warnings.",
      "Inspect the method and software metadata.",
      "Trace the result to the dataset and analysis plan."
    ],
    output: "Reviewed result"
  },
  {
    number: "09",
    id: "reporting",
    title: "Reporting and provenance",
    summary:
      "Outputs remain linked to the decisions and data that produced them.",
    details: [
      "Prepare research-facing summaries from verified structured results.",
      "Retain technical information for reproduction.",
      "Keep audit events, dataset lineage and plan history available.",
      "Mark later analyses as exploratory when they were added after the plan lock."
    ],
    output: "Research output + provenance"
  }
];

export const systemFlow = [
  {
    label: "Research intent",
    detail: "Protocol, instruments, questions and design"
  },
  {
    label: "Methodome research layer",
    detail: "Study specification, dataset profile and variable mapping"
  },
  {
    label: "Method rules",
    detail: "Candidate methods, eligibility rules and required checks"
  },
  {
    label: "Researcher review",
    detail: "Confirm mappings, approve analyses and lock the plan"
  },
  {
    label: "Deterministic computation",
    detail: "Queued Python or R execution"
  },
  {
    label: "Results",
    detail: "Diagnostics, structured output, audit and provenance"
  }
];

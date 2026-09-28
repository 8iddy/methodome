export interface DocumentationSection {
  id: string;
  title: string;
  summary: string;
  points: string[];
}

export const documentationSections: DocumentationSection[] = [
  {
    id: "what-methodome-is",
    title: "What Methodome is",
    summary:
      "Methodome is a research analysis workspace that connects research intent to an executable and reviewable analysis process.",
    points: [
      "A project can contain protocols, instruments, codebooks, datasets, study specifications, variable mappings, analysis plans, results and audit records.",
      "Methodome is structured research software. It is not a chat interface placed on top of a dataset.",
      "Language models may help extract, map, suggest and explain. They are not the numerical source of statistical results.",
      "Statistical values are produced by deterministic statistical software."
    ]
  },
  {
    id: "research-workflow",
    title: "Research workflow",
    summary:
      "The workspace follows a defined sequence so that research decisions remain visible from source material to result.",
    points: [
      "Protocol and research instruments define the study context.",
      "Datasets are uploaded and profiled before analysis planning.",
      "Study design and research questions are represented in a study specification.",
      "Research concepts are mapped to dataset variables and uncertain mappings require researcher review.",
      "Candidate methods are checked against the Methodome method registry.",
      "The researcher reviews and locks an analysis plan before planned analyses are run.",
      "Analysis jobs run through deterministic computation and return structured results, diagnostics and provenance."
    ]
  },
  {
    id: "files-and-data",
    title: "Protocols, instruments and data",
    summary:
      "Research source files and datasets are stored separately from application metadata.",
    points: [
      "Protocols, instruments, codebooks and datasets are stored in the private Methodome R2 bucket.",
      "Application metadata, authentication records, project state, analysis plans, jobs, results and audit records are stored in D1.",
      "Original datasets remain immutable.",
      "Cleaning and harmonisation create derived dataset versions instead of overwriting the source file.",
      "Dataset lineage records which earlier versions were used to create each derived dataset."
    ]
  },
  {
    id: "form-versions",
    title: "Form version harmonisation",
    summary:
      "Methodome can compare datasets collected from different versions of the same form.",
    points: [
      "Schema comparison identifies matching, changed, added and removed variables.",
      "Mappings can be marked as direct, probable, uncertain or unmatched.",
      "Uncertain mappings should be reviewed before datasets are combined.",
      "The harmonised dataset is stored as a new derived dataset version with parent lineage and a transformation record.",
      "The matching logic avoids unsafe fuzzy matching of numeric category labels such as HC II and HC III."
    ]
  },
  {
    id: "dataset-profiling",
    title: "Dataset profiling",
    summary:
      "Uploaded datasets are profiled before analysis so the researcher can inspect their structure.",
    points: [
      "Profiles include row count, column count, detected data types, missing values, unique values and ranges or categories where available.",
      "Profiling is performed by the deterministic statistics service.",
      "Profiling output supports later variable mapping and method checks.",
      "General interactive cleaning rules remain a post-MVP area and should not be presented as complete."
    ]
  },
  {
    id: "study-specification",
    title: "Study specification",
    summary:
      "The study specification records the research design information that constrains valid analysis choices.",
    points: [
      "It can contain one or more research questions.",
      "Each research question can record outcomes, predictors, covariates, objective type and estimand.",
      "Study-level fields include design, unit of analysis, repeated measures, clustering, survey weights, stratification, sampling design and missing-data plan.",
      "Protocol extraction may prefill these fields, but researcher review remains part of the workflow."
    ]
  },
  {
    id: "variable-mapping",
    title: "Variable mapping",
    summary:
      "Methodome separates research concepts from dataset field names.",
    points: [
      "A protocol may refer to a concept such as reporting completeness while the dataset stores that concept as a field such as Q14a_pct.",
      "Mapping evidence can come from instrument metadata, codebooks, exact field relations and reviewed semantic suggestions.",
      "Mapping status should reflect the available evidence rather than an unsupported model probability.",
      "An uncertain mapping must not silently become confirmed.",
      "Primary analysis variables should be reviewed before analysis planning proceeds."
    ]
  },
  {
    id: "method-registry",
    title: "Method registry",
    summary:
      "The method registry stores rules about statistical methods and separates execution capability from automated recommendation.",
    points: [
      "Validated means the method has passed the required computational and method-selection checks for the validated boundary.",
      "Supported means execution and diagnostics exist but automatic recommendation is restricted.",
      "Experimental means researcher-directed use may be available but additional review is required.",
      "A method being executable does not by itself mean Methodome should recommend it automatically."
    ]
  },
  {
    id: "current-methods",
    title: "Current executable methods",
    summary:
      "The MVP execution boundary is intentionally smaller than the long-term method catalogue.",
    points: [
      "Descriptive statistics",
      "Pearson correlation",
      "Spearman correlation",
      "Chi-square",
      "Fisher exact",
      "Linear regression",
      "Binary logistic regression"
    ]
  },
  {
    id: "analysis-plans",
    title: "Analysis plans",
    summary:
      "The analysis plan links each research question to the dataset version, mapped variables, candidate methods and selected method.",
    points: [
      "The researcher reviews the plan before execution.",
      "A plan can be locked and recorded with a SHA-256 hash.",
      "Analyses in the locked plan are treated as planned analyses.",
      "Analyses added after the lock should remain distinguishable as exploratory.",
      "Warnings and required methodological decisions remain attached to the planned analysis."
    ]
  },
  {
    id: "execution",
    title: "Analysis execution",
    summary:
      "Methodome separates job orchestration from statistical calculation.",
    points: [
      "The browser submits the request to methodome-api.",
      "methodome-api sends the job to the methodome-analysis Queue.",
      "The API Worker consumes the queue message.",
      "The API Worker calls the methodome-stats Python Worker through a Cloudflare service binding.",
      "The Python Worker performs deterministic statistical computation.",
      "The API Worker records the structured result, provenance and audit information in D1."
    ]
  },
  {
    id: "results",
    title: "Results and diagnostics",
    summary:
      "Analysis results are stored as structured data rather than free-form model output.",
    points: [
      "Results can include estimates, standard errors, test statistics, confidence intervals, p values and exponentiated estimates where relevant.",
      "Diagnostics are returned with an explicit status such as passed, review, failed or not applicable.",
      "Warnings remain attached to the analysis result.",
      "The statistical engine and package versions are recorded with the result."
    ]
  },
  {
    id: "audit-and-provenance",
    title: "Audit and provenance",
    summary:
      "Research actions and analysis outputs are designed to remain traceable.",
    points: [
      "Audit events record project actions and can be linked through hashes.",
      "Dataset checksums and lineage make source and derived data distinguishable.",
      "Analysis plans can carry version and lock information.",
      "Results can be traced back to the dataset version, method and execution record that produced them."
    ]
  },
  {
    id: "processing-policy",
    title: "Project processing policy",
    summary:
      "Projects can define rules for how research material may be processed.",
    points: [
      "The project can record its data class and whether identifiable information is present.",
      "External model processing can be restricted by project policy.",
      "Row-level quantitative data does not need to be sent to a language model for statistical analysis.",
      "Sensitive qualitative text requires separate handling and is outside the current MVP workflow."
    ]
  },
  {
    id: "model-role",
    title: "Role of language models",
    summary:
      "Language models support research interpretation but do not replace deterministic statistical software.",
    points: [
      "A model may extract study information from research documents.",
      "A model may suggest possible mappings between research concepts and dataset variables.",
      "A model may assist with analysis planning inside the permitted method boundary.",
      "A model may explain verified statistical output.",
      "A model must not calculate, alter or invent the statistical values reported by Methodome."
    ]
  },
  {
    id: "current-limits",
    title: "Current MVP limits",
    summary:
      "The v0.1.0 MVP is a working quantitative release, not the full long-term product.",
    points: [
      "Email verification and password-reset delivery still require production email configuration.",
      "Qualitative and mixed-methods workflows are not yet implemented.",
      "Bayesian and structural equation modelling workflows are not yet implemented.",
      "General interactive data cleaning is still limited.",
      "The current production dataset upload path supports CSV. Protocol and research-document text extraction supports text-based PDF, DOCX, TXT and Markdown through Workers AI document conversion.",
      "Full DOCX, PDF, HTML, LaTeX and Quarto reporting remains post-MVP work."
    ]
  }
];

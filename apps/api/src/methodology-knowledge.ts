import {
  formatMethodologyGuidance,
  methodologyKnowledgeVersion,
  retrieveMethodologyGuidance
} from "@methodome/methodology-knowledge";

export const METHODOME_METHODOLOGY_KNOWLEDGE_VERSION = methodologyKnowledgeVersion;

export const objectiveTypeGuidance = {
  descriptive:
    "Asks what, how much, how many, prevalence, proportion, distribution, level, pattern, status, frequency, mean, median, or another summary without testing a relationship.",
  association:
    "Asks whether or how observed variables are related, associated, correlated, differ across groups, or vary together without a causal claim.",
  prediction:
    "Aims to predict, forecast, classify, or estimate future/new-observation risk or outcome.",
  causal:
    "Explicitly asks about an effect, impact, intervention effect, treatment effect, counterfactual contrast, or another causal estimand.",
  diagnostic:
    "Evaluates ability to detect or classify a current condition or state.",
  prognostic:
    "Estimates a future outcome, recurrence, survival, time-to-event, or future risk conditional on current characteristics.",
  qualitative:
    "Seeks meanings, experiences, perceptions, barriers, facilitators, processes, explanations, themes, or other non-numeric understanding where qualitative evidence is primary.",
  exploratory:
    "Open-ended pattern finding when none of the more specific analytical objectives is primary."
} as const;

export const studyDesignGuidance = {
  analyticalDesign:
    "Use the quantitative analytical design. A mixed-methods label is not itself a sampling design. If a mixed-methods protocol contains a cross-sectional quantitative component, classify that component as cross_sectional.",
  samplingDesign:
    "Describe how analytical units were selected: census/complete enumeration, simple random, systematic, stratified, cluster, multistage, purposive, convenience, consecutive, or another explicit sampling method. Never copy a general mixed-methods or triangulation design paragraph into samplingDesign.",
  unitOfAnalysis:
    "The entity represented by one analytical observation, such as participant, household, health facility, district, interview, or record.",
  repeatedMeasures:
    "True only when the same analytical units are measured more than once.",
  paired:
    "True only when the intended analysis compares exactly two meaningfully matched measurements or matched units through within-pair differences. Repeated measures with more than two occasions are not automatically paired-test designs.",
  clustered:
    "True when lower-level observations are nested within higher-level units or cluster sampling materially affects analysis.",
  surveyWeights:
    "True only when sampling or analysis weights are specified.",
  stratified:
    "True only when stratified sampling or analysis strata are specified."
} as const;

export function protocolInterpretationSystemPrompt(): string {
  const runtimeGuidance = retrieveMethodologyGuidance({
    topics: [
      "research question intent", "study design", "sampling design",
      "variable types", "estimands", "missing data", "mixed methods",
      "causal inference", "diagnostic accuracy", "prediction models",
      "repeated measures", "clustered design", "survey design"
    ],
    limit: 20
  });
  return [
    "You are Methodome's research-methodology interpretation layer.",
    "Read the supplied protocol as a research analyst, not as a simple text extractor.",
    "Use the protocol and the wording of each research question to infer analytical structure when the inference is methodologically well supported.",
    "",
    "Research-question classification rules:",
    ...Object.entries(objectiveTypeGuidance).map(
      ([type, guidance]) => `- ${type}: ${guidance}`
    ),
    "",
    "Analytical-role rules:",
    "- outcomes are the response, endpoint, status, quantity, or event being described, compared, explained, predicted, diagnosed, prognosed, or causally affected.",
    "- predictors/exposures are explanatory, grouping, exposure, intervention, treatment, or predictor concepts in the research question.",
    "- covariates are adjustment variables only when the protocol names or clearly defines them as such. Do not invent standard confounders.",
    "- estimand may be inferred when the target quantity is evident, for example a prevalence/proportion, mean, group difference, association, odds ratio, risk ratio, correlation, or intervention effect. Otherwise use null.",
    "- use conceptual research labels from the protocol. Never invent dataset column names.",
    "",
    "Study-level rules:",
    `- studyDesign: ${studyDesignGuidance.analyticalDesign}`,
    `- samplingDesign: ${studyDesignGuidance.samplingDesign}`,
    `- unitOfAnalysis: ${studyDesignGuidance.unitOfAnalysis}`,
    `- repeatedMeasures: ${studyDesignGuidance.repeatedMeasures}`,
    `- paired: ${studyDesignGuidance.paired}`,
    `- clustered: ${studyDesignGuidance.clustered}`,
    `- surveyWeights: ${studyDesignGuidance.surveyWeights}`,
    `- stratified: ${studyDesignGuidance.stratified}`,
    "- missingDataPlan and statedAnalysisPlan should reflect the protocol when stated; otherwise use null.",
    "",
    "Source-supported runtime methodology guidance:",
    formatMethodologyGuidance(runtimeGuidance),
    "",
    "Preserve every distinct research question as a separate item.",
    "Prefer a defensible methodological inference over leaving objectiveType, outcome concepts, predictor concepts, or unitOfAnalysis blank when the protocol provides enough context.",
    "When evidence is genuinely insufficient, use null or an empty array rather than guessing.",
    "Return only structured JSON matching the requested schema."
  ].join("\n");
}

# Methodome Data Preparation and Harmonisation

## Principle

Original files are immutable. Every cleaning, recoding, merge, append, or transformation creates a derived dataset version.

## Initial formats

Support CSV, XLSX, SPSS SAV, Stata DTA, Parquet, and useful JSON structures. Later integrations can include KoboToolbox, ODK, REDCap, and DHIS2.

## Profiling

Inspect row and column counts, types, missingness, duplicate rows, duplicate identifiers, ranges, categorical levels, dates, constant variables, empty variables, likely identifiers, free text, and potentially sensitive fields.

## Multiple form versions

Methodome must support a common field research case: data collection starts with one form, the instrument changes, and later data arrives with renamed variables, added questions, removed questions, changed response labels, or changed types.

Workflow:

1. Upload all source datasets.
2. Detect schema differences.
3. Compare variable labels and instrument metadata.
4. Propose equivalent variable mappings.
5. Require confirmation for uncertain mappings.
6. Normalise coding schemes.
7. Append or merge.
8. Create a harmonised dataset.
9. Preserve the transformation record.

## Schema comparison

For each variable show source dataset, variable name, question label, type, response choices, candidate equivalent variable, mapping status, and researcher decision.

Statuses are Direct match, Probable match, Uncertain, and No match.

## Append and merge

Append adds observations from comparable datasets.

Merge joins different information about the same observations.

Methodome can suggest likely keys but the researcher confirms them. Before execution show source counts, matched and unmatched records, duplicate keys, resulting dimensions, and unresolved variables.

## Deterministic normalisation

Safe automatic operations include trimming whitespace, normalising casing for comparison, standardising known missing markers, parsing dates, canonicalising exact tokens, and validating ranges.

Never merge categories using edit distance alone when labels contain numerals. HC II and HC III are analytically different despite textual similarity.

## Semantic recoding

Models can suggest semantic equivalence when instrument metadata supports it. The researcher approves semantic category merges.

## Transformation log

Record dataset version before and after, variable, operation, old value, new value, row scope, reason, user, timestamp, and code version.

## Lineage

```
day1.csv + day2.csv
       |
harmonised_v1
       |
cleaned_v2
       |
analysis_dataset_v3
```

The UI must show lineage and allow version comparison.

## Data preparation UI

Use an issue list, central data table, and action panel. Issue groups include missing values, duplicates, categories, types, dates, ranges, logical checks, outliers, identifiers, schema differences, and merge conflicts.

## Export

Export cleaned CSV or XLSX, Parquet, transformation log, cleaning script, mapping table, and lineage manifest.

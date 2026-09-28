# Synthetic Facility Reporting Study Protocol

## Study title

Association between reporting completeness and medicine stockouts in health facilities

## Purpose

This synthetic study is used to test the Methodome guided quantitative workflow. It contains no participant data and no sensitive information.

## Objectives

1. Estimate the proportion of facilities that experienced a medicine stockout during the previous 30 days.
2. Assess the association between reporting completeness and medicine stockout status.
3. Assess the association between reporting completeness and the number of days out of stock.

## Research questions

1. What proportion of health facilities experienced a medicine stockout during the previous 30 days?
2. Is reporting completeness associated with medicine stockout status?
3. Is reporting completeness associated with the number of days out of stock?

## Hypotheses

Facilities with higher reporting completeness are expected to have lower odds of a medicine stockout and fewer days out of stock.

## Study design

This is a cross-sectional facility survey.

The unit of analysis is the health facility. Each facility appears once in the dataset. There are no repeated observations.

The study does not use survey weights, stratification, or cluster-adjusted analysis.

## Study population

The study population is health facilities included in the synthetic Methodome test dataset.

## Variables

### Primary outcome

Medicine stockout status during the previous 30 days.

### Secondary outcome

Number of days out of stock during the previous 30 days.

### Primary exposure

Reporting completeness, expressed as a percentage from 0 to 100.

### Additional descriptive variables

Facility level and monthly patient volume.

## Missing data

The synthetic dataset is complete. If missing values are introduced during testing, the planned first-pass approach is complete-case analysis for the affected model.

## Analysis plan

The first research question will be answered with descriptive statistics.

For the second research question, binary logistic regression will be used with medicine stockout status as the binary outcome and reporting completeness as the predictor.

For the third research question, linear regression will be used with days out of stock as the continuous outcome and reporting completeness as the predictor.

Model diagnostics and Methodome warnings will be reviewed before results are accepted.

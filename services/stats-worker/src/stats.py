from __future__ import annotations

import csv
import io
import math
from typing import Any

import numpy as np
import scipy
from scipy import optimize, stats

ENGINE_VERSION = "python-worker-0.1.0"


def _rows(csv_text: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(csv_text))
    rows = [dict(row) for row in reader]
    if not rows:
        raise ValueError("Dataset contains no data rows.")
    return rows


def _missing(value: Any) -> bool:
    if value is None:
        return True
    text = str(value).strip().lower()
    return text in {"", "na", "n/a", "null", "none", "missing", "."}


def _float(value: Any) -> float:
    if _missing(value):
        raise ValueError("Missing value.")
    return float(str(value).strip())


def _binary(value: Any) -> float:
    if _missing(value):
        raise ValueError("Missing value.")
    text = str(value).strip().lower()
    if text in {"1", "yes", "y", "true", "case", "positive"}:
        return 1.0
    if text in {"0", "no", "n", "false", "control", "negative"}:
        return 0.0
    numeric = float(text)
    if numeric in {0.0, 1.0}:
        return numeric
    raise ValueError(f"Binary outcome contains unsupported value: {value}")


def _column_is_numeric(rows: list[dict[str, str]], name: str) -> bool:
    observed = [row.get(name) for row in rows if not _missing(row.get(name))]
    if not observed:
        return False
    try:
        for value in observed:
            float(str(value).strip())
        return True
    except ValueError:
        return False


def _design_matrix(
    rows: list[dict[str, str]],
    variables: list[str],
) -> tuple[np.ndarray, list[str], list[int]]:
    usable = list(range(len(rows)))
    for variable in variables:
        usable = [i for i in usable if not _missing(rows[i].get(variable))]

    terms = ["Intercept"]
    columns: list[np.ndarray] = [np.ones(len(usable), dtype=float)]

    for variable in variables:
        values = [rows[i].get(variable) for i in usable]
        if _column_is_numeric([rows[i] for i in usable], variable):
            columns.append(np.array([float(str(v).strip()) for v in values], dtype=float))
            terms.append(variable)
            continue

        levels = sorted({str(v).strip() for v in values})
        if len(levels) < 2:
            raise ValueError(f"Categorical predictor {variable} has fewer than two observed levels.")
        reference = levels[0]
        for level in levels[1:]:
            columns.append(
                np.array([1.0 if str(v).strip() == level else 0.0 for v in values], dtype=float)
            )
            terms.append(f"{variable}[{level}]")

    return np.column_stack(columns), terms, usable


def _normal_ci(estimate: float, se: float, level: float = 0.95) -> dict[str, float]:
    z = stats.norm.ppf(0.5 + level / 2)
    return {
        "level": level,
        "lower": float(estimate - z * se),
        "upper": float(estimate + z * se),
    }


def _result(
    method: str,
    n: int,
    estimates: list[dict[str, Any]],
    diagnostics: list[dict[str, Any]],
    warnings: list[str] | None = None,
    package: str = "scipy",
) -> dict[str, Any]:
    return {
        "methodId": method,
        "n": n,
        "estimates": estimates,
        "diagnostics": diagnostics,
        "warnings": warnings or [],
        "software": {
            "engine": "python",
            "engineVersion": ENGINE_VERSION,
            "package": package,
            "packageVersion": scipy.__version__,
        },
    }


def descriptive_statistics(rows: list[dict[str, str]], variables: list[str]) -> dict[str, Any]:
    estimates: list[dict[str, Any]] = []
    warnings: list[str] = []
    n_max = 0

    for variable in variables:
        values = []
        for row in rows:
            try:
                values.append(_float(row.get(variable)))
            except (ValueError, TypeError):
                continue
        n_max = max(n_max, len(values))
        if not values:
            warnings.append(f"No numeric observations available for {variable}.")
            continue
        arr = np.asarray(values, dtype=float)
        estimates.extend(
            [
                {"term": f"{variable}.mean", "estimate": float(np.mean(arr))},
                {"term": f"{variable}.sd", "estimate": float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0},
                {"term": f"{variable}.median", "estimate": float(np.median(arr))},
                {"term": f"{variable}.min", "estimate": float(np.min(arr))},
                {"term": f"{variable}.max", "estimate": float(np.max(arr))},
            ]
        )

    return _result(
        "descriptive_statistics",
        n_max,
        estimates,
        [{"id": "numeric_complete", "label": "Numeric observations available", "status": "passed"}],
        warnings,
        package="numpy",
    )


def correlation(rows: list[dict[str, str]], x: str, y: str, method: str) -> dict[str, Any]:
    pairs = []
    for row in rows:
        try:
            pairs.append((_float(row.get(x)), _float(row.get(y))))
        except (ValueError, TypeError):
            continue
    if len(pairs) < 3:
        raise ValueError("Correlation requires at least three complete numeric pairs.")

    a = np.asarray([p[0] for p in pairs], dtype=float)
    b = np.asarray([p[1] for p in pairs], dtype=float)

    if method == "pearson_correlation":
        res = stats.pearsonr(a, b)
        coefficient = float(res.statistic)
        p_value = float(res.pvalue)
    else:
        res = stats.spearmanr(a, b)
        coefficient = float(res.statistic)
        p_value = float(res.pvalue)

    ci = None
    if method == "pearson_correlation" and len(pairs) > 3 and abs(coefficient) < 1:
        z = np.arctanh(coefficient)
        se = 1 / math.sqrt(len(pairs) - 3)
        crit = stats.norm.ppf(0.975)
        ci = {
            "level": 0.95,
            "lower": float(np.tanh(z - crit * se)),
            "upper": float(np.tanh(z + crit * se)),
        }

    estimate: dict[str, Any] = {
        "term": f"{x} ~ {y}",
        "estimate": coefficient,
        "pValue": p_value,
    }
    if ci:
        estimate["confidenceInterval"] = ci

    return _result(
        method,
        len(pairs),
        [estimate],
        [
            {
                "id": "complete_pairs",
                "label": "Complete observation pairs",
                "status": "passed",
                "value": len(pairs),
            }
        ],
    )


def contingency(rows: list[dict[str, str]], outcome: str, predictor: str, method: str) -> dict[str, Any]:
    complete = [
        (str(row.get(outcome)).strip(), str(row.get(predictor)).strip())
        for row in rows
        if not _missing(row.get(outcome)) and not _missing(row.get(predictor))
    ]
    if not complete:
        raise ValueError("No complete observations are available for the contingency table.")

    outcome_levels = sorted({a for a, _ in complete})
    predictor_levels = sorted({b for _, b in complete})
    table = np.zeros((len(outcome_levels), len(predictor_levels)), dtype=int)
    for a, b in complete:
        table[outcome_levels.index(a), predictor_levels.index(b)] += 1

    if method == "fisher_exact":
        if table.shape != (2, 2):
            raise ValueError("Fisher exact test currently requires a 2 by 2 table.")
        odds_ratio, p_value = stats.fisher_exact(table)
        return _result(
            method,
            len(complete),
            [
                {
                    "term": f"{outcome} x {predictor}",
                    "estimate": float(odds_ratio),
                    "pValue": float(p_value),
                    "exponentiatedEstimate": float(odds_ratio),
                }
            ],
            [
                {
                    "id": "table_dimensions",
                    "label": "2 by 2 table",
                    "status": "passed",
                    "value": "2x2",
                }
            ],
        )

    chi2, p_value, dof, expected = stats.chi2_contingency(table)
    min_expected = float(np.min(expected))
    status = "passed" if min_expected >= 5 else "review"
    return _result(
        method,
        len(complete),
        [
            {
                "term": f"{outcome} x {predictor}",
                "estimate": float(chi2),
                "statistic": float(chi2),
                "pValue": float(p_value),
            }
        ],
        [
            {
                "id": "expected_cell_counts",
                "label": "Minimum expected cell count",
                "status": status,
                "value": min_expected,
                "message": None if status == "passed" else "Some expected cell counts are below 5.",
            },
            {
                "id": "degrees_of_freedom",
                "label": "Degrees of freedom",
                "status": "passed",
                "value": int(dof),
            },
        ],
    )


def linear_regression(
    rows: list[dict[str, str]], outcome: str, predictors: list[str]
) -> dict[str, Any]:
    x, terms, usable = _design_matrix(rows, predictors)
    y_values = []
    final_indices = []
    for matrix_row, i in enumerate(usable):
        try:
            y_values.append(_float(rows[i].get(outcome)))
            final_indices.append(matrix_row)
        except (ValueError, TypeError):
            continue

    x = x[final_indices, :]
    y = np.asarray(y_values, dtype=float)
    n, p = x.shape
    if n <= p:
        raise ValueError("Linear regression requires more complete observations than fitted parameters.")

    beta, _, rank, _ = np.linalg.lstsq(x, y, rcond=None)
    fitted = x @ beta
    residuals = y - fitted
    rss = float(residuals.T @ residuals)
    tss = float(((y - np.mean(y)) ** 2).sum())
    df = n - p
    sigma2 = rss / df
    xtx_inv = np.linalg.pinv(x.T @ x)
    cov = sigma2 * xtx_inv
    se = np.sqrt(np.diag(cov))
    estimates = []

    visible_terms = terms[: len(beta)]
    for i, term in enumerate(visible_terms):
        t_stat = float(beta[i] / se[i]) if se[i] > 0 else math.inf
        p_value = float(2 * stats.t.sf(abs(t_stat), df))
        crit = stats.t.ppf(0.975, df)
        estimates.append(
            {
                "term": term,
                "estimate": float(beta[i]),
                "standardError": float(se[i]),
                "statistic": t_stat,
                "pValue": p_value,
                "confidenceInterval": {
                    "level": 0.95,
                    "lower": float(beta[i] - crit * se[i]),
                    "upper": float(beta[i] + crit * se[i]),
                },
            }
        )

    r2 = 1 - rss / tss if tss > 0 else 0.0
    return _result(
        "linear_regression",
        n,
        estimates,
        [
            {
                "id": "matrix_rank",
                "label": "Design matrix rank",
                "status": "passed" if rank == p else "review",
                "value": int(rank),
            },
            {
                "id": "r_squared",
                "label": "R squared",
                "status": "passed",
                "value": float(r2),
            },
        ],
        package="numpy+scipy",
    )


def logistic_regression(
    rows: list[dict[str, str]], outcome: str, predictors: list[str]
) -> dict[str, Any]:
    x, terms, usable = _design_matrix(rows, predictors)
    y_values = []
    final_indices = []
    for matrix_row, i in enumerate(usable):
        try:
            y_values.append(_binary(rows[i].get(outcome)))
            final_indices.append(matrix_row)
        except (ValueError, TypeError):
            continue

    x = x[final_indices, :]
    y = np.asarray(y_values, dtype=float)
    n, p = x.shape
    events = int(y.sum())
    if n <= p:
        raise ValueError("Logistic regression requires more complete observations than fitted parameters.")
    if events == 0 or events == n:
        raise ValueError("Binary outcome has no variation after missing values are removed.")

    def nll(beta: np.ndarray) -> float:
        eta = np.clip(x @ beta, -35, 35)
        return float(np.sum(np.logaddexp(0, eta) - y * eta))

    def grad(beta: np.ndarray) -> np.ndarray:
        eta = np.clip(x @ beta, -35, 35)
        prob = 1 / (1 + np.exp(-eta))
        return x.T @ (prob - y)

    fit = optimize.minimize(
        nll,
        np.zeros(p, dtype=float),
        jac=grad,
        method="BFGS",
        options={"maxiter": 500, "gtol": 1e-8},
    )

    beta = fit.x
    eta = np.clip(x @ beta, -35, 35)
    prob = 1 / (1 + np.exp(-eta))
    weights = np.clip(prob * (1 - prob), 1e-12, None)
    hessian = x.T @ (x * weights[:, None])
    covariance = np.linalg.pinv(hessian)
    se = np.sqrt(np.diag(covariance))
    estimates = []

    visible_terms = terms[: len(beta)]
    for i, term in enumerate(visible_terms):
        z_stat = float(beta[i] / se[i]) if se[i] > 0 else math.inf
        p_value = float(2 * stats.norm.sf(abs(z_stat)))
        ci = _normal_ci(float(beta[i]), float(se[i]))
        estimates.append(
            {
                "term": term,
                "estimate": float(beta[i]),
                "standardError": float(se[i]),
                "statistic": z_stat,
                "pValue": p_value,
                "confidenceInterval": ci,
                "exponentiatedEstimate": float(math.exp(beta[i])),
            }
        )

    event_ratio = events / n
    warnings = []
    if events < 10 * max(1, p - 1):
        warnings.append("The number of outcome events is low relative to the fitted parameters.")

    return _result(
        "binary_logistic_regression",
        n,
        estimates,
        [
            {
                "id": "convergence",
                "label": "Optimizer convergence",
                "status": "passed" if fit.success else "review",
                "value": bool(fit.success),
                "message": str(fit.message),
            },
            {
                "id": "outcome_events",
                "label": "Outcome events",
                "status": "passed" if 0 < event_ratio < 1 else "failed",
                "value": events,
            },
        ],
        warnings,
        package="numpy+scipy",
    )


def run_analysis(payload: dict[str, Any]) -> dict[str, Any]:
    method = payload.get("methodId")
    csv_text = payload.get("csv")
    if not isinstance(method, str) or not isinstance(csv_text, str):
        raise ValueError("methodId and csv are required.")

    rows = _rows(csv_text)
    outcome = payload.get("outcome")
    predictors = list(payload.get("predictors") or [])
    covariates = list(payload.get("covariates") or [])
    model_variables = predictors + covariates

    if method == "descriptive_statistics":
        variables = list(payload.get("variables") or model_variables or ([outcome] if outcome else []))
        if not variables:
            raise ValueError("Descriptive statistics require at least one variable.")
        return descriptive_statistics(rows, variables)

    if method in {"pearson_correlation", "spearman_correlation"}:
        if not outcome or not predictors:
            raise ValueError("Correlation requires an outcome and one predictor.")
        return correlation(rows, outcome, predictors[0], method)

    if method in {"chi_square", "fisher_exact"}:
        if not outcome or not predictors:
            raise ValueError("Contingency analysis requires an outcome and one predictor.")
        return contingency(rows, outcome, predictors[0], method)

    if method == "linear_regression":
        if not outcome or not model_variables:
            raise ValueError("Linear regression requires an outcome and at least one predictor.")
        return linear_regression(rows, outcome, model_variables)

    if method == "binary_logistic_regression":
        if not outcome or not model_variables:
            raise ValueError("Logistic regression requires an outcome and at least one predictor.")
        return logistic_regression(rows, outcome, model_variables)

    raise ValueError(f"Statistical method is not implemented by the Python runner: {method}")


def harmonise_append(payload: dict[str, Any]) -> dict[str, Any]:
    sources = payload.get("sources")
    mappings = payload.get("mappings")
    if not isinstance(sources, list) or len(sources) < 2:
        raise ValueError("Harmonised append requires at least two source datasets.")
    if not isinstance(mappings, list) or not mappings:
        raise ValueError("Harmonised append requires variable mappings.")

    target_variables: list[str] = []
    mapping_by_source: dict[str, list[dict[str, Any]]] = {}

    for mapping in mappings:
        source_id = str(mapping.get("sourceDatasetVersionId") or "")
        source_variable = str(mapping.get("sourceVariable") or "")
        target_variable = str(mapping.get("targetVariable") or "")
        if not source_id or not source_variable or not target_variable:
            raise ValueError("Every mapping requires sourceDatasetVersionId, sourceVariable and targetVariable.")
        if target_variable not in target_variables:
            target_variables.append(target_variable)
        mapping_by_source.setdefault(source_id, []).append(mapping)

    output_rows: list[dict[str, str]] = []

    for source in sources:
        source_id = str(source.get("datasetVersionId") or "")
        csv_text = source.get("csv")
        if not source_id or not isinstance(csv_text, str):
            raise ValueError("Each source requires datasetVersionId and csv.")

        rows = _rows(csv_text)
        source_mappings = mapping_by_source.get(source_id, [])
        if not source_mappings:
            raise ValueError(f"No mappings were supplied for source dataset {source_id}.")

        for row in rows:
            output: dict[str, str] = {target: "" for target in target_variables}
            for mapping in source_mappings:
                source_variable = str(mapping["sourceVariable"])
                target_variable = str(mapping["targetVariable"])
                raw = row.get(source_variable)
                value = "" if raw is None else str(raw)
                category_map = mapping.get("categoryMap") or {}
                if value in category_map:
                    value = str(category_map[value])
                output[target_variable] = value
            output_rows.append(output)

    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=target_variables, lineterminator="\n")
    writer.writeheader()
    writer.writerows(output_rows)

    return {
        "csv": buffer.getvalue(),
        "rowCount": len(output_rows),
        "columnCount": len(target_variables),
        "columns": target_variables,
    }


def profile_csv(csv_text: str) -> dict[str, Any]:
    rows = _rows(csv_text)
    columns = list(rows[0].keys())
    variables: list[dict[str, Any]] = []

    for column in columns:
        observed = [str(row.get(column)).strip() for row in rows if not _missing(row.get(column))]
        unique = sorted(set(observed))
        numeric = True
        numeric_values: list[float] = []
        for value in observed:
            try:
                numeric_values.append(float(value))
            except ValueError:
                numeric = False
                break

        if numeric and observed:
            all_binary = set(numeric_values).issubset({0.0, 1.0})
            data_type = "binary" if all_binary else "continuous"
        elif len(unique) == 2:
            data_type = "binary"
        elif len(unique) <= 20:
            data_type = "categorical_nominal"
        else:
            data_type = "text"

        variable: dict[str, Any] = {
            "variableName": column,
            "label": column,
            "dataType": data_type,
            "missingCount": len(rows) - len(observed),
            "uniqueCount": len(unique),
        }
        if not numeric and len(unique) <= 20:
            variable["responseChoices"] = [
                {"value": value, "label": value} for value in unique
            ]
        if numeric_values and numeric:
            variable["range"] = {
                "min": float(min(numeric_values)),
                "max": float(max(numeric_values)),
            }
        variables.append(variable)

    return {
        "rowCount": len(rows),
        "columnCount": len(columns),
        "variables": variables,
    }

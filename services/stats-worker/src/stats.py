from __future__ import annotations

import csv
import io
import math
import statistics
import sys
from typing import Any

ENGINE_VERSION = "python-worker-0.2.0"
PACKAGE_VERSION = sys.version.split()[0]
_NORMAL_975 = 1.959963984540054
_EPS = 1e-14
_FPMIN = 1e-300


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
    rows: list[dict[str, str]], variables: list[str]
) -> tuple[list[list[float]], list[str], list[int]]:
    usable = list(range(len(rows)))
    for variable in variables:
        usable = [i for i in usable if not _missing(rows[i].get(variable))]

    terms = ["Intercept"]
    columns: list[list[float]] = [[1.0 for _ in usable]]

    for variable in variables:
        subset = [rows[i] for i in usable]
        values = [rows[i].get(variable) for i in usable]
        if _column_is_numeric(subset, variable):
            columns.append([float(str(v).strip()) for v in values])
            terms.append(variable)
            continue

        levels = sorted({str(v).strip() for v in values})
        if len(levels) < 2:
            raise ValueError(
                f"Categorical predictor {variable} has fewer than two observed levels."
            )
        for level in levels[1:]:
            columns.append(
                [1.0 if str(v).strip() == level else 0.0 for v in values]
            )
            terms.append(f"{variable}[{level}]")

    matrix = [
        [columns[j][i] for j in range(len(columns))]
        for i in range(len(usable))
    ]
    return matrix, terms, usable


def _betacf(a: float, b: float, x: float) -> float:
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < _FPMIN:
        d = _FPMIN
    d = 1.0 / d
    h = d
    for m in range(1, 201):
        m2 = 2 * m
        aa = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + aa / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        h *= d * c

        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + aa * d
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = 1.0 + aa / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < 3e-14:
            break
    return h


def _regularized_beta(x: float, a: float, b: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0

    bt = math.exp(
        math.lgamma(a + b)
        - math.lgamma(a)
        - math.lgamma(b)
        + a * math.log(x)
        + b * math.log1p(-x)
    )

    if x < (a + 1.0) / (a + b + 2.0):
        return bt * _betacf(a, b, x) / a
    return 1.0 - bt * _betacf(b, a, 1.0 - x) / b


def _student_t_cdf(t: float, df: int) -> float:
    if df <= 0:
        raise ValueError(
            "Student t distribution requires positive degrees of freedom."
        )
    if t == 0.0:
        return 0.5

    x = df / (df + t * t)
    ib = _regularized_beta(x, df / 2.0, 0.5)
    if t > 0:
        return 1.0 - 0.5 * ib
    return 0.5 * ib


def _student_t_two_sided_p(t: float, df: int) -> float:
    if math.isinf(t):
        return 0.0
    cdf = _student_t_cdf(t, df)
    return min(1.0, max(0.0, 2.0 * min(cdf, 1.0 - cdf)))


def _student_t_ppf(probability: float, df: int) -> float:
    if not 0.0 < probability < 1.0:
        raise ValueError("Probability must be between zero and one.")
    if probability == 0.5:
        return 0.0
    if probability < 0.5:
        return -_student_t_ppf(1.0 - probability, df)

    low, high = 0.0, 1.0
    while _student_t_cdf(high, df) < probability and high < 1e6:
        high *= 2.0

    for _ in range(100):
        mid = (low + high) / 2.0
        if _student_t_cdf(mid, df) < probability:
            low = mid
        else:
            high = mid
    return (low + high) / 2.0


def _gammaincc(a: float, x: float) -> float:
    if a <= 0.0:
        raise ValueError("Gamma shape must be positive.")
    if x <= 0.0:
        return 1.0

    gln = math.lgamma(a)

    if x < a + 1.0:
        ap = a
        summ = 1.0 / a
        delta = summ
        for _ in range(1, 501):
            ap += 1.0
            delta *= x / ap
            summ += delta
            if abs(delta) < abs(summ) * _EPS:
                break
        p = summ * math.exp(-x + a * math.log(x) - gln)
        return min(1.0, max(0.0, 1.0 - p))

    b = x + 1.0 - a
    c = 1.0 / _FPMIN
    d = 1.0 / max(abs(b), _FPMIN)
    if b < 0:
        d = -d
    h = d

    for i in range(1, 501):
        an = -i * (i - a)
        b += 2.0
        d = an * d + b
        if abs(d) < _FPMIN:
            d = _FPMIN
        c = b + an / c
        if abs(c) < _FPMIN:
            c = _FPMIN
        d = 1.0 / d
        delta = d * c
        h *= delta
        if abs(delta - 1.0) < _EPS:
            break

    q = math.exp(-x + a * math.log(x) - gln) * h
    return min(1.0, max(0.0, q))


def _chi_square_sf(value: float, df: int) -> float:
    if value < 0.0 or df <= 0:
        raise ValueError(
            "Chi square statistic and degrees of freedom are invalid."
        )
    return _gammaincc(df / 2.0, value / 2.0)


def _normal_two_sided_p(z: float) -> float:
    if math.isinf(z):
        return 0.0
    return min(
        1.0,
        max(0.0, math.erfc(abs(z) / math.sqrt(2.0))),
    )


def _normal_ci(
    estimate: float, se: float, level: float = 0.95
) -> dict[str, float]:
    return {
        "level": level,
        "lower": estimate - _NORMAL_975 * se,
        "upper": estimate + _NORMAL_975 * se,
    }


def _result(
    method: str,
    n: int,
    estimates: list[dict[str, Any]],
    diagnostics: list[dict[str, Any]],
    warnings: list[str] | None = None,
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
            "package": "python-stdlib",
            "packageVersion": PACKAGE_VERSION,
        },
    }


def descriptive_statistics(
    rows: list[dict[str, str]], variables: list[str]
) -> dict[str, Any]:
    estimates: list[dict[str, Any]] = []
    warnings: list[str] = []
    n_max = 0

    for variable in variables:
        values: list[float] = []
        for row in rows:
            try:
                values.append(_float(row.get(variable)))
            except (ValueError, TypeError):
                continue

        n_max = max(n_max, len(values))
        if not values:
            warnings.append(
                f"No numeric observations available for {variable}."
            )
            continue

        estimates.extend(
            [
                {
                    "term": f"{variable}.mean",
                    "estimate": statistics.fmean(values),
                },
                {
                    "term": f"{variable}.sd",
                    "estimate": (
                        statistics.stdev(values)
                        if len(values) > 1
                        else 0.0
                    ),
                },
                {
                    "term": f"{variable}.median",
                    "estimate": statistics.median(values),
                },
                {
                    "term": f"{variable}.min",
                    "estimate": min(values),
                },
                {
                    "term": f"{variable}.max",
                    "estimate": max(values),
                },
            ]
        )

    return _result(
        "descriptive_statistics",
        n_max,
        estimates,
        [
            {
                "id": "numeric_complete",
                "label": "Numeric observations available",
                "status": "passed",
            }
        ],
        warnings,
    )


def _pearson(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or len(a) < 2:
        raise ValueError("Correlation inputs are invalid.")

    mean_a = statistics.fmean(a)
    mean_b = statistics.fmean(b)
    da = [value - mean_a for value in a]
    db = [value - mean_b for value in b]
    denominator = math.sqrt(
        sum(value * value for value in da)
        * sum(value * value for value in db)
    )
    if denominator <= 0.0:
        raise ValueError(
            "Correlation requires variation in both variables."
        )

    coefficient = sum(
        x * y for x, y in zip(da, db)
    ) / denominator
    return max(-1.0, min(1.0, coefficient))


def _ranks(values: list[float]) -> list[float]:
    ordered = sorted(enumerate(values), key=lambda item: item[1])
    ranks = [0.0] * len(values)
    i = 0

    while i < len(ordered):
        j = i + 1
        while (
            j < len(ordered)
            and ordered[j][1] == ordered[i][1]
        ):
            j += 1
        average_rank = ((i + 1) + j) / 2.0
        for k in range(i, j):
            ranks[ordered[k][0]] = average_rank
        i = j

    return ranks


def correlation(
    rows: list[dict[str, str]],
    x: str,
    y: str,
    method: str,
) -> dict[str, Any]:
    pairs: list[tuple[float, float]] = []

    for row in rows:
        try:
            pairs.append(
                (_float(row.get(x)), _float(row.get(y)))
            )
        except (ValueError, TypeError):
            continue

    if len(pairs) < 3:
        raise ValueError(
            "Correlation requires at least three complete numeric pairs."
        )

    a = [pair[0] for pair in pairs]
    b = [pair[1] for pair in pairs]

    if method == "pearson_correlation":
        coefficient = _pearson(a, b)
    else:
        coefficient = _pearson(_ranks(a), _ranks(b))

    if abs(coefficient) >= 1.0 - 1e-15:
        p_value = 0.0
    else:
        t_stat = coefficient * math.sqrt(
            (len(pairs) - 2)
            / (1.0 - coefficient * coefficient)
        )
        p_value = _student_t_two_sided_p(
            t_stat, len(pairs) - 2
        )

    estimate: dict[str, Any] = {
        "term": f"{x} ~ {y}",
        "estimate": coefficient,
        "pValue": p_value,
    }

    if (
        method == "pearson_correlation"
        and len(pairs) > 3
        and abs(coefficient) < 1.0
    ):
        z = math.atanh(coefficient)
        se = 1.0 / math.sqrt(len(pairs) - 3)
        estimate["confidenceInterval"] = {
            "level": 0.95,
            "lower": math.tanh(z - _NORMAL_975 * se),
            "upper": math.tanh(z + _NORMAL_975 * se),
        }

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


def _hypergeom_probability(
    a: int,
    row1: int,
    row2: int,
    col1: int,
    total: int,
) -> float:
    return (
        math.comb(row1, a)
        * math.comb(row2, col1 - a)
        / math.comb(total, col1)
    )


def _fisher_two_sided(
    table: list[list[int]],
) -> tuple[float, float]:
    a, b = table[0]
    c, d = table[1]
    denominator = b * c
    numerator = a * d

    if denominator == 0:
        odds_ratio = 0.0 if numerator == 0 else 1e308
    else:
        odds_ratio = numerator / denominator

    row1 = a + b
    row2 = c + d
    col1 = a + c
    total = row1 + row2
    low = max(0, col1 - row2)
    high = min(row1, col1)
    observed = _hypergeom_probability(
        a, row1, row2, col1, total
    )
    p_value = 0.0

    for candidate in range(low, high + 1):
        probability = _hypergeom_probability(
            candidate, row1, row2, col1, total
        )
        if probability <= observed * (1.0 + 1e-12):
            p_value += probability

    return odds_ratio, min(1.0, p_value)


def contingency(
    rows: list[dict[str, str]],
    outcome: str,
    predictor: str,
    method: str,
) -> dict[str, Any]:
    complete = [
        (
            str(row.get(outcome)).strip(),
            str(row.get(predictor)).strip(),
        )
        for row in rows
        if not _missing(row.get(outcome))
        and not _missing(row.get(predictor))
    ]

    if not complete:
        raise ValueError(
            "No complete observations are available "
            "for the contingency table."
        )

    outcome_levels = sorted({a for a, _ in complete})
    predictor_levels = sorted({b for _, b in complete})
    table = [
        [0 for _ in predictor_levels]
        for _ in outcome_levels
    ]

    for a, b in complete:
        table[outcome_levels.index(a)][
            predictor_levels.index(b)
        ] += 1

    if method == "fisher_exact":
        if (
            len(table) != 2
            or any(len(row) != 2 for row in table)
        ):
            raise ValueError(
                "Fisher exact test currently requires a 2 by 2 table."
            )
        odds_ratio, p_value = _fisher_two_sided(table)
        return _result(
            method,
            len(complete),
            [
                {
                    "term": f"{outcome} x {predictor}",
                    "estimate": odds_ratio,
                    "pValue": p_value,
                    "exponentiatedEstimate": odds_ratio,
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

    row_sums = [sum(row) for row in table]
    col_sums = [
        sum(table[i][j] for i in range(len(table)))
        for j in range(len(predictor_levels))
    ]
    total = len(complete)
    expected = [
        [
            row_sums[i] * col_sums[j] / total
            for j in range(len(col_sums))
        ]
        for i in range(len(row_sums))
    ]

    if any(
        value <= 0.0
        for row in expected
        for value in row
    ):
        raise ValueError(
            "Chi square expected counts contain a zero cell."
        )

    dof = (
        (len(row_sums) - 1)
        * (len(col_sums) - 1)
    )
    correction = (
        len(row_sums) == 2
        and len(col_sums) == 2
    )
    chi2 = 0.0

    for i, row in enumerate(table):
        for j, observed in enumerate(row):
            diff = abs(observed - expected[i][j])
            if correction:
                diff = max(0.0, diff - 0.5)
            chi2 += (
                diff * diff / expected[i][j]
            )

    p_value = _chi_square_sf(chi2, dof)
    min_expected = min(
        value for row in expected for value in row
    )
    status = (
        "passed" if min_expected >= 5 else "review"
    )

    return _result(
        method,
        len(complete),
        [
            {
                "term": f"{outcome} x {predictor}",
                "estimate": chi2,
                "statistic": chi2,
                "pValue": p_value,
            }
        ],
        [
            {
                "id": "expected_cell_counts",
                "label": "Minimum expected cell count",
                "status": status,
                "value": min_expected,
                "message": (
                    None
                    if status == "passed"
                    else "Some expected cell counts are below 5."
                ),
            },
            {
                "id": "degrees_of_freedom",
                "label": "Degrees of freedom",
                "status": "passed",
                "value": dof,
            },
        ],
    )


def _invert(
    matrix: list[list[float]],
) -> list[list[float]]:
    n = len(matrix)
    if (
        n == 0
        or any(len(row) != n for row in matrix)
    ):
        raise ValueError("Matrix must be square.")

    augmented = [
        row[:]
        + [
            1.0 if i == j else 0.0
            for j in range(n)
        ]
        for i, row in enumerate(matrix)
    ]

    for col in range(n):
        pivot = max(
            range(col, n),
            key=lambda row: abs(
                augmented[row][col]
            ),
        )
        if abs(augmented[pivot][col]) < 1e-12:
            raise ValueError(
                "Design matrix is singular or nearly singular."
            )

        if pivot != col:
            augmented[col], augmented[pivot] = (
                augmented[pivot],
                augmented[col],
            )

        pivot_value = augmented[col][col]
        augmented[col] = [
            value / pivot_value
            for value in augmented[col]
        ]

        for row in range(n):
            if row == col:
                continue
            factor = augmented[row][col]
            if factor == 0.0:
                continue
            augmented[row] = [
                augmented[row][j]
                - factor * augmented[col][j]
                for j in range(2 * n)
            ]

    return [row[n:] for row in augmented]


def _xtx(
    x: list[list[float]],
) -> list[list[float]]:
    p = len(x[0])
    return [
        [
            sum(
                row[i] * row[j]
                for row in x
            )
            for j in range(p)
        ]
        for i in range(p)
    ]


def _xty(
    x: list[list[float]],
    y: list[float],
) -> list[float]:
    p = len(x[0])
    return [
        sum(
            row[j] * outcome
            for row, outcome in zip(x, y)
        )
        for j in range(p)
    ]


def _matvec(
    matrix: list[list[float]],
    vector: list[float],
) -> list[float]:
    return [
        sum(
            value * vector[j]
            for j, value in enumerate(row)
        )
        for row in matrix
    ]


def linear_regression(
    rows: list[dict[str, str]],
    outcome: str,
    predictors: list[str],
) -> dict[str, Any]:
    x, terms, usable = _design_matrix(
        rows, predictors
    )
    y: list[float] = []
    final_x: list[list[float]] = []

    for row_x, i in zip(x, usable):
        try:
            y.append(_float(rows[i].get(outcome)))
            final_x.append(row_x)
        except (ValueError, TypeError):
            continue

    x = final_x
    if not x:
        raise ValueError(
            "Linear regression has no complete observations."
        )

    n, p = len(x), len(x[0])
    if n <= p:
        raise ValueError(
            "Linear regression requires more complete "
            "observations than fitted parameters."
        )

    inv_xtx = _invert(_xtx(x))
    beta = _matvec(
        inv_xtx, _xty(x, y)
    )
    fitted = [
        sum(
            value * coefficient
            for value, coefficient in zip(row, beta)
        )
        for row in x
    ]
    residuals = [
        observed - fit
        for observed, fit in zip(y, fitted)
    ]
    rss = sum(
        value * value
        for value in residuals
    )
    mean_y = statistics.fmean(y)
    tss = sum(
        (value - mean_y) ** 2
        for value in y
    )
    df = n - p
    sigma2 = rss / df
    se = [
        math.sqrt(
            max(
                0.0,
                sigma2 * inv_xtx[i][i],
            )
        )
        for i in range(p)
    ]
    crit = _student_t_ppf(0.975, df)

    estimates: list[dict[str, Any]] = []
    for i, term in enumerate(
        terms[: len(beta)]
    ):
        t_stat = (
            beta[i] / se[i]
            if se[i] > 0
            else math.inf
        )
        estimates.append(
            {
                "term": term,
                "estimate": beta[i],
                "standardError": se[i],
                "statistic": t_stat,
                "pValue": (
                    _student_t_two_sided_p(
                        t_stat, df
                    )
                ),
                "confidenceInterval": {
                    "level": 0.95,
                    "lower": (
                        beta[i]
                        - crit * se[i]
                    ),
                    "upper": (
                        beta[i]
                        + crit * se[i]
                    ),
                },
            }
        )

    r2 = (
        1.0 - rss / tss
        if tss > 0
        else 0.0
    )

    return _result(
        "linear_regression",
        n,
        estimates,
        [
            {
                "id": "matrix_rank",
                "label": "Design matrix rank",
                "status": "passed",
                "value": p,
            },
            {
                "id": "r_squared",
                "label": "R squared",
                "status": "passed",
                "value": r2,
            },
        ],
    )


def _log_likelihood(
    x: list[list[float]],
    y: list[float],
    beta: list[float],
) -> float:
    total = 0.0

    for row, outcome in zip(x, y):
        eta = max(
            -35.0,
            min(
                35.0,
                sum(
                    value * coefficient
                    for value, coefficient
                    in zip(row, beta)
                ),
            ),
        )

        if eta >= 0:
            log1pexp = (
                eta
                + math.log1p(
                    math.exp(-eta)
                )
            )
        else:
            log1pexp = math.log1p(
                math.exp(eta)
            )

        total += (
            outcome * eta
            - log1pexp
        )

    return total


def logistic_regression(
    rows: list[dict[str, str]],
    outcome: str,
    predictors: list[str],
) -> dict[str, Any]:
    x, terms, usable = _design_matrix(
        rows, predictors
    )
    y: list[float] = []
    final_x: list[list[float]] = []

    for row_x, i in zip(x, usable):
        try:
            y.append(
                _binary(
                    rows[i].get(outcome)
                )
            )
            final_x.append(row_x)
        except (ValueError, TypeError):
            continue

    x = final_x
    if not x:
        raise ValueError(
            "Logistic regression has no complete observations."
        )

    n, p = len(x), len(x[0])
    events = int(sum(y))

    if n <= p:
        raise ValueError(
            "Logistic regression requires more complete "
            "observations than fitted parameters."
        )

    if events == 0 or events == n:
        raise ValueError(
            "Binary outcome has no variation after "
            "missing values are removed."
        )

    beta = [0.0] * p
    success = False
    fit_message = "Maximum iterations reached."

    for _ in range(100):
        probabilities: list[float] = []

        for row in x:
            eta = max(
                -35.0,
                min(
                    35.0,
                    sum(
                        value * coefficient
                        for value, coefficient
                        in zip(row, beta)
                    ),
                ),
            )
            probabilities.append(
                1.0
                / (
                    1.0
                    + math.exp(-eta)
                )
            )

        gradient = [
            sum(
                row[j]
                * (
                    outcome_value
                    - probability
                )
                for (
                    row,
                    outcome_value,
                    probability,
                ) in zip(
                    x,
                    y,
                    probabilities,
                )
            )
            for j in range(p)
        ]

        information = [
            [
                sum(
                    row[i]
                    * row[j]
                    * max(
                        probability
                        * (
                            1.0
                            - probability
                        ),
                        1e-12,
                    )
                    for row, probability
                    in zip(
                        x,
                        probabilities,
                    )
                )
                for j in range(p)
            ]
            for i in range(p)
        ]

        inv_information = _invert(
            information
        )
        step = _matvec(
            inv_information,
            gradient,
        )
        current_ll = _log_likelihood(
            x, y, beta
        )
        factor = 1.0
        candidate = [
            beta[i] + step[i]
            for i in range(p)
        ]
        candidate_ll = _log_likelihood(
            x, y, candidate
        )

        while (
            candidate_ll
            < current_ll - 1e-12
            and factor > 1e-6
        ):
            factor *= 0.5
            candidate = [
                beta[i]
                + factor * step[i]
                for i in range(p)
            ]
            candidate_ll = _log_likelihood(
                x, y, candidate
            )

        delta = max(
            abs(
                candidate[i] - beta[i]
            )
            for i in range(p)
        )
        beta = candidate

        if delta < 1e-9:
            success = True
            fit_message = "Converged."
            break

    probabilities = []
    for row in x:
        eta = max(
            -35.0,
            min(
                35.0,
                sum(
                    value * coefficient
                    for value, coefficient
                    in zip(row, beta)
                ),
            ),
        )
        probabilities.append(
            1.0
            / (
                1.0
                + math.exp(-eta)
            )
        )

    information = [
        [
            sum(
                row[i]
                * row[j]
                * max(
                    probability
                    * (
                        1.0
                        - probability
                    ),
                    1e-12,
                )
                for row, probability
                in zip(
                    x,
                    probabilities,
                )
            )
            for j in range(p)
        ]
        for i in range(p)
    ]
    covariance = _invert(information)
    se = [
        math.sqrt(
            max(
                0.0,
                covariance[i][i],
            )
        )
        for i in range(p)
    ]

    estimates: list[dict[str, Any]] = []
    for i, term in enumerate(
        terms[: len(beta)]
    ):
        z_stat = (
            beta[i] / se[i]
            if se[i] > 0
            else math.inf
        )
        exponent = math.exp(
            min(beta[i], 700.0)
        )
        estimates.append(
            {
                "term": term,
                "estimate": beta[i],
                "standardError": se[i],
                "statistic": z_stat,
                "pValue": (
                    _normal_two_sided_p(
                        z_stat
                    )
                ),
                "confidenceInterval": (
                    _normal_ci(
                        beta[i], se[i]
                    )
                ),
                "exponentiatedEstimate": exponent,
            }
        )

    warnings: list[str] = []

    if events < 10 * max(1, p - 1):
        warnings.append(
            "The number of outcome events is low "
            "relative to the fitted parameters."
        )

    if any(
        abs(value) > 25
        for value in beta
    ):
        warnings.append(
            "Large fitted coefficients may indicate "
            "separation or sparse data."
        )

    return _result(
        "binary_logistic_regression",
        n,
        estimates,
        [
            {
                "id": "convergence",
                "label": "Optimizer convergence",
                "status": (
                    "passed"
                    if success
                    else "review"
                ),
                "value": success,
                "message": fit_message,
            },
            {
                "id": "outcome_events",
                "label": "Outcome events",
                "status": "passed",
                "value": events,
            },
        ],
        warnings,
    )


def run_analysis(
    payload: dict[str, Any],
) -> dict[str, Any]:
    method = payload.get("methodId")
    csv_text = payload.get("csv")

    if (
        not isinstance(method, str)
        or not isinstance(csv_text, str)
    ):
        raise ValueError(
            "methodId and csv are required."
        )

    rows = _rows(csv_text)
    outcome = payload.get("outcome")
    predictors = list(
        payload.get("predictors") or []
    )
    covariates = list(
        payload.get("covariates") or []
    )
    model_variables = (
        predictors + covariates
    )

    if method == "descriptive_statistics":
        variables = list(
            payload.get("variables")
            or model_variables
            or (
                [outcome]
                if outcome
                else []
            )
        )
        if not variables:
            raise ValueError(
                "Descriptive statistics require "
                "at least one variable."
            )
        return descriptive_statistics(
            rows, variables
        )

    if method in {
        "pearson_correlation",
        "spearman_correlation",
    }:
        if not outcome or not predictors:
            raise ValueError(
                "Correlation requires an outcome "
                "and one predictor."
            )
        return correlation(
            rows,
            outcome,
            predictors[0],
            method,
        )

    if method in {
        "chi_square",
        "fisher_exact",
    }:
        if not outcome or not predictors:
            raise ValueError(
                "Contingency analysis requires "
                "an outcome and one predictor."
            )
        return contingency(
            rows,
            outcome,
            predictors[0],
            method,
        )

    if method == "linear_regression":
        if not outcome or not model_variables:
            raise ValueError(
                "Linear regression requires an outcome "
                "and at least one predictor."
            )
        return linear_regression(
            rows,
            outcome,
            model_variables,
        )

    if method == "binary_logistic_regression":
        if not outcome or not model_variables:
            raise ValueError(
                "Logistic regression requires an outcome "
                "and at least one predictor."
            )
        return logistic_regression(
            rows,
            outcome,
            model_variables,
        )

    raise ValueError(
        "Statistical method is not implemented "
        f"by the Python runner: {method}"
    )


def harmonise_append(
    payload: dict[str, Any],
) -> dict[str, Any]:
    sources = payload.get("sources")
    mappings = payload.get("mappings")

    if (
        not isinstance(sources, list)
        or len(sources) < 2
    ):
        raise ValueError(
            "Harmonised append requires at least "
            "two source datasets."
        )

    if (
        not isinstance(mappings, list)
        or not mappings
    ):
        raise ValueError(
            "Harmonised append requires variable mappings."
        )

    target_variables: list[str] = []
    mapping_by_source: dict[
        str, list[dict[str, Any]]
    ] = {}

    for mapping in mappings:
        source_id = str(
            mapping.get(
                "sourceDatasetVersionId"
            )
            or ""
        )
        source_variable = str(
            mapping.get("sourceVariable")
            or ""
        )
        target_variable = str(
            mapping.get("targetVariable")
            or ""
        )

        if (
            not source_id
            or not source_variable
            or not target_variable
        ):
            raise ValueError(
                "Every mapping requires "
                "sourceDatasetVersionId, "
                "sourceVariable and targetVariable."
            )

        if (
            target_variable
            not in target_variables
        ):
            target_variables.append(
                target_variable
            )

        mapping_by_source.setdefault(
            source_id, []
        ).append(mapping)

    output_rows: list[
        dict[str, str]
    ] = []

    for source in sources:
        source_id = str(
            source.get("datasetVersionId")
            or ""
        )
        csv_text = source.get("csv")

        if (
            not source_id
            or not isinstance(
                csv_text, str
            )
        ):
            raise ValueError(
                "Each source requires "
                "datasetVersionId and csv."
            )

        rows = _rows(csv_text)
        source_mappings = (
            mapping_by_source.get(
                source_id, []
            )
        )

        if not source_mappings:
            raise ValueError(
                "No mappings were supplied "
                f"for source dataset {source_id}."
            )

        for row in rows:
            output: dict[str, str] = {
                target: ""
                for target
                in target_variables
            }

            for mapping in source_mappings:
                source_variable = str(
                    mapping[
                        "sourceVariable"
                    ]
                )
                target_variable = str(
                    mapping[
                        "targetVariable"
                    ]
                )
                raw = row.get(
                    source_variable
                )
                value = (
                    ""
                    if raw is None
                    else str(raw)
                )
                category_map = (
                    mapping.get(
                        "categoryMap"
                    )
                    or {}
                )

                if value in category_map:
                    value = str(
                        category_map[value]
                    )

                output[
                    target_variable
                ] = value

            output_rows.append(output)

    buffer = io.StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=target_variables,
        lineterminator="\n",
    )
    writer.writeheader()
    writer.writerows(output_rows)

    return {
        "csv": buffer.getvalue(),
        "rowCount": len(output_rows),
        "columnCount": len(
            target_variables
        ),
        "columns": target_variables,
    }


def profile_csv(
    csv_text: str,
) -> dict[str, Any]:
    rows = _rows(csv_text)
    columns = list(rows[0].keys())
    variables: list[
        dict[str, Any]
    ] = []

    for column in columns:
        observed = [
            str(row.get(column)).strip()
            for row in rows
            if not _missing(
                row.get(column)
            )
        ]
        unique = sorted(
            set(observed)
        )
        numeric = True
        numeric_values: list[
            float
        ] = []

        for value in observed:
            try:
                numeric_values.append(
                    float(value)
                )
            except ValueError:
                numeric = False
                break

        if numeric and observed:
            all_binary = set(
                numeric_values
            ).issubset({0.0, 1.0})
            data_type = (
                "binary"
                if all_binary
                else "continuous"
            )
        elif len(unique) == 2:
            data_type = "binary"
        elif len(unique) <= 20:
            data_type = (
                "categorical_nominal"
            )
        else:
            data_type = "text"

        variable: dict[
            str, Any
        ] = {
            "variableName": column,
            "label": column,
            "dataType": data_type,
            "missingCount": (
                len(rows)
                - len(observed)
            ),
            "uniqueCount": len(unique),
        }

        if (
            not numeric
            and len(unique) <= 20
        ):
            variable[
                "responseChoices"
            ] = [
                {
                    "value": value,
                    "label": value,
                }
                for value in unique
            ]

        if (
            numeric_values
            and numeric
        ):
            variable["range"] = {
                "min": min(
                    numeric_values
                ),
                "max": max(
                    numeric_values
                ),
            }

        variables.append(variable)

    return {
        "rowCount": len(rows),
        "columnCount": len(
            columns
        ),
        "variables": variables,
    }

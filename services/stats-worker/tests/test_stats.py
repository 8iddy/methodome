import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from stats import run_analysis


def test_pearson_correlation():
    csv_text = "x,y\n1,2\n2,4\n3,6\n4,8\n5,10\n"
    result = run_analysis(
        {
            "methodId": "pearson_correlation",
            "csv": csv_text,
            "outcome": "y",
            "predictors": ["x"],
        }
    )
    assert result["n"] == 5
    assert math.isclose(result["estimates"][0]["estimate"], 1.0, abs_tol=1e-12)


def test_linear_regression():
    csv_text = "x,y\n1,3\n2,5\n3,7\n4,9\n5,11\n6,13\n"
    result = run_analysis(
        {
            "methodId": "linear_regression",
            "csv": csv_text,
            "outcome": "y",
            "predictors": ["x"],
        }
    )
    terms = {item["term"]: item for item in result["estimates"]}
    assert math.isclose(terms["Intercept"]["estimate"], 1.0, abs_tol=1e-8)
    assert math.isclose(terms["x"]["estimate"], 2.0, abs_tol=1e-8)


def test_logistic_regression_runs_and_returns_odds_ratios():
    csv_text = (
        "x,y\n"
        "0.1,0\n0.2,0\n0.3,0\n0.4,0\n"
        "0.5,0\n0.6,1\n0.7,0\n0.8,1\n"
        "0.9,1\n1.0,1\n1.1,1\n1.2,1\n"
    )
    result = run_analysis(
        {
            "methodId": "binary_logistic_regression",
            "csv": csv_text,
            "outcome": "y",
            "predictors": ["x"],
        }
    )
    assert result["n"] == 12
    terms = {item["term"]: item for item in result["estimates"]}
    assert math.isclose(terms["Intercept"]["estimate"], -8.49885246, rel_tol=1e-5, abs_tol=1e-5)
    assert math.isclose(terms["x"]["estimate"], 13.07515764, rel_tol=1e-5, abs_tol=1e-5)
    assert math.isclose(
        terms["x"]["exponentiatedEstimate"],
        476945.562,
        rel_tol=1e-4,
    )


def test_chi_square_flags_expected_counts():
    csv_text = "outcome,group\nYes,A\nYes,A\nNo,A\nNo,B\nYes,B\nNo,B\n"
    result = run_analysis(
        {
            "methodId": "chi_square",
            "csv": csv_text,
            "outcome": "outcome",
            "predictors": ["group"],
        }
    )
    assert result["n"] == 6
    assert result["estimates"][0]["pValue"] >= 0


def test_harmonised_append_maps_form_versions():
    from stats import harmonise_append

    result = harmonise_append(
        {
            "sources": [
                {
                    "datasetVersionId": "day1",
                    "csv": "facility_type,stockout\nHC III,Yes\nHC II,No\n",
                },
                {
                    "datasetVersionId": "day2",
                    "csv": "facility_level,stockout_30_days\nHealth Centre III,No\nHCII,Yes\n",
                },
            ],
            "mappings": [
                {
                    "sourceDatasetVersionId": "day1",
                    "sourceVariable": "facility_type",
                    "targetVariable": "facility_level",
                    "categoryMap": {"HC III": "HCIII", "HC II": "HCII"},
                },
                {
                    "sourceDatasetVersionId": "day1",
                    "sourceVariable": "stockout",
                    "targetVariable": "stockout_status",
                },
                {
                    "sourceDatasetVersionId": "day2",
                    "sourceVariable": "facility_level",
                    "targetVariable": "facility_level",
                    "categoryMap": {"Health Centre III": "HCIII"},
                },
                {
                    "sourceDatasetVersionId": "day2",
                    "sourceVariable": "stockout_30_days",
                    "targetVariable": "stockout_status",
                },
            ],
        }
    )

    assert result["rowCount"] == 4
    assert result["columnCount"] == 2
    assert "facility_level,stockout_status" in result["csv"]
    assert "HCIII,No" in result["csv"]


def test_fisher_exact_known_table():
    csv_text = (
        "outcome,group\n"
        "Yes,A\nYes,A\nYes,A\nNo,A\n"
        "Yes,B\nNo,B\nNo,B\nNo,B\n"
    )
    result = run_analysis(
        {
            "methodId": "fisher_exact",
            "csv": csv_text,
            "outcome": "outcome",
            "predictors": ["group"],
        }
    )
    estimate = result["estimates"][0]
    assert math.isclose(estimate["estimate"], 1 / 9, rel_tol=1e-12)
    assert 0 <= estimate["pValue"] <= 1


def test_independent_two_sample_t_uses_welch_inference():
    csv_text = (
        "outcome,group\n"
        "1,A\n2,A\n3,A\n4,A\n5,A\n"
        "3,B\n4,B\n5,B\n6,B\n7,B\n8,B\n"
    )
    result = run_analysis(
        {
            "methodId": "independent_two_sample_t",
            "csv": csv_text,
            "outcome": "outcome",
            "predictors": ["group"],
        }
    )
    estimate = result["estimates"][0]
    assert result["n"] == 11
    assert math.isclose(estimate["estimate"], -2.5, abs_tol=1e-12)
    assert math.isclose(estimate["statistic"], -2.401922307076307, rel_tol=1e-10)
    assert math.isclose(estimate["pValue"], 0.039803082024136245, rel_tol=1e-8)
    assert math.isclose(
        estimate["confidenceInterval"]["lower"],
        -4.854952643964417,
        rel_tol=1e-8,
    )
    assert math.isclose(
        estimate["confidenceInterval"]["upper"],
        -0.14504735603558316,
        rel_tol=1e-8,
    )


def test_paired_t_uses_within_pair_differences():
    csv_text = (
        "followup,baseline\n"
        "10,8\n12,11\n9,7\n11,10\n13,10\n8,9\n"
    )
    result = run_analysis(
        {
            "methodId": "paired_t",
            "csv": csv_text,
            "outcome": "followup",
            "predictors": ["baseline"],
        }
    )
    estimate = result["estimates"][0]
    assert result["n"] == 6
    assert math.isclose(estimate["estimate"], 4 / 3, rel_tol=1e-12)
    assert math.isclose(estimate["statistic"], 2.3904572186687876, rel_tol=1e-10)
    assert math.isclose(estimate["pValue"], 0.062352416002150406, rel_tol=1e-8)


def test_one_way_anova_known_groups():
    csv_text = (
        "outcome,group\n"
        "1,A\n2,A\n3,A\n4,A\n"
        "3,B\n4,B\n5,B\n6,B\n"
        "8,C\n9,C\n10,C\n11,C\n"
    )
    result = run_analysis(
        {
            "methodId": "one_way_anova",
            "csv": csv_text,
            "outcome": "outcome",
            "predictors": ["group"],
        }
    )
    estimate = result["estimates"][0]
    assert result["n"] == 12
    assert math.isclose(estimate["statistic"], 31.2, rel_tol=1e-12)
    assert math.isclose(estimate["pValue"], 8.962916273002204e-05, rel_tol=1e-8)


def test_mann_whitney_exact_without_ties():
    csv_text = (
        "outcome,group\n"
        "1,A\n2,A\n3,A\n4,A\n5,A\n"
        "6,B\n7,B\n8,B\n9,B\n10,B\n"
    )
    result = run_analysis(
        {
            "methodId": "mann_whitney",
            "csv": csv_text,
            "outcome": "outcome",
            "predictors": ["group"],
        }
    )
    estimate = result["estimates"][0]
    assert math.isclose(estimate["statistic"], 0.0, abs_tol=1e-12)
    assert math.isclose(estimate["pValue"], 0.007936507936507936, rel_tol=1e-12)
    exact = next(item for item in result["diagnostics"] if item["id"] == "exact_inference")
    assert exact["value"] is True


def test_wilcoxon_signed_rank_exact_without_ties():
    csv_text = (
        "after,before\n"
        "6,5\n7,5\n8,5\n10,5\n12,5\n"
    )
    result = run_analysis(
        {
            "methodId": "wilcoxon_signed_rank",
            "csv": csv_text,
            "outcome": "after",
            "predictors": ["before"],
        }
    )
    estimate = result["estimates"][0]
    assert math.isclose(estimate["statistic"], 0.0, abs_tol=1e-12)
    assert math.isclose(estimate["pValue"], 0.0625, rel_tol=1e-12)


def test_kruskal_wallis_known_groups_with_ties():
    csv_text = (
        "outcome,group\n"
        "1,A\n2,A\n3,A\n4,A\n"
        "3,B\n4,B\n5,B\n6,B\n"
        "8,C\n9,C\n10,C\n11,C\n"
    )
    result = run_analysis(
        {
            "methodId": "kruskal_wallis",
            "csv": csv_text,
            "outcome": "outcome",
            "predictors": ["group"],
        }
    )
    estimate = result["estimates"][0]
    assert math.isclose(estimate["statistic"], 8.830985915492962, rel_tol=1e-10)
    assert math.isclose(estimate["pValue"], 0.012088593490222907, rel_tol=1e-8)


def test_group_comparison_rejects_covariates():
    csv_text = "outcome,group,z\n1,A,1\n2,A,2\n3,B,3\n4,B,4\n"
    try:
        run_analysis(
            {
                "methodId": "independent_two_sample_t",
                "csv": csv_text,
                "outcome": "outcome",
                "predictors": ["group"],
                "covariates": ["z"],
            }
        )
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "no covariates" in str(exc)

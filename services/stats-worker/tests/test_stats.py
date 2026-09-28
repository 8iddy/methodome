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
    assert all("exponentiatedEstimate" in item for item in result["estimates"])


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

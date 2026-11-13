from pathlib import Path

from olpipe import selection

SEEDS = Path(__file__).resolve().parents[1] / "seeds"


def test_dataform_vars_flatten_the_selection_file():
    out = selection.dataform_vars(selection.load(SEEDS / "selection.yaml"), "2026-10-31", "r1")
    pairs = dict(p.split("=", 1) for p in out.split(","))
    assert pairs["dataset_version"] == "ol-2026-10-31-r1"
    assert pairs["segments_famous_size"] == "1200"
    assert pairs["popularity_weight_read"] == "3"
    assert "erotic" in pairs["excluded_subjects"].split("|")


def test_dataform_defaults_cover_every_selection_key():
    import yaml

    settings = yaml.safe_load((SEEDS.parent / "dataform" / "workflow_settings.yaml").read_text())
    flat = selection.flatten(selection.load(SEEDS / "selection.yaml"))
    assert {k: str(v) for k, v in settings["vars"].items() if k in flat} == flat

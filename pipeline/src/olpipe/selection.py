"""Selection config: ``seeds/selection.yaml`` is the single source for weights and sizes.

``olpipe dataform-vars`` flattens it into the ``--vars`` string that Dataform reads.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from .models import dataset_version


def load(path: str | Path) -> dict:
    return yaml.safe_load(Path(path).read_text())


def flatten(config: dict, prefix: str = "") -> dict[str, str]:
    flat: dict[str, str] = {}
    for key, value in config.items():
        name = f"{prefix}{key}"
        if isinstance(value, dict):
            flat.update(flatten(value, f"{name}_"))
        elif isinstance(value, list):
            flat[name] = "|".join(str(v) for v in value)
        else:
            flat[name] = str(value)
    return flat


def dataform_vars(config: dict, dump_date: str, revision: str) -> str:
    flat = {"dump_date": dump_date, "revision": revision,
            "dataset_version": dataset_version(dump_date, revision), **flatten(config)}
    for key, value in flat.items():
        if "," in value or "=" in value:
            raise ValueError(f"selection value {key}={value!r} may not contain ',' or '='")
    return ",".join(f"{k}={v}" for k, v in flat.items())

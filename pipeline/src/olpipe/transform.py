"""Stage 4 wrapper: run the Dataform project with the job's own credentials.

Workflows has no Dataform connector and the project is not hosted in a Dataform
repository, so the pipeline image carries the Dataform CLI and this command
runs it. Locally, run the CLI directly (see the README).
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from . import selection

log = logging.getLogger(__name__)


def run(*, dump_date: str, revision: str, project: str, location: str, dataform_dir: str,
        selection_path: str, use_editions: bool, dry_run: bool = False) -> int:
    vars_ = selection.dataform_vars(selection.load(selection_path), dump_date, revision)
    vars_ += f",use_editions={'true' if use_editions else 'false'}"
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "dataform"
        shutil.copytree(dataform_dir, work, ignore=shutil.ignore_patterns("node_modules", ".df-credentials.json"))
        # No key in the file: the CLI falls back to Application Default Credentials.
        (work / ".df-credentials.json").write_text(json.dumps({"projectId": project, "location": location}))
        cmd = ["dataform", "run", str(work), f"--default-database={project}", f"--vars={vars_}"]
        if dry_run:
            cmd.append("--dry-run")
        log.info("running %s", " ".join(cmd[:3] + ["--default-database=***", "--vars=..."]))
        return subprocess.run(cmd, check=False, env={**os.environ}).returncode

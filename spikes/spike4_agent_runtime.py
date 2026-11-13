"""Spike 4 (gates Phase 3b): cold and warm latency of the specialists on Agent Runtime.

Run AFTER the owner has deployed agents/bookshop-specialists (see planning/owner-instructions.md).
It uses the gateway's own client, so it also confirms the request and response shapes that
``AgentRuntimeSpecialists`` assumes.

    cd backend
    SPECIALISTS_AGENT_RESOURCE=projects/<number>/locations/us-central1/reasoningEngines/<id> \
      uv run python ../spikes/spike4_agent_runtime.py --calls 5

Run it once after the deployment has been idle for 15+ minutes (cold), then again at once (warm).
Then leave the deployment idle for 48 hours and read the billing report: any charge while idle
means min-instances 0 is not free, and the specialists stay in-process.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time

from _common import log, require_project

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from app.specialists.client import AgentRuntimeSpecialists, LocalSpecialists  # noqa: E402
from app.specialists.core.schemas import Candidate, RecommendRequest, Taste  # noqa: E402

CANDIDATES = [
    Candidate(id="OL1003040W", title="Dom Casmurro", authors=["Machado de Assis"], category="Brazilian Literature"),
    Candidate(id="OL27482W", title="The Hobbit", authors=["J. R. R. Tolkien"], category="Fantasy"),
    Candidate(id="OL85892W", title="Dracula", authors=["Bram Stoker"], category="Horror"),
]


class _Unreachable(LocalSpecialists):
    """The fallback must not hide a failed remote call during the spike."""

    async def recommend(self, req):
        raise RuntimeError("the Agent Runtime call failed or returned nothing usable (see the warning above)")


async def main(calls: int) -> None:
    resource = os.environ.get("SPECIALISTS_AGENT_RESOURCE")
    if not resource:
        sys.exit("Set SPECIALISTS_AGENT_RESOURCE to the deployed reasoning engine resource name.")
    client = AgentRuntimeSpecialists(resource=resource, location=os.environ["GOOGLE_CLOUD_LOCATION"], timeout=60,
                                     fallback=_Unreachable(model="", use_llm=False, timeout=1))
    request = RecommendRequest(request="a gothic classic", taste=Taste(likes=["horror"]), candidates=CANDIDATES)
    for i in range(calls):
        started = time.monotonic()
        result = await client.recommend(request)
        log(f"CALL {i + 1}", f"{(time.monotonic() - started) * 1000:.0f} ms, {len(result.picks)} picks, source={result.source}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING)
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--calls", type=int, default=5)
    require_project()
    asyncio.run(main(parser.parse_args().calls))

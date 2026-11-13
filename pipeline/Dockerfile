# One image, several subcommands: fetch, chunk, seeds, transform, publish.
FROM python:3.12-slim

# Node is only needed by `olpipe transform`, which shells out to the Dataform CLI.
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && npm install -g @dataform/cli@3.0.26 \
    && rm -rf /var/lib/apt/lists/* /root/.npm

WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY src/ ./src/
RUN uv sync --frozen --no-dev
COPY seeds/ ./seeds/
COPY dataform/ ./dataform/

ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
ENTRYPOINT ["olpipe"]

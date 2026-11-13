"""Catalog REST: the slim index for the grid, one full document for the detail page."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path, Request, Response

router = APIRouter(prefix="/api")
BOOK_ID = r"^OL\d{1,12}W$"


@router.get("/catalog")
async def catalog(request: Request) -> Response:
    repo = request.app.state.services.catalog
    etag = f'"{repo.dataset_version}"'
    # The index only changes when a new dataset version is published, so the ETag is the version.
    headers = {"ETag": etag, "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=repo.slim_json, media_type="application/json", headers=headers)


@router.get("/books/{olid}")
async def book(request: Request, olid: str = Path(pattern=BOOK_ID)) -> Response:
    found = await request.app.state.services.catalog.get(olid)
    if found is None:
        raise HTTPException(status_code=404, detail="book not found")
    return Response(content=found.model_dump_json(), media_type="application/json",
                    headers={"Cache-Control": "public, max-age=3600"})

"""Tag CRUD endpoints — forest of user-scoped tags with parent_tag_id + position."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth_middleware import get_authed_db, get_current_user

router = APIRouter(tags=["tags"])


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    parent_tag_id: UUID | None = None


class TagRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class TagMove(BaseModel):
    parent_tag_id: UUID | None = None
    position: int = Field(..., ge=0)


class TagReorder(BaseModel):
    parent_tag_id: UUID | None = None
    tag_ids: list[UUID]


@router.get("/tags")
def list_tags(
    db=Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    res = (
        db.table("tags")
        .select("id, name, parent_tag_id, position, created_at")
        .eq("user_id", user["user_id"])
        .order("position")
        .execute()
    )
    return res.data


@router.post("/tags", status_code=201)
def create_tag(
    body: TagCreate,
    db=Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    # Compute next position among siblings (parent_tag_id may be NULL → use .is_)
    sib_query = db.table("tags").select("position").eq("user_id", user_id)
    if body.parent_tag_id is None:
        sib_query = sib_query.is_("parent_tag_id", "null")
    else:
        sib_query = sib_query.eq("parent_tag_id", str(body.parent_tag_id))
    sibling_rows = sib_query.execute().data
    next_pos = max((s["position"] for s in sibling_rows), default=-1) + 1

    payload = {
        "user_id": user_id,
        "name": body.name,
        "parent_tag_id": str(body.parent_tag_id) if body.parent_tag_id else None,
        "position": next_pos,
    }
    try:
        res = db.table("tags").insert(payload).execute()
    except Exception as e:
        msg = str(e).lower()
        if "duplicate" in msg or "unique" in msg:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Tag with that name already exists at this level",
            ) from e
        raise
    return res.data[0]


# NOTE: /tags/reorder must be declared BEFORE /tags/{tag_id} so FastAPI does not
# match "reorder" as a UUID path param.
@router.put("/tags/reorder")
def reorder_siblings(
    body: TagReorder,
    db=Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    user_id = user["user_id"]
    for idx, tag_id in enumerate(body.tag_ids):
        db.table("tags").update({"position": idx}).eq("id", str(tag_id)).eq(
            "user_id", user_id
        ).execute()
    return {"ok": True}


@router.patch("/tags/{tag_id}")
def rename_tag(
    tag_id: UUID,
    body: TagRename,
    db=Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    res = (
        db.table("tags")
        .update({"name": body.name})
        .eq("id", str(tag_id))
        .eq("user_id", user["user_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    return res.data[0]


@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(
    tag_id: UUID,
    db=Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    res = (
        db.table("tags")
        .delete()
        .eq("id", str(tag_id))
        .eq("user_id", user["user_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")


@router.put("/tags/{tag_id}/move")
def move_tag(
    tag_id: UUID,
    body: TagMove,
    db=Depends(get_authed_db),
    user: dict = Depends(get_current_user),
):
    res = (
        db.table("tags")
        .update(
            {
                "parent_tag_id": str(body.parent_tag_id) if body.parent_tag_id else None,
                "position": body.position,
            }
        )
        .eq("id", str(tag_id))
        .eq("user_id", user["user_id"])
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tag not found")
    return res.data[0]

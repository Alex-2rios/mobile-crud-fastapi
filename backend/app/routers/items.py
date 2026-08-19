from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, User
from app.schemas import ItemCreate, ItemOut, ItemPage, ItemUpdate
from app.security import get_current_user

router = APIRouter(prefix="/items", tags=["items"])


def get_owned_item(item_id: int, db: Session, user: User) -> Item:
    item = db.get(Item, item_id)
    if item is None or item.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "item not found")
    return item


@router.get("", response_model=ItemPage)
def list_items(
    q: str | None = Query(default=None, description="matches sku, name or location"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ItemPage:
    filters = [Item.owner_id == user.id]
    if q:
        pattern = f"%{q}%"
        filters.append(
            or_(Item.sku.ilike(pattern), Item.name.ilike(pattern), Item.location.ilike(pattern))
        )

    total = db.scalar(select(func.count()).select_from(Item).where(*filters)) or 0
    rows = db.scalars(
        select(Item).where(*filters).order_by(Item.updated_at.desc()).limit(limit).offset(offset)
    ).all()

    return ItemPage(total=total, limit=limit, offset=offset, items=list(rows))


@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Item:
    item = Item(**payload.model_dump(), owner_id=user.id)
    db.add(item)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "you already have an item with that sku"
        ) from exc
    db.refresh(item)
    return item


@router.get("/{item_id}", response_model=ItemOut)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Item:
    return get_owned_item(item_id, db, user)


@router.patch("/{item_id}", response_model=ItemOut)
def update_item(
    item_id: int,
    payload: ItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Item:
    item = get_owned_item(item_id, db, user)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "nothing to update")

    for field, value in changes.items():
        setattr(item, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "you already have an item with that sku"
        ) from exc
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    item = get_owned_item(item_id, db, user)
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

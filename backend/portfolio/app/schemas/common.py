"""Shared Pydantic building blocks: strict request bodies and list envelopes."""

from __future__ import annotations

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

ItemT = TypeVar("ItemT")


class RequestModel(BaseModel):
    """Base for request bodies: unknown fields are rejected and strings are trimmed."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ResponseModel(BaseModel):
    """Base for response models that can be built from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[ItemT]):
    """List envelope: one page of items plus the total number of matches."""

    items: list[ItemT]
    total: int

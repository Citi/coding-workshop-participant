"""Request bodies for the expenses endpoints."""

from decimal import Decimal
from typing import Annotated, Literal, get_args

from pydantic import Field

from app.core.validation import MAX_MONEY, ApiModel, IsoDate, StrictId, Text255

ExpenseCategory = Literal["labor", "software", "hardware", "travel", "other"]
EXPENSE_CATEGORIES = get_args(ExpenseCategory)

Amount = Annotated[Decimal, Field(gt=0, le=MAX_MONEY, decimal_places=2)]


class ExpenseRequest(ApiModel):
    """Body of POST /expenses and PUT /expenses/{id} (PUT is a full update)."""

    project_id: StrictId
    category: ExpenseCategory
    description: Text255
    amount: Amount
    expense_date: IsoDate

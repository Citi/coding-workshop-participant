"""Employee ticket routes. Employees only (403 for other roles); each acts for the signed-in caller."""

from typing import Annotated, Any

from fastapi import APIRouter, Query, status

from deps import EmployeeUser, IdPath
from schemas import (
    EscalationRequest,
    NoteCreate,
    NoteResponse,
    StatusChangeResponse,
    TicketCreate,
    TicketDetail,
    TicketFilters,
    TicketListItem,
    TicketResponse,
)
from services import ticket_service

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("", response_model=list[TicketListItem])
def list_my_tickets(
    user: EmployeeUser, filters: Annotated[TicketFilters, Query()]
) -> list[dict[str, Any]]:
    """List the caller's tickets. Filter by status, view and search text (title, description, #)."""
    return ticket_service.list_my_tickets(user["user_id"], filters)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=TicketResponse)
def create_ticket(body: TicketCreate, user: EmployeeUser) -> dict[str, Any]:
    """Create a ticket for the caller. The internal priority is set from the affected scope."""
    return ticket_service.create_ticket(user["user_id"], body)


@router.get("/{ticket_id}", response_model=TicketDetail)
def get_my_ticket(ticket_id: IdPath, user: EmployeeUser) -> dict[str, Any]:
    """Full details of one of the caller's tickets. Others' tickets return 404."""
    return ticket_service.get_my_ticket(user["user_id"], ticket_id)


@router.get("/{ticket_id}/history", response_model=list[StatusChangeResponse])
def list_status_history(ticket_id: IdPath, user: EmployeeUser) -> list[dict[str, Any]]:
    """Every status the ticket has been in and who changed it, oldest first."""
    return ticket_service.list_status_history(user["user_id"], ticket_id)


@router.get("/{ticket_id}/notes", response_model=list[NoteResponse])
def list_notes(ticket_id: IdPath, user: EmployeeUser) -> list[dict[str, Any]]:
    """The ticket's note history, oldest first."""
    return ticket_service.list_notes(user["user_id"], ticket_id)


@router.post(
    "/{ticket_id}/notes", status_code=status.HTTP_201_CREATED, response_model=NoteResponse
)
def add_note(ticket_id: IdPath, body: NoteCreate, user: EmployeeUser) -> dict[str, Any]:
    """Add a note to one of the caller's tickets. Closed tickets return 409."""
    return ticket_service.add_note(user["user_id"], ticket_id, body.note_text)


@router.post("/{ticket_id}/escalation", response_model=TicketDetail)
def request_escalation(
    ticket_id: IdPath, body: EscalationRequest, user: EmployeeUser
) -> dict[str, Any]:
    """Ask a Facility Admin to review the ticket. Returns the updated ticket."""
    return ticket_service.request_escalation(user["user_id"], ticket_id, body.reason)

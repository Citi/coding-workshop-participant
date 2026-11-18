"""Role rules in app/services/permissions.py - pure functions, no database."""

import pytest

from app.models import Incident, IncidentStatus as S, User, UserRole
from app.services import permissions as perms

ADMIN = User(id=1, role=UserRole.FACILITY_ADMIN)
ENGINEER = User(id=2, role=UserRole.ENGINEER)
OTHER_ENGINEER = User(id=3, role=UserRole.ENGINEER)
REPORTER = User(id=10, role=UserRole.EMPLOYEE)
STRANGER = User(id=11, role=UserRole.EMPLOYEE)


def incident(status=S.OPEN, engineer=None, escalated=False):
    return Incident(
        status=status, reported_by_id=REPORTER.id,
        assigned_engineer_id=engineer.id if engineer else None, is_escalated=escalated,
    )


# ---------------------------------------------------------------- visibility

@pytest.mark.parametrize("user, visible", [
    (ADMIN, True), (REPORTER, True), (ENGINEER, True),
    (OTHER_ENGINEER, False), (STRANGER, False),
])
def test_can_view(user, visible):
    assert perms.can_view(user, incident(S.ASSIGNED, ENGINEER)) is visible


def test_visibility_filter_is_unrestricted_for_admin_only():
    assert perms.visibility_filter(ADMIN) is True
    assert perms.visibility_filter(REPORTER) is not True


# ---------------------------------------------------------------- transitions

@pytest.mark.parametrize("status, expected", [
    (S.ASSIGNED, {S.IN_PROGRESS}),
    (S.IN_PROGRESS, {S.ON_HOLD, S.RESOLVED}),
    (S.ON_HOLD, {S.IN_PROGRESS, S.RESOLVED}),
    (S.RESOLVED, {S.IN_PROGRESS}),
    (S.CLOSED, set()),
    (S.CANCELLED, set()),
])
def test_engineer_transitions(status, expected):
    assert perms.allowed_transitions(ENGINEER, incident(status, ENGINEER)) == expected


def test_unassigned_engineer_cannot_move_ticket():
    assert perms.allowed_transitions(OTHER_ENGINEER, incident(S.IN_PROGRESS, ENGINEER)) == set()


@pytest.mark.parametrize("status, expected", [
    (S.OPEN, {S.CANCELLED}),
    (S.ASSIGNED, {S.CANCELLED}),
    (S.IN_PROGRESS, set()),           # work started: can't cancel any more
    (S.RESOLVED, {S.CLOSED, S.IN_PROGRESS}),  # confirm fix or reopen
    (S.CLOSED, set()),
])
def test_reporter_transitions(status, expected):
    inc = incident(status, ENGINEER if status != S.OPEN else None)
    assert perms.allowed_transitions(REPORTER, inc) == expected


def test_other_employee_has_no_transitions():
    assert perms.allowed_transitions(STRANGER, incident(S.RESOLVED, ENGINEER)) == set()


def test_admin_can_move_anywhere_once_assigned():
    allowed = perms.allowed_transitions(ADMIN, incident(S.IN_PROGRESS, ENGINEER))
    assert allowed == set(S) - {S.IN_PROGRESS}


def test_admin_without_engineer_can_only_open_or_cancel():
    assert perms.allowed_transitions(ADMIN, incident(S.OPEN)) == {S.CANCELLED}
    assert perms.allowed_transitions(ADMIN, incident(S.CANCELLED)) == {S.OPEN}


# ---------------------------------------------------------------- editing & notes

@pytest.mark.parametrize("user, status, editable", [
    (REPORTER, S.OPEN, True),
    (REPORTER, S.ASSIGNED, False),
    (STRANGER, S.OPEN, False),
    (ENGINEER, S.IN_PROGRESS, False),
    (ADMIN, S.IN_PROGRESS, True),
    (ADMIN, S.CLOSED, False),
    (ADMIN, S.CANCELLED, False),
])
def test_can_edit(user, status, editable):
    assert perms.can_edit(user, incident(status, ENGINEER)) is editable


@pytest.mark.parametrize("status, escalated, allowed", [
    (S.OPEN, False, True),
    (S.ON_HOLD, False, True),
    (S.OPEN, True, False),       # already escalated
    (S.RESOLVED, False, False),
    (S.CLOSED, False, False),
])
def test_reporter_can_escalate(status, escalated, allowed):
    assert perms.can_escalate(REPORTER, incident(status, ENGINEER, escalated)) is allowed


def test_only_reporter_escalates():
    assert not perms.can_escalate(ADMIN, incident())
    assert not perms.can_escalate(ENGINEER, incident(S.ASSIGNED, ENGINEER))


def test_notes_closed_on_final_statuses():
    assert perms.can_add_note(REPORTER, incident(S.RESOLVED, ENGINEER))
    assert not perms.can_add_note(REPORTER, incident(S.CLOSED, ENGINEER))
    assert not perms.can_add_note(ADMIN, incident(S.CANCELLED))


def test_internal_notes_are_staff_only():
    inc = incident(S.IN_PROGRESS, ENGINEER)
    assert perms.can_add_internal_note(ENGINEER, inc)
    assert perms.can_add_internal_note(ADMIN, inc)
    assert not perms.can_add_internal_note(REPORTER, inc)
    assert not perms.can_see_internal_notes(REPORTER)


def test_permissions_payload_for_ui():
    p = perms.permissions(REPORTER, incident(S.RESOLVED, ENGINEER))
    assert p["status_transitions"] == [S.IN_PROGRESS, S.CLOSED]  # lifecycle order
    assert p["can_delete"] is False and p["can_assign"] is False
    admin = perms.permissions(ADMIN, incident(S.OPEN))
    assert admin["can_delete"] and admin["can_assign"] and admin["can_set_priority"]

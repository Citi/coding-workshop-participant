"""Deliverable business rules: references, unique names per project and the dependency graph."""

from datetime import date

from app.core import clock
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.http import list_result
from app.deliverables import repository, rules
from app.deliverables.schemas import DeliverableRequest
from app.projects import repository as projects_repository
from app.resources import repository as resources_repository

DUPLICATE_NAME = "A deliverable with this name already exists in this project"


def _present(row: dict, today: date) -> dict:
    """A deliverables row plus the computed ``is_overdue`` flag."""
    return {**row, "is_overdue": rules.is_overdue(row["status"], row["due_date"], today)}


def _stored_fields(data: DeliverableRequest) -> dict:
    """The columns of the deliverables table (links are stored separately)."""
    return data.model_dump(exclude={"depends_on_ids"})


def _found(result):
    """``result`` itself; 404 when it is empty: the deliverable in the URL does not exist (or was just deleted)."""
    if not result:
        raise NotFoundError("Deliverable not found")
    return result


def list_deliverables(
    conn, *, search=None, project_id=None, status=None, is_key=None, owner_id=None, overdue=None
) -> dict:
    """Filtered deliverables; ``overdue`` filters on the computed ``is_overdue`` flag."""
    rows = repository.list_deliverables(
        conn, search=search, project_id=project_id, status=status, is_key=is_key, owner_id=owner_id
    )
    today = clock.today()
    items = [_present(row, today) for row in rows]
    if overdue is not None:
        items = [item for item in items if item["is_overdue"] is overdue]
    return list_result(items)


def get_deliverable(conn, deliverable_id: int) -> dict:
    """The deliverable plus its direct prerequisites, full upstream chain and direct dependents."""
    row = _found(repository.find_deliverable(conn, deliverable_id))
    chain = repository.find_dependency_chain(conn, deliverable_id)
    return {
        **_present(row, clock.today()),
        "depends_on": rules.direct_prerequisites(chain),
        "dependency_chain": chain,
        "blocks": repository.find_blocked(conn, deliverable_id),
    }


def create_deliverable(conn, data: DeliverableRequest) -> dict:
    """Insert a deliverable and its prerequisite links; return it as GET /deliverables/{id} does."""
    _validate(conn, data)
    deliverable_id = repository.insert_deliverable(conn, _stored_fields(data))
    repository.replace_dependencies(conn, deliverable_id, data.depends_on_ids)
    return get_deliverable(conn, deliverable_id)


def update_deliverable(conn, deliverable_id: int, data: DeliverableRequest) -> dict:
    """Full update; ``depends_on_ids`` replaces the whole prerequisite set."""
    _found(repository.deliverable_exists(conn, deliverable_id))
    _validate(conn, data, deliverable_id)
    _found(repository.update_deliverable(conn, deliverable_id, _stored_fields(data)))
    repository.replace_dependencies(conn, deliverable_id, data.depends_on_ids)
    return get_deliverable(conn, deliverable_id)


def delete_deliverable(conn, deliverable_id: int) -> None:
    """Delete a deliverable; its links in both directions cascade (404 for an unknown id)."""
    _found(repository.delete_deliverable(conn, deliverable_id))


def _validate(conn, data: DeliverableRequest, deliverable_id: int | None = None) -> None:
    """400 when a reference or the dependency set is invalid, then 409 for a duplicate name."""
    errors = _reference_errors(conn, data, deliverable_id)
    if errors:
        raise ValidationError(details=errors)
    if repository.name_taken(conn, data.project_id, data.name, exclude_id=deliverable_id):
        raise ConflictError(DUPLICATE_NAME, details={"name": DUPLICATE_NAME})


def _reference_errors(conn, data: DeliverableRequest, deliverable_id: int | None) -> dict:
    """Collect every invalid reference so the form can show them all at once."""
    errors = {}
    if not projects_repository.project_exists(conn, data.project_id):
        errors["project_id"] = "Project not found"
    if data.owner_id is not None and not resources_repository.resource_exists(conn, data.owner_id):
        errors["owner_id"] = "Resource not found"
    dependency_error = _dependency_error(conn, deliverable_id, data.depends_on_ids)
    if dependency_error:
        errors["depends_on_ids"] = dependency_error
    return errors


def _dependency_error(conn, deliverable_id: int | None, depends_on_ids: list[int]) -> str | None:
    """Prerequisites must exist, must not include the deliverable itself and must not close a cycle."""
    if not depends_on_ids:
        return None
    if deliverable_id in depends_on_ids:
        return "A deliverable cannot depend on itself"
    missing = set(depends_on_ids) - repository.find_existing_ids(conn, depends_on_ids)
    if missing:
        return f"Deliverable(s) not found: {rules.format_ids(missing)}"
    if deliverable_id is None:
        return None  # a new deliverable has no dependents yet, so it cannot close a cycle
    return _cycle_error(conn, deliverable_id, depends_on_ids)


def _cycle_error(conn, deliverable_id: int, depends_on_ids: list[int]) -> str | None:
    """A cycle appears when a new prerequisite already depends (transitively) on this deliverable."""
    repository.lock_dependency_graph(conn)
    cyclic = repository.find_dependents_among(conn, deliverable_id, depends_on_ids)
    if cyclic:
        if len(cyclic) == 1:
            return f"Circular dependency: deliverable {rules.format_ids(cyclic)} already depends on this deliverable"
        return f"Circular dependency: deliverables {rules.format_ids(cyclic)} already depend on this deliverable"
    return None

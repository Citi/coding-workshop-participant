import json

from path_helpers import get_path_segments
from postgres_service import get_all_projects, search_projects_by_name, get_project_by_id, create_project, update_project, delete_project


def _normalize_budget(value):
    if value in (None, ""):
        return 0

    return value

def handler(event, context):
    
    if event["requestContext"]["http"]["method"] == "GET":

        path_segments = get_path_segments(event)

        if len(path_segments) == 2 and path_segments[0] == "search":
            name = path_segments[1]

            project = search_projects_by_name(name)

            if not project:
                return {
                    "statusCode": 404,
                    "body": json.dumps({
                        "message": "Project not found"
                    })
                }

            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(project)
            }

        elif len(path_segments) == 1:
            project_id = path_segments[0]

            project = get_project_by_id(project_id)

            if not project:
                return {
                    "statusCode": 404,
                    "body": json.dumps({
                        "message": "Project not found"
                    })
                }

            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(project)
            }
        
        elif len(path_segments) == 0:
            projects = get_all_projects()
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(projects)
            }
    
    elif event["requestContext"]["http"]["method"] == "POST":
        try:
            body = json.loads(event["body"])
            name = body.get("name")
            status = body.get("status")
            start_date = body.get("start_date")
            end_date = body.get("end_date")
            budget_planned = _normalize_budget(
                body.get("budget_planned")
            )

            if not name or not status:
                return {
                    "statusCode": 400,
                    "headers": {
                        "Content-Type": "application/json"
                    },
                    "body": json.dumps({
                        "message": "Missing required fields: name and status"
                    })
                }

            project = create_project(name, status, start_date, end_date, budget_planned)

            return {
                "statusCode": 201,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(project)
            }
        except Exception as error:  # noqa: BLE001
            return {
                "statusCode": 500,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps({
                    "message": "Failed to create project",
                    "error": str(error)
                })
            }

    elif event["requestContext"]["http"]["method"] == "PUT":
        path_segments = get_path_segments(event)

        if len(path_segments) != 1:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Project ID is required in the path for update"
                })
            }

        project_id = path_segments[0]

        try:
            body = json.loads(event["body"])
            name = body.get("name")
            status = body.get("status")
            start_date = body.get("start_date")
            end_date = body.get("end_date")
            budget_planned = _normalize_budget(
                body.get("budget_planned")
            )

            project = update_project(project_id, name, status, start_date, end_date, budget_planned)

            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(project)
            }
        except Exception as error:  # noqa: BLE001
            return {
                "statusCode": 500,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps({
                    "message": "Failed to update project",
                    "error": str(error)
                })
            }

    elif event["requestContext"]["http"]["method"] == "DELETE":
        path_segments = get_path_segments(event)

        if len(path_segments) != 1:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Project ID is required in the path for delete"
                })
            }

        project_id = path_segments[0]

        result = delete_project(project_id)

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps(result)
        }

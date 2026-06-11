import json

from path_helpers import get_path_segments
from postgres_service import get_all_deliverables, search_deliverables_by_name, get_deliverable_by_id, get_deliverables_by_project_id, create_deliverable, update_deliverable, delete_deliverable

def handler(event, context):

    if event["requestContext"]["http"]["method"] == "GET":
        path_segments = get_path_segments(event)

        if len(path_segments) == 2 and path_segments[0] == "search":
            name = path_segments[1]

            deliverables = search_deliverables_by_name(name)

            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(deliverables)
            }
        elif len(path_segments) == 2 and path_segments[0] == "project":
            project_id = path_segments[1]

            deliverables = get_deliverables_by_project_id(project_id)

            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(deliverables)
            }
        elif len(path_segments) == 1:
            deliverable_id = path_segments[0]

            deliverable = get_deliverable_by_id(deliverable_id)

            if not deliverable:
                return {
                    "statusCode": 404,
                    "body": json.dumps({
                        "message": "Deliverable not found"
                    })
                }

            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(deliverable)
            }
        
        elif len(path_segments) == 0:
            deliverables = get_all_deliverables()
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(deliverables)
            }

    elif event["requestContext"]["http"]["method"] == "POST":
        body = json.loads(event["body"])

        project_id = body.get("project_id")
        name = body.get("name")
        description = body.get("description")
        status = body.get("status")
        due_date = body.get("due_date")
        estimated_hours = body.get("estimated_hours")

        if not all([project_id, name, description, status, due_date, estimated_hours]):
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Missing required fields"
                })
            }

        depends_on_deliverable_id = body.get("depends_on_deliverable_id")
        new_id = create_deliverable(project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id)

        return {
            "statusCode": 201,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "id": new_id,
                "message": "Deliverable created successfully"
            })
        }

    elif event["requestContext"]["http"]["method"] == "PUT":
        path_segments = get_path_segments(event)
        if len(path_segments) != 1:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Invalid request"
                })
            }

        deliverable_id = path_segments[0]
        body = json.loads(event["body"])
        project_id = body.get("project_id")
        name = body.get("name")
        description = body.get("description")
        status = body.get("status")
        due_date = body.get("due_date")
        estimated_hours = body.get("estimated_hours")

        if not all([deliverable_id, project_id, name, description, status, due_date, estimated_hours]):
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Missing required fields"
                })
            }

        depends_on_deliverable_id = body.get("depends_on_deliverable_id")
        updated_deliverable = update_deliverable(deliverable_id, project_id, name, description, status, due_date, estimated_hours, depends_on_deliverable_id)

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps(updated_deliverable)
        }

    elif event["requestContext"]["http"]["method"] == "DELETE":
        path_segments = get_path_segments(event)
        if len(path_segments) != 1:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Invalid request"
                })
            }
        deliverable_id = path_segments[0]
        delete_result = delete_deliverable(deliverable_id)
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json"
            },
            "body": json.dumps(delete_result)
        }
    else:
        return {
            "statusCode": 405,
            "body": json.dumps({
                "message": "Method not allowed"
            })
        }
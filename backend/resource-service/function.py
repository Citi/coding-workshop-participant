import json

from path_helpers import get_path_segments
from postgres_service import get_all_resources, search_resources_by_person_id, search_resources_by_project_id, get_resource_by_id, create_resource, update_resource, delete_resource

def handler(event, context):
    if event["requestContext"]["http"]["method"] == "GET":
        path_segments = get_path_segments(event)
        if len(path_segments) == 2 and path_segments[0] == "person":
            person_id = path_segments[1]
            resources = search_resources_by_person_id(person_id)
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(resources)
            }
        elif len(path_segments) == 2 and path_segments[0] == "project":
            project_id = path_segments[1]
            resources = search_resources_by_project_id(project_id)
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(resources)
            }
        elif len(path_segments) == 1:
            resource_id = path_segments[0]
            resource = get_resource_by_id(resource_id)
            if not resource:
                return {
                    "statusCode": 404,
                    "body": json.dumps({
                        "message": "Resource not found"
                    })
                }
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(resource)
            }
        elif len(path_segments) == 0:
            resources = get_all_resources()
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(resources)
            }
        else:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Invalid request path"
                })
            }
    elif event["requestContext"]["http"]["method"] == "POST":
        body = json.loads(event["body"])

        person_id = body.get("person_id")
        project_id = body.get("project_id")
        hours_per_week = body.get("hours_per_week")

        create_resource(person_id, project_id, hours_per_week)

        return {
            "statusCode": 201,
            "body": json.dumps({
                "message": "Resource created successfully"
            })
        }
    elif event["requestContext"]["http"]["method"] == "PUT":
        path_segments = get_path_segments(event)
        if len(path_segments) == 1:
            resource_id = path_segments[0]
            body = json.loads(event["body"])

            person_id = body.get("person_id")
            project_id = body.get("project_id")
            hours_per_week = body.get("hours_per_week")

            update_resource(resource_id, person_id, project_id, hours_per_week)

            return {
                "statusCode": 204,
                "body": ""
            }
        else:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Invalid resource ID"
                })
            }
        
    elif event["requestContext"]["http"]["method"] == "DELETE":
        path_segments = get_path_segments(event)
        if len(path_segments) == 1:
            resource_id = path_segments[0]

            delete_resource(resource_id)

            return {
                "statusCode": 204,
                "body": ""
            }
        else:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Invalid resource ID"
                })
            }
    else:
        return {
            "statusCode": 405,
            "body": json.dumps({
                "message": "Method not allowed"
            })
        }
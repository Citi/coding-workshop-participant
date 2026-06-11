import json

from path_helpers import get_path_segments
from postgres_service import get_all_people, search_person_by_name, get_person_by_id, create_person, update_person, delete_person


def handler(event, context):
    
    if event["requestContext"]["http"]["method"] == "GET":

        path_segments = get_path_segments(event)

        if len(path_segments) == 2 and path_segments[0] == "search":
            name = path_segments[1]

            person = search_person_by_name(name)

            if not person:
                return {
                    "statusCode": 404,
                    "body": json.dumps({
                        "message": "Person not found"
                    })
                }

            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(person)
            }

        elif len(path_segments) == 1:
            person_id = path_segments[0]

            person = get_person_by_id(person_id)

            if not person:
                return {
                    "statusCode": 404,
                    "body": json.dumps({
                        "message": "Person not found"
                    })
                }

            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(person)
            }
        
        elif len(path_segments) == 0:
            people = get_all_people()
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(people)
            }
            
        else:
            return {
                "statusCode": 404,
                "body": json.dumps({
                    "message": "Route not found",
                    "path": path_segments
                })
            }
        
    elif event["requestContext"]["http"]["method"] == "POST":
        try:
            body = json.loads(event["body"])
            name = body["name"]
            role = body["role"]
            hourly_rate = body["hourly_rate"]

            person_id = create_person(name, role, hourly_rate)

            return {
                "statusCode": 201,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps({
                    "id": person_id,
                    "name": name,
                    "role": role,
                    "hourly_rate": hourly_rate
                })
            }

        except (KeyError, json.JSONDecodeError) as e:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Invalid request body",
                    "error": str(e)
                })
            }
    elif event["requestContext"]["http"]["method"] == "PUT":
        try:
            path_segments = get_path_segments(event)
            person_id = path_segments[0]
            body = json.loads(event["body"])
            name = body["name"]
            role = body["role"]
            hourly_rate = body["hourly_rate"]

            updated_person = update_person(person_id, name, role, hourly_rate)

            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps(updated_person)
            }

        except (KeyError, json.JSONDecodeError) as e:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Invalid request body",
                    "error": str(e)
                })
            }
    elif event["requestContext"]["http"]["method"] == "DELETE":
        try:
            path_segments = get_path_segments(event)
            person_id = path_segments[0]

            delete_person(person_id)

            return {
                "statusCode": 204,
                "body": ""
            }

        except (KeyError, json.JSONDecodeError) as e:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "message": "Invalid request body",
                    "error": str(e)
                })
            }


    return {
        "statusCode": 405,
        "body": json.dumps({
            "message": "Method not allowed"
        })
    }
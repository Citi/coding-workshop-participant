import json

from postgres_service import ( get_total_weeks, get_weekly_cost )
from path_helpers import get_path_segments

def handler(event, context):
    if event["requestContext"]["http"]["method"] == "GET":
        path_segments = get_path_segments(event)

        if len(path_segments) == 2 and path_segments[0] == "cost":
            total_weeks = get_total_weeks(path_segments[1])
            weekly_cost = get_weekly_cost(path_segments[1])
            total_cost = round(total_weeks * float(weekly_cost), 2)
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps({
                    "budget": total_cost
                })
            }
    return {
        "statusCode": 404,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps({
            "message": "Not Found"
        })
    }
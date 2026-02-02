import json

def handler(event = None, context = None):
    """
    AWS Lambda Hello World.
    """

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"message": "Hello, World!"}),
    }

if __name__ == "__main__":
    print(handler())

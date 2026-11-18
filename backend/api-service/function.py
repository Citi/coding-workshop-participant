"""
AWS Lambda entry point (handler: function.handler).

Wraps the FastAPI app with Mangum so the same app runs on Lambda Function URLs
(LocalStack locally, AWS in the cloud) and under uvicorn for local debugging:

    uvicorn app.main:app --reload --port 8000     # then open http://localhost:8000/docs
"""

from mangum import Mangum

from app.main import app

handler = Mangum(app, lifespan="off")

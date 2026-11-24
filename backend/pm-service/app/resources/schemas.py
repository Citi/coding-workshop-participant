"""Request bodies for the resources (team members) endpoints."""

from app.core.validation import ApiModel, Email, Name120, Text100


class ResourceRequest(ApiModel):
    """Body of POST /resources and PUT /resources/{id} (PUT is a full update)."""

    full_name: Name120
    email: Email
    job_title: Text100
    department: Text100

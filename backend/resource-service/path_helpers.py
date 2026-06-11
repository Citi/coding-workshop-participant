def get_path_segments(event):
    path = event.get("requestContext", {}) \
                .get("http", {}) \
                .get("path", "")

    segments = [segment for segment in path.strip("/").split("/") if segment]

    # CloudFront forwards the full /api/<service-name>/... path to Lambda.
    # Strip the leading "api" and service-name prefix so handlers receive
    # only the meaningful sub-path segments (e.g. ["project", "35"]).
    if len(segments) >= 2 and segments[0] == "api":
        return segments[2:]

    return segments

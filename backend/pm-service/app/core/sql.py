"""Small SQL helpers shared by repositories (always used with parameterized queries)."""


def like_pattern(term: str) -> str:
    r"""Case-insensitive "contains" pattern for ``ILIKE %s ESCAPE '\'``.

    Escapes the LIKE wildcards in user input so "50%" searches for the literal text.
    """
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"

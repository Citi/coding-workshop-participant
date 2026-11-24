"""Unit tests for scripts/seed_demo_data.py: only http(s) base URLs ever reach urllib (no network)."""

import importlib.util
import json
import re
import sys
import urllib.request
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "seed_demo_data.py"


@pytest.fixture
def seed():
    """A fresh copy of the script module (importing it does not run main())."""
    spec = importlib.util.spec_from_file_location("seed_demo_data", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    """What urlopen returns: a context manager with ``status`` and ``read()``."""

    def __init__(self, status: int, payload: dict):
        self.status = status
        self._raw = json.dumps(payload).encode()

    def read(self) -> bytes:
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False


REJECTED = "must be an http:// or https:// address with a host name and no ? or # part"


@pytest.mark.parametrize(
    "base_url, expected",
    [
        ("http://localhost:3001", "http://localhost:3001/api/pm-service"),
        (" https://d111111abcdef8.cloudfront.net/ ", "https://d111111abcdef8.cloudfront.net/api/pm-service"),
        ("HTTPS://Example.com", "HTTPS://Example.com/api/pm-service"),
        ("http://127.0.0.1:3001/", "http://127.0.0.1:3001/api/pm-service"),
        ("http://[::1]:3001", "http://[::1]:3001/api/pm-service"),
        ("https://example.com/prefix/", "https://example.com/prefix/api/pm-service"),
    ],
)
def test_api_base_accepts_http_and_https(seed, base_url, expected):
    assert seed.api_base(base_url) == expected


@pytest.mark.parametrize(
    "base_url",
    [
        "file:///etc/passwd",
        "ftp://example.com",
        "localhost:3001",
        "//example.com",
        "http://",
        "",
        "javascript:alert(1)",
        # http(s), but no host name
        "http://:3001",
        "https://user:secret@",
        "http://@:80",
        # a port that urllib cannot use
        "http://localhost:abc",
        "http://localhost:99999",
        "http://localhost:0",
        # a query or fragment would swallow the /api/pm-service path appended after it
        "http://localhost:3001?debug=1",
        "http://localhost:3001/?",
        "https://d111111abcdef8.cloudfront.net/#/projects",
    ],
)
def test_api_base_rejects_anything_else(seed, base_url):
    with pytest.raises(ValueError, match=re.escape(REJECTED)):
        seed.api_base(base_url)


def test_default_base_is_the_local_dev_proxy(seed):
    assert seed.BASE == "http://localhost:3001/api/pm-service"


def test_main_stops_with_a_clear_message_before_any_request(seed, monkeypatch):
    def no_network(*_args, **_kwargs):
        raise AssertionError("urlopen must not be called")

    monkeypatch.setattr(urllib.request, "urlopen", no_network)
    with pytest.raises(SystemExit) as exc:
        seed.main(["file:///etc/passwd"])
    assert exc.value.code == (
        "The base URL must be an http:// or https:// address with a host name and no ? or # part"
        " (for example http://localhost:3001), got: 'file:///etc/passwd'"
    )


@pytest.fixture
def login_requests(monkeypatch):
    """Records every request; the fake API rejects the login, so main() stops right after it."""
    requested = []

    def fake_urlopen(request, timeout):
        requested.append((request.get_method(), request.full_url, timeout))
        return FakeResponse(401, {"error": {"code": "INVALID_CREDENTIALS"}})

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    return requested


def test_main_sends_requests_to_the_url_from_the_command_line(seed, login_requests):
    with pytest.raises(SystemExit, match=r"Login failed \(401\)"):
        seed.main(["https://d111111abcdef8.cloudfront.net/"])
    assert login_requests == [("POST", "https://d111111abcdef8.cloudfront.net/api/pm-service/auth/login", 60)]


@pytest.mark.parametrize(
    "argv, expected_url",
    [
        (["seed_demo_data.py"], "http://localhost:3001/api/pm-service/auth/login"),
        (
            ["seed_demo_data.py", "https://d111111abcdef8.cloudfront.net"],
            "https://d111111abcdef8.cloudfront.net/api/pm-service/auth/login",
        ),
    ],
)
def test_main_without_arguments_reads_sys_argv(seed, login_requests, monkeypatch, argv, expected_url):
    """``python3 seed_demo_data.py [base_url]``: the default is the local dev proxy."""
    monkeypatch.setattr(sys, "argv", argv)
    with pytest.raises(SystemExit, match=r"Login failed \(401\)"):
        seed.main()
    assert login_requests == [("POST", expected_url, 60)]

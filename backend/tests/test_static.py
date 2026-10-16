from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.static import IMMUTABLE, NO_CACHE

INDEX = "<!doctype html><title>Woodkeeper</title>"


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    root = tmp_path / "static"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text(INDEX)
    (root / "assets" / "index-abc123.js").write_text("console.log(1)")
    (root / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("outside")
    return root


@pytest.fixture
def web(settings: Settings, static_dir: Path) -> Iterator[TestClient]:
    app = create_app(settings.model_copy(update={"static_dir": static_dir}))
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("path", ["/", "/login", "/some/deep/route", "/?project=3"])
def test_spa_routes_return_index_without_caching(web: TestClient, path: str) -> None:
    response = web.get(path)
    assert response.status_code == 200
    assert response.text == INDEX
    assert response.headers["cache-control"] == NO_CACHE
    assert response.headers["content-type"].startswith("text/html")


def test_assets_are_immutable(web: TestClient) -> None:
    response = web.get("/assets/index-abc123.js")
    assert response.status_code == 200
    assert response.text == "console.log(1)"
    assert response.headers["cache-control"] == IMMUTABLE


def test_missing_asset_is_404_not_index(web: TestClient) -> None:
    response = web.get("/assets/missing.js")
    assert response.status_code == 404
    assert "cache-control" not in response.headers


def test_public_files_are_served(web: TestClient) -> None:
    response = web.get("/favicon.svg")
    assert response.status_code == 200
    assert response.text == "<svg/>"


@pytest.mark.parametrize("path", ["/api/no-such-thing", "/api", "/api/projects/1/nope"])
def test_unknown_api_routes_are_json_404(web: TestClient, path: str) -> None:
    response = web.get(path)
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"detail": "Not Found"}


@pytest.mark.parametrize("method", ["POST", "PATCH", "DELETE", "PUT"])
def test_unknown_api_routes_are_404_for_any_method(web: TestClient, method: str) -> None:
    response = web.request(method, "/api/no-such-thing", json={})
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_test_login_looks_missing_in_production(settings: Settings, static_dir: Path) -> None:
    # The post-deploy smoke test expects 404 (missing), not 405 (wrong method).
    production = settings.model_copy(update={"app_env": "production", "static_dir": static_dir})
    with TestClient(create_app(production)) as client:
        response = client.post("/api/auth/test-login", json={"sub": "x", "email": "x@x"})
    assert response.status_code == 404


def test_head_works_like_get(web: TestClient) -> None:
    response = web.head("/")
    assert response.status_code == 200
    assert response.headers["cache-control"] == NO_CACHE


def test_non_get_on_spa_route_is_405(web: TestClient) -> None:
    assert web.post("/login").status_code == 405


def test_api_still_works(web: TestClient) -> None:
    assert web.get("/api/health").json() == {"status": "ok"}
    assert web.get("/api/auth/me").status_code == 401


def test_no_path_traversal(web: TestClient) -> None:
    for path in ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"]:
        response = web.get(path)
        assert "outside" not in response.text


def test_static_dir_without_index_fails_fast(settings: Settings, tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match=r"index\.html"):
        create_app(settings.model_copy(update={"static_dir": tmp_path}))


def test_spa_route_not_in_openapi(web: TestClient) -> None:
    paths = web.get("/openapi.json").json()["paths"]
    assert "/{path}" not in paths

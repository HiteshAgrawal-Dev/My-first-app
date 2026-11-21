import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import create_app  # noqa: E402


@pytest.fixture()
def app(tmp_path):
    return create_app(db_path=tmp_path / "test.db", static_dir=tmp_path / "no-dist")


@pytest.fixture()
def client(app):
    return TestClient(app)


@pytest.fixture()
def catalog(app):
    return app.state.catalog

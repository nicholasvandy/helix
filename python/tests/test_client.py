"""Tests for HelixClient — uses a real running server."""
import pytest
from helix_agent import HelixClient

SERVER_PORT = 17842


@pytest.fixture
def client():
    return HelixClient(base_url=f"http://localhost:{SERVER_PORT}", platform="tempo")


class TestHelixClient:
    def test_health(self, client):
        h = client.health()
        assert h.get("status") in ("ok", "running")

    def test_repair_known_error(self, client):
        result = client.repair("nonce mismatch: expected 5, got 3")
        assert result.success
        assert result.strategy is not None

    def test_immune_on_repeat(self, client):
        r1 = client.repair("session expired, please re-authenticate")
        assert r1.success
        r2 = client.repair("session expired, please re-authenticate")
        assert r2.success
        assert r2.immune

    def test_genes_list(self, client):
        genes = client.genes()
        assert "genes" in genes or "total" in genes

    def test_platform_override(self, client):
        result = client.repair("AA25 invalid account nonce", platform="coinbase")
        assert result.success

    def test_unreachable_server(self):
        bad_client = HelixClient(base_url="http://localhost:19999", timeout=2)
        result = bad_client.repair("test error")
        assert not result.success
        assert "unreachable" in result.error.lower()

    def test_context_manager(self):
        with HelixClient(base_url=f"http://localhost:{SERVER_PORT}") as c:
            assert c.is_healthy()

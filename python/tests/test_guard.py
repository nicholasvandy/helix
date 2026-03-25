"""Tests for helix_guard context manager."""
from helix_agent import helix_guard

SERVER_PORT = 17842


class TestHelixGuard:
    def test_basic_guard(self):
        with helix_guard("tempo", base_url=f"http://localhost:{SERVER_PORT}") as guard:
            result = guard.repair("nonce mismatch: expected 5, got 3")
            assert result.success
            assert result.strategy is not None

    def test_repair_count(self):
        with helix_guard("tempo", base_url=f"http://localhost:{SERVER_PORT}") as guard:
            guard.repair("error 1")
            guard.repair("error 2")
            assert guard.total_repairs == 2

    def test_immune_tracking(self):
        with helix_guard("tempo", base_url=f"http://localhost:{SERVER_PORT}") as guard:
            guard.repair("session expired, please re-authenticate")
            guard.repair("session expired, please re-authenticate")
            assert guard.immune_count >= 1

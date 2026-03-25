"""Tests for @helix_wrap decorator."""
import pytest
from helix_agent import helix_wrap

SERVER_PORT = 17842


class TestHelixWrap:
    def test_decorator_retries_on_error(self):
        call_count = 0

        @helix_wrap(platform="tempo", base_url=f"http://localhost:{SERVER_PORT}", max_retries=3, retry_delay=0.1)
        def flaky_function():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise Exception("nonce mismatch: expected 5, got 3")
            return "success"

        result = flaky_function()
        assert result == "success"
        assert call_count == 3

    def test_decorator_exposes_client(self):
        @helix_wrap(platform="tempo", base_url=f"http://localhost:{SERVER_PORT}")
        def my_func():
            pass

        assert hasattr(my_func, "helix_client")
        assert my_func.helix_client.is_healthy()

    def test_decorator_raises_after_max_retries(self):
        @helix_wrap(platform="tempo", base_url=f"http://localhost:{SERVER_PORT}", max_retries=2, retry_delay=0.1)
        def always_fails():
            raise Exception("permanent error that never resolves")

        with pytest.raises(Exception, match="permanent error"):
            always_fails()

    def test_on_repair_callback(self):
        repairs = []

        @helix_wrap(
            platform="tempo",
            base_url=f"http://localhost:{SERVER_PORT}",
            max_retries=2,
            retry_delay=0.1,
            on_repair=lambda r: repairs.append(r),
        )
        def fails_once():
            if len(repairs) == 0:
                raise Exception("nonce mismatch: expected 1, got 0")
            return "ok"

        result = fails_once()
        assert result == "ok"
        assert len(repairs) >= 1
        assert repairs[0].success

"""
HelixClient — Core client for Helix REST API.
"""

import os
import time
import logging
from typing import Optional
from dataclasses import dataclass, field

import requests

logger = logging.getLogger("helix")


@dataclass
class RepairResult:
    """Result of a repair attempt."""
    success: bool
    immune: bool = False
    strategy: Optional[str] = None
    strategy_params: dict = field(default_factory=dict)
    confidence: float = 0.0
    q_value: float = 0.0
    llm_used: bool = False
    repair_time_ms: float = 0.0
    error: Optional[str] = None
    raw: dict = field(default_factory=dict)

    @classmethod
    def from_api(cls, data: dict) -> "RepairResult":
        strategy = data.get("strategy") or {}
        failure = data.get("failure") or {}
        return cls(
            success=True,
            immune=data.get("immune", False),
            strategy=strategy.get("name") if strategy else None,
            strategy_params=strategy.get("params", {}) if strategy else {},
            confidence=strategy.get("confidence", 0) if strategy else 0,
            llm_used=failure.get("llmClassified", False),
            repair_time_ms=data.get("repairMs", 0),
            raw=data,
        )

    @classmethod
    def failed(cls, error: str) -> "RepairResult":
        return cls(success=False, error=error)


class HelixClient:
    """
    Client for Helix self-healing server.

    Args:
        base_url: Helix server URL. Default: http://localhost:7842
        timeout: Request timeout in seconds. Default: 10
        agent_id: Identifier for this agent instance.
        platform: Default platform (tempo/privy/coinbase/generic).
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        timeout: int = 10,
        agent_id: Optional[str] = None,
        platform: str = "generic",
    ):
        self.base_url = (
            base_url or os.environ.get("HELIX_URL") or "http://localhost:7842"
        )
        self.timeout = timeout
        self.agent_id = agent_id or f"py-{os.getpid()}"
        self.platform = platform
        self._session = requests.Session()
        self._session.headers.update({"Content-Type": "application/json"})

    def repair(
        self,
        error: str,
        *,
        platform: Optional[str] = None,
        agent_id: Optional[str] = None,
        context: Optional[dict] = None,
    ) -> RepairResult:
        """Send an error to Helix for diagnosis and repair strategy."""
        start = time.monotonic()
        try:
            payload = {
                "error": error,
                "platform": platform or self.platform,
                "agentId": agent_id or self.agent_id,
            }
            if context:
                payload["context"] = context

            resp = self._session.post(
                f"{self.base_url}/repair", json=payload, timeout=self.timeout
            )
            resp.raise_for_status()
            result = RepairResult.from_api(resp.json())
            result.repair_time_ms = (time.monotonic() - start) * 1000

            status = "IMMUNE" if result.immune else f"REPAIR -> {result.strategy}"
            logger.info(f"[helix] {status} ({result.repair_time_ms:.0f}ms)")
            return result

        except requests.RequestException as e:
            logger.warning(f"[helix] Server unreachable: {e}")
            return RepairResult.failed(f"Server unreachable: {e}")
        except Exception as e:
            logger.warning(f"[helix] Repair failed: {e}")
            return RepairResult.failed(str(e))

    def health(self) -> dict:
        """Check Helix server health."""
        try:
            return self._session.get(f"{self.base_url}/health", timeout=self.timeout).json()
        except Exception as e:
            return {"status": "unreachable", "error": str(e)}

    def genes(self) -> dict:
        """List all genes in the Gene Map."""
        try:
            return self._session.get(f"{self.base_url}/genes", timeout=self.timeout).json()
        except Exception as e:
            return {"error": str(e)}

    def status(self) -> dict:
        """Get full server status."""
        try:
            return self._session.get(f"{self.base_url}/status", timeout=self.timeout).json()
        except Exception as e:
            return {"error": str(e)}

    def is_healthy(self) -> bool:
        """Quick check if server is reachable."""
        return self.health().get("status") in ("ok", "running")

    def close(self):
        self._session.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

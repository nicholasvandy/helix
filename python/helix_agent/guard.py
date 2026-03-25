"""
helix_guard — Context manager for block-level protection.
"""

import logging
from typing import Optional, List

from .client import HelixClient, RepairResult

logger = logging.getLogger("helix")


class helix_guard:
    """
    Context manager for Helix self-healing.

    Example:
        with helix_guard("coinbase") as guard:
            try:
                result = agent.transfer(to, amount)
            except Exception as e:
                repair = guard.repair(str(e))
                if repair.immune:
                    result = agent.transfer(to, amount)
    """

    def __init__(
        self,
        platform: str = "generic",
        *,
        base_url: Optional[str] = None,
        agent_id: Optional[str] = None,
    ):
        self._client = HelixClient(
            base_url=base_url, platform=platform, agent_id=agent_id
        )
        self.repairs: List[RepairResult] = []

    def repair(self, error: str, **kwargs) -> RepairResult:
        result = self._client.repair(error, **kwargs)
        self.repairs.append(result)
        return result

    def health(self) -> dict:
        return self._client.health()

    @property
    def total_repairs(self) -> int:
        return len(self.repairs)

    @property
    def immune_count(self) -> int:
        return sum(1 for r in self.repairs if r.immune)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._client.close()
        return False

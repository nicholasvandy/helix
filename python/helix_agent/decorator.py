"""
@helix_wrap — Decorator for automatic error repair.

Catches exceptions, sends to Helix, applies repair strategy, retries.
"""

import functools
import logging
import time
from typing import Optional, Callable, Any

from .client import HelixClient, RepairResult

logger = logging.getLogger("helix")


def helix_wrap(
    platform: str = "generic",
    *,
    base_url: Optional[str] = None,
    max_retries: int = 3,
    retry_delay: float = 1.0,
    on_repair: Optional[Callable[[RepairResult], None]] = None,
    on_failure: Optional[Callable[[Exception, RepairResult], Any]] = None,
):
    """
    Decorator that adds self-healing to any function.

    Example:
        @helix_wrap(platform="coinbase", max_retries=3)
        def send_payment(to, amount):
            return agent.transfer(to, amount)
    """
    client = HelixClient(base_url=base_url, platform=platform)

    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            last_error = None
            repair = RepairResult.failed("no repair attempted")
            for attempt in range(1, max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    logger.info(f"[helix] Attempt {attempt}/{max_retries} failed: {str(e)[:100]}")

                    repair = client.repair(str(e))

                    if not repair.success:
                        time.sleep(retry_delay * attempt)
                        continue

                    if on_repair:
                        on_repair(repair)

                    if repair.strategy == "backoff_retry":
                        delay = retry_delay * (2 ** attempt)
                    elif repair.immune:
                        delay = 0.1
                    else:
                        delay = retry_delay * attempt

                    time.sleep(delay)

            if on_failure:
                result = on_failure(last_error, repair)
                if result is not None:
                    return result
            raise last_error

        wrapper.helix_client = client
        return wrapper

    return decorator

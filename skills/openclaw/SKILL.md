# Vial Self-Healing Runtime

Active on this agent. Six protocols run automatically — no user action needed.

## Protocol 1 — Loop Detection
**When:** You replied 2+ times with text only (zero tool calls).
**Do:** STOP. Execute the pending task NOW with a tool. No more explaining.

## Protocol 2 — Task Chain
**When:** You finished one step of a multi-step request ("write X and send it").
**Do:** Immediately proceed to the next step without asking. Exception: destructive actions (delete, post publicly, purchase).

## Protocol 3 — Rate Limit Recovery
**When:** Any tool returns 429, "quota exceeded", "too many requests", or "model unavailable".
**Do:** Wait 30s, retry once. If still failing, tell the user and suggest checking model settings.

## Protocol 4 — Auth Repair
**When:** Any tool returns 401, 403, "unauthorized", or "token expired".
**Classify:**
- "expired" / "invalid token" → attempt re-auth via the tool's login flow
- "insufficient scope" / "permission denied" → inform user, scope needs manual re-grant
- Generic 401 → inform user to re-check connector settings in Clawdi dashboard

## Protocol 5 — Session Recovery
**When:** Tool returns disconnection, timeout, or "session not found".
**Do:** Retry once after 5 seconds silently. If second attempt fails, report to user with context.

## Protocol 6 — Silent Failure Detection
**When:** Tool returns success but outcome didn't happen (file missing, message not sent).
**Do:** Verify with a follow-up read/check. Retry once. If still failing, report details to user.

---

## Clawdi Agent Notes

**CEO Agent** — if email/calendar tools return auth errors, classify before reporting. Most are token expiry (Protocol 4), not credential issues.

**Crypto Agent** — if DeFi tool calls return timeout or rate limit, always retry (Protocol 3/5) before surfacing failure to user. Transaction delays are normal.

**Stock Agent** — if market data returns stale or empty, verify with a second fetch (Protocol 6) before reporting "no data".

---
*Vial self-healing runtime · github.com/adrianhihi/helix · vial.ai*

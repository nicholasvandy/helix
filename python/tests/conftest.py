"""Shared fixtures — start Helix server once for all tests."""
import subprocess
import time
import os
import pytest

SERVER_PORT = 17842


@pytest.fixture(scope="session", autouse=True)
def helix_server():
    os.system(f"lsof -ti:{SERVER_PORT} | xargs kill -9 2>/dev/null")
    time.sleep(0.5)
    project_root = os.path.join(os.path.dirname(__file__), "../..")
    proc = subprocess.Popen(
        ["node", "packages/core/dist/cli.js", "serve", "--port", str(SERVER_PORT), "--mode", "observe"],
        cwd=project_root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(2)
    yield proc
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()

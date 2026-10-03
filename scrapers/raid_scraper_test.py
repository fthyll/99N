"""Checks for raid_scraper failure handling.

Run: python3 scrapers/raid_scraper_test.py
"""

import os
import subprocess
import sys
import textwrap

REPO = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(REPO, "raid_scraper.py")

STUB = textwrap.dedent(
    """
    class R:
        def __init__(self, code):
            self.status_code = code
            self.text = "stubbed"
        def json(self):
            return {"items": []}
    def get(url, headers=None, **kwargs):
        return R(int(os.environ["STATUS"]))
    """
)


def run(status):
    env = {**os.environ, "COC_API_TOKEN": "x", "CLAN_TAG": "#CPJQ2JV", "PYTHONPATH": REPO, "STATUS": str(status)}
    script = "import os; import http_client; " + STUB + "\nhttp_client.get = get\nimport runpy; runpy.run_path(%r, run_name='__main__')" % SCRIPT
    return subprocess.run([sys.executable, "-c", script], env=env, capture_output=True, text=True)


checks = []


def check(name, cond, detail=""):
    checks.append(cond)
    print(("PASS  " if cond else "FAIL  ") + name + (f"   [{detail}]" if detail else ""))


r = run(525)
check("525 is treated as transient and exits 0", r.returncode == 0 and "Transient upstream error" in (r.stdout + r.stderr), (r.stdout + r.stderr).strip()[-120:])

r = run(403)
check("403 still hard-fails", r.returncode != 0 and "Failed to fetch raid data" in (r.stdout + r.stderr), (r.stdout + r.stderr).strip()[-120:])

print("\n%s  (%d/%d)" % ("ALL PASS" if all(checks) else "FAILURES", sum(checks), len(checks)))
sys.exit(0 if all(checks) else 1)

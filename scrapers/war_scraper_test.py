"""Throwaway harness for war_scraper: run: python3 scrapers/.war_scraper_test.py"""
import json, os, shutil, subprocess, sys, tempfile, textwrap

REPO = os.path.dirname(os.path.abspath(__file__))
STUB = textwrap.dedent('''
    import json, os, sys
    class R:
        def __init__(self, code, payload): self.status_code, self._p = code, payload
        def json(self): return self._p
        @property
        def text(self): return json.dumps(self._p)
    MODE = os.environ["MODE"]
    WAR = {"state": "inWar", "teamSize": 25, "attacksPerMember": 2,
           "preparationStartTime": "20260914T030000.000Z",
           "startTime": "20260915T020000.000Z", "endTime": "20260916T020000.000Z",
           "clan": {"tag": "#CPJQ2JV", "name": "Christ", "stars": 40, "attacks": 25,
                    "destructionPercentage": 80.0, "members": []},
           "opponent": {"tag": "#X", "name": "Opp", "stars": 30, "attacks": 20,
                        "destructionPercentage": 70.0, "members": []}}
    def get(url, headers=None, **kw):
        if MODE == "prep":
            return R(200, {**WAR, "state": "preparation", "clan": {**WAR["clan"], "stars": 0, "attacks": 0, "destructionPercentage": 0.0},
                              "opponent": {**WAR["opponent"], "stars": 0, "attacks": 0, "destructionPercentage": 0.0}})
        if MODE == "notinwar": return R(404, {"reason": "notInWar", "message": "not in war"})
        if MODE == "forbidden": return R(403, {"reason": "accessDenied", "message": "invalid token"})
        if MODE == "ended":    return R(200, {**WAR, "state": "warEnded"})
        if MODE == "live":
            stars = int(os.environ.get("STARS", "40"))
            return R(200, {**WAR, "clan": {**WAR["clan"], "stars": stars}})
    requests.get = get
''')

def run(mode, workdir, stars=None):
    env = {**os.environ, "MODE": mode, "COC_API_TOKEN": "x", "CLAN_TAG": "#CPJQ2JV",
           "PYTHONPATH": REPO}
    if stars: env["STARS"] = str(stars)
    script = "import requests; " + STUB + "\nimport runpy; runpy.run_path(%r, run_name='__main__')" % os.path.join(REPO, "war_scraper.py")
    return subprocess.run([sys.executable, "-c", script], env=env, cwd=workdir,
                          capture_output=True, text=True)

tmp = tempfile.mkdtemp()
os.makedirs(os.path.join(tmp, "data/war_stats"))
F = "war_20260915T020000.000Z.json"
def snap():
    p = os.path.join(tmp, "data/war_stats", F)
    return (json.load(open(p))["clan"]["stars"] if os.path.exists(p) else None,
            os.path.exists(os.path.join(tmp, "data/war_stats_index.json")))

checks = []
def check(name, cond, detail=""):
    checks.append(cond)
    print(("PASS  " if cond else "FAIL  ") + name + (f"   [{detail}]" if detail else ""))

r = run("prep", tmp);            check("preparation -> no file, exit 0", snap() == (None, False) and r.returncode == 0, r.stdout.strip() + r.stderr.strip()[:120])
r = run("notinwar", tmp);        check("404 notInWar -> exit 0, no file", snap() == (None, False) and r.returncode == 0, r.stdout.strip()[:80])
r = run("forbidden", tmp);       check("403 -> hard fail (red CI)", r.returncode != 0 and "Failed to fetch" in r.stdout + r.stderr, (r.stdout + r.stderr).strip()[-90:])
r = run("live", tmp);            check("first inWar -> writes file + index", snap() == (40, True), r.stdout.strip()[:80])
r = run("live", tmp);            check("identical re-run -> no commit churn", snap() == (40, True) and "No change" in r.stdout, r.stdout.strip()[:80])
r = run("live", tmp, stars=55);  check("progress -> file updated to 55", snap() == (55, True), r.stdout.strip()[:80])
r = run("ended", tmp);           check("warEnded -> finalised, stars stay 40", snap()[0] == 40 and "state=warEnded" in r.stdout, r.stdout.strip()[:90])

idx = json.load(open(os.path.join(tmp, "data/war_stats_index.json")))
check("index holds one entry, oldest-first sort", idx == [F], str(idx))
check("finalised file has state warEnded", json.load(open(os.path.join(tmp, "data/war_stats", F)))["state"] == "warEnded")
shutil.rmtree(tmp)
print("\n%s  (%d/%d)" % ("ALL PASS" if all(checks) else "FAILURES", sum(checks), len(checks)))
sys.exit(0 if all(checks) else 1)

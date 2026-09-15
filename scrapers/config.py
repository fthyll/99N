import os
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("COC_API_TOKEN")
RAW_TAG = os.getenv("CLAN_TAG")

# Fail before the first request: an unset token otherwise shows up as an
# unexplained 403 from the API rather than a missing-secret error.
if TOKEN is None:
    raise ValueError("ERROR: COC_API_TOKEN not found.")
if RAW_TAG is None:
    raise ValueError("ERROR: CLAN_TAG not found.")

CLAN_TAG = RAW_TAG.replace("#", "%23")
# Default is the RoyaleAPI proxy (needed on GitHub Actions, whose IPs rotate).
# Locally the token is whitelisted to this machine's IP, so .env can point
# straight at the official API: COC_API_BASE_URL=https://api.clashofclans.com/v1
BASE_URL = os.getenv("COC_API_BASE_URL", "https://cocproxy.royaleapi.dev/v1")

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/json"
}

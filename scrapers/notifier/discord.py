"""Discord webhook transport.

The webhook URL is a secret: it comes from DISCORD_WEBHOOK_URL (Actions secret
or local .env) and is never written to data/ or committed. A failure to post is
logged and swallowed — notifications must not break the data pipeline.
"""

import os
import re

import requests

# Loading .env here (not just in config.py) keeps the notifier usable on its
# own: broadcast.py and notify.py never import config, so without this a local
# run would silently see no DISCORD_WEBHOOK_URL even when .env has one.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:  # dotenv is optional for the transport itself
    pass

TIMEOUT = 15


def webhook_url():
    url = (os.getenv('DISCORD_WEBHOOK_URL') or '').strip()
    if not url:
        return None
    # Guard against a pasted-looking value reaching somewhere it should not.
    # Real webhooks come in both shapes: discord.com/api/webhooks/… and the
    # versioned discord.com/api/v10/webhooks/… Discord hands out today.
    if not re.match(r'^https://(canary\.|ptb\.)?discord(app)?\.com/api/(v\d+/)?webhooks/', url):
        print('notify: DISCORD_WEBHOOK_URL does not look like a Discord webhook; skipping')
        return None
    return url


def send(embed=None, content=None, dry_run=False, username=None):
    """Post one message. Returns True when Discord accepted it."""
    payload = {}
    if content:
        payload['content'] = content
    if embed:
        payload['embeds'] = [embed] if isinstance(embed, dict) else list(embed)
    if username:
        payload['username'] = username
    if not payload:
        return False

    url = webhook_url()
    if dry_run:
        import json
        print(json.dumps(payload, indent=2)[:2000])
        return True
    if not url:
        print('notify: DISCORD_WEBHOOK_URL not set; nothing sent')
        return False

    try:
        res = requests.post(url, json=payload, timeout=TIMEOUT)
    except requests.RequestException as exc:
        print(f'notify: Discord request failed ({exc}); continuing')
        return False
    if res.status_code == 429:
        import time
        retry = float(res.headers.get('Retry-After', 2))
        print(f'notify: rate limited, retrying in {retry}s')
        time.sleep(min(retry, 10))
        res = requests.post(url, json=payload, timeout=TIMEOUT)
    if res.status_code >= 300:
        print(f'notify: Discord returned HTTP {res.status_code}: {res.text[:200]}')
        return False
    return True

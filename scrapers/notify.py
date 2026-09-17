"""Discord webhook notifier.

Two entry points:

  python scrapers/notify.py --event war        # called by update_war.yml
  python scrapers/notify.py --event clan       # called by update_clan.yml
  python scrapers/notify.py --event raid       # called by update_raid.yml

Each run compares the freshly-written snapshot against the previous state kept
in data/notify_state.json and posts only what changed. Discord delivery is
best-effort: a missing webhook or a Discord outage must never fail the data
pipeline, so every send is wrapped.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone

from notifier import discord, embeds

STATE_PATH = 'data/notify_state.json'


def _load_state():
    if os.path.exists(STATE_PATH):
        try:
            with open(STATE_PATH, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_state(state):
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, 'w') as f:
        json.dump(state, f, indent=4, sort_keys=True)


def _latest(index_path, folder):
    if not os.path.exists(index_path):
        return None
    with open(index_path, 'r') as f:
        index = json.load(f)
    if not index:
        return None
    # war/raid indices are oldest-first; clan index is newest-first.
    name = index[-1] if folder != 'clan_stats' else index[0]
    path = os.path.join('data', folder, name)
    if not os.path.exists(path):
        return None
    with open(path, 'r') as f:
        return json.load(f)


def _member_tags(snapshot, key='memberList'):
    members = snapshot.get(key) or snapshot.get('members') or []
    return {m.get('tag'): m for m in members if m.get('tag')}


# --------------------------------------------------------------------------
# events
# --------------------------------------------------------------------------

def notify_war(dry_run=False):
    war = _latest('data/war_stats_index.json', 'war_stats')
    if not war:
        print('notify: no war snapshot yet')
        return
    state = _load_state()
    seen = state.setdefault('war', {})
    key = war.get('startTime')
    prev = seen.get(key)
    posts = []

    if war.get('state') == 'preparation' and not prev:
        posts.append(embeds.war_preview(war))
    elif war.get('state') == 'warEnded' and (not prev or prev.get('state') != 'warEnded'):
        posts.append(embeds.war_result(war))

    seen[key] = {
        'state': war.get('state'),
        'clanStars': war.get('clan', {}).get('stars'),
        'opponentStars': war.get('opponent', {}).get('stars'),
    }
    for embed in posts:
        discord.send(embed, dry_run=dry_run)
    _save_state(state)
    print(f'notify: war {key} state={war.get("state")} sent={len(posts)}')


def notify_raid(dry_run=False):
    raid = _latest('data/raid_stats_index.json', 'raid_stats')
    if not raid:
        print('notify: no raid snapshot yet')
        return
    state = _load_state()
    seen = state.setdefault('raid', {})
    key = raid.get('startTime')
    prev = seen.get(key)
    posts = []

    ongoing = raid.get('state') == 'ongoing'
    if ongoing and (not prev or prev.get('state') != 'ongoing'):
        posts.append(embeds.raid_start(raid))
    ended = raid.get('state') == 'ended'
    if ended and (not prev or prev.get('state') != 'ended'):
        posts.append(embeds.raid_summary(raid))

    seen[key] = {'state': raid.get('state'), 'loot': raid.get('capitalTotalLoot')}
    for embed in posts:
        discord.send(embed, dry_run=dry_run)
    _save_state(state)
    print(f'notify: raid {key} state={raid.get("state")} sent={len(posts)}')


def notify_clan(dry_run=False):
    """Membership changes and the weekly donation/reset report."""
    state = _load_state()
    seen = state.setdefault('clan', {})
    index_path = 'data/clan_stats_index.json'
    if not os.path.exists(index_path):
        print('notify: no clan snapshots yet')
        return
    with open(index_path, 'r') as f:
        index = json.load(f)
    current = _latest(index_path, 'clan_stats')
    if not current:
        print('notify: latest clan snapshot unreadable')
        return

    current_tags = _member_tags(current)
    posts = []
    previous_tags = set(seen.get('memberTags') or [])

    if previous_tags:
        joined = [m['name'] for t, m in current_tags.items() if t not in previous_tags]
        left_tags = previous_tags - set(current_tags)
        # State only stores tags, so a departed member is reported by tag. The
        # caller-facing embed therefore receives display names where we have
        # them and tags otherwise.
        left = sorted(left_tags)
        if joined or left:
            posts.append(embeds.membership_change(joined, left, len(current_tags)))

    # Weekly donations reset: the API zeroes the counters, so a snapshot whose
    # total is a fraction of the previous one marks the new week.
    today = datetime.now(timezone.utc).strftime('%Y%m%d')
    totals = {
        'donations': sum((m.get('donations') or 0) for m in current_tags.values()),
        'received': sum((m.get('donationsReceived') or 0) for m in current_tags.values()),
    }
    prev_totals = seen.get('donations')
    if prev_totals and prev_totals.get('week') != today:
        before = prev_totals.get('total') or 1
        if totals['donations'] < before * 0.5:
            top = sorted(current_tags.values(), key=lambda m: m.get('donations') or 0, reverse=True)[:3]
            posts.append(embeds.donation_week(prev_totals, totals, top))
    seen['donations'] = {'week': today, 'total': totals['donations'], 'received': totals['received']}
    seen['memberTags'] = sorted(current_tags)
    seen['lastSnapshot'] = index[0] if index else None

    for embed in posts:
        discord.send(embed, dry_run=dry_run)
    _save_state(state)
    print(f'notify: clan members={len(current_tags)} sent={len(posts)}')


EVENTS = {'war': notify_war, 'raid': notify_raid, 'clan': notify_clan}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--event', required=True, choices=sorted(EVENTS))
    ap.add_argument('--dry-run', action='store_true', help='print payloads instead of posting')
    args = ap.parse_args()
    EVENTS[args.event](dry_run=args.dry_run)


if __name__ == '__main__':
    main()

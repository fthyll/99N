#!/usr/bin/env python3
"""Send one message to the clan's Discord webhook from the command line.

Used by the local broadcast form (`npm run broadcast`, or the dashboard's
Broadcast tab) and handy for tests:

  python3 scrapers/broadcast.py --text "War starts in 10 minutes" \
      --title "War Reminder" --color gold

The webhook URL is read from DISCORD_WEBHOOK_URL (.env or environment) and is
never echoed back.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from notifier import discord  # noqa: E402

COLORS = {'gold': 0xF5B942, 'green': 0x3BA55D, 'red': 0xED4245, 'blue': 0x5865F2, 'grey': 0x95A5A6}


def main():
    ap = argparse.ArgumentParser(description='Broadcast a message to the clan Discord webhook.')
    ap.add_argument('--text', required=True, help='message body (Markdown allowed)')
    ap.add_argument('--title', default=None, help='optional embed title')
    ap.add_argument('--color', default='gold', choices=sorted(COLORS))
    ap.add_argument('--username', default=None, help='override the webhook display name')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    embed = None
    if args.title or args.color:
        embed = {'title': args.title, 'description': args.text, 'color': COLORS[args.color]}
    ok = discord.send(embed=embed, content=None if embed else args.text,
                      username=args.username, dry_run=args.dry_run)
    print('sent' if ok else 'not sent')
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())

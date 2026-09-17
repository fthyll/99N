#!/usr/bin/env python3
"""Fail if index.html has unbalanced <div> nesting.

The Broadcast panel shipped broken because a missing </div> swallowed
#section-broadcast into #section-raids, which is display:none — every element
measured 0x0 and the tab rendered empty. The DOM is balanced enough for
browsers to parse either way, so nothing complained; only a structural check
catches it.

Also asserts every [id^="section-"] is a direct sibling, since switchView()
hides the whole set and unhides one. A nested section can be hidden by its
parent and become permanently unreachable.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"

# Elements that never take a closing tag.
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr"}


def check_balance(html):
    """Return (depth, first_negative_line) for <div> tags only."""
    depth = 0
    first_negative = None
    for lineno, line in enumerate(html.split("\n"), 1):
        for token in re.findall(r"<div\b[^>]*>|</div>", line):
            depth += -1 if token.startswith("</") else 1
            if depth < 0 and first_negative is None:
                first_negative = lineno
    return depth, first_negative


def section_ancestors(html):
    """Map each section id to the ids open when it appears."""
    stack = []
    found = {}
    for line in html.split("\n"):
        for token in re.findall(r"<div\b[^>]*>|</div>", line):
            if token.startswith("</"):
                if stack:
                    stack.pop()
                continue
            id_match = re.search(r'id="([^"]+)"', token)
            element_id = id_match.group(1) if id_match else ""
            if element_id.startswith("section-") and element_id not in found:
                found[element_id] = [sid for sid in stack if sid.startswith("section-")]
            stack.append(element_id)
    return found


def main():
    if not INDEX.exists():
        print(f"FAIL: {INDEX} not found")
        return 1

    html = INDEX.read_text()
    problems = []

    depth, negative = check_balance(html)
    if negative is not None:
        problems.append(f"a closing </div> has no matching opening tag (line {negative})")
    if depth != 0:
        verb = "missing" if depth > 0 else "extra"
        problems.append(f"{abs(depth)} {verb} closing </div> tag(s); depth ends at {depth}")

    sections = section_ancestors(html)
    if not sections:
        problems.append('no id="section-*" elements found — did the markup change?')

    for section_id, ancestors in sections.items():
        nested = [a for a in ancestors if a != section_id]
        if nested:
            problems.append(
                f"#{section_id} is nested inside {', '.join('#' + n for n in nested)}; "
                f"switchView() would hide it with its parent"
            )

    # A section that is never closed will parent whatever follows it.
    print(f"checked {INDEX.name}: {len(sections)} section(s), final div depth {depth}")

    if problems:
        print("\nFAIL:")
        for p in problems:
            print(f"  - {p}")
        return 1

    print("OK: div nesting is balanced and all sections are siblings.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

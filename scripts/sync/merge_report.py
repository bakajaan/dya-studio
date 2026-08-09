#!/usr/bin/env python3
"""Summarize the state of an in-progress upstream merge.

Writes MERGE_CONFLICTS.md listing every still-conflicted file together with the
conflict hunks (small ones inlined, oversized ones summarized only) so the merge
can be reviewed from the repository instead of from CI logs. Creates the marker
file .merge-clean when nothing is left to resolve.
"""

import pathlib
import subprocess

MAX_HUNK_LINES = 160


def sh(*args: str) -> str:
    return subprocess.run(args, capture_output=True, text=True).stdout


def conflict_hunks(lines: list[str]) -> list[tuple[int, int]]:
    hunks: list[tuple[int, int]] = []
    start = None
    for i, line in enumerate(lines):
        if line.startswith("<<<<<<<"):
            start = i
        elif line.startswith(">>>>>>>") and start is not None:
            hunks.append((start, i))
            start = None
    return hunks


def main() -> None:
    conflicted = [p for p in sh("git", "diff", "--name-only", "--diff-filter=U").splitlines() if p]
    out: list[str] = ["# Upstream merge conflicts", ""]
    out.append(f"Unresolved files: {len(conflicted)}")
    out.append("")
    for path in conflicted:
        out.append(f"## {path}")
        out.append("")
        try:
            lines = pathlib.Path(path).read_text(errors="replace").splitlines()
        except OSError as err:
            out.append(f"Could not read file: {err}")
            out.append("")
            continue
        hunks = conflict_hunks(lines)
        out.append(f"{len(hunks)} conflict hunk(s), {len(lines)} lines total.")
        out.append("")
        for start, end in hunks:
            lo = max(0, start - 3)
            hi = min(len(lines), end + 4)
            out.append(f"### lines {lo + 1}-{hi}")
            out.append("")
            if hi - lo > MAX_HUNK_LINES:
                out.append(f"Hunk too large to inline ({hi - lo} lines); resolve from the file itself.")
                out.append("")
                continue
            out.append("```")
            out.extend(lines[lo:hi])
            out.append("```")
            out.append("")
    pathlib.Path("MERGE_CONFLICTS.md").write_text("\n".join(out) + "\n")
    if not conflicted:
        pathlib.Path(".merge-clean").write_text("clean\n")
    print(f"unresolved={len(conflicted)}")


if __name__ == "__main__":
    main()

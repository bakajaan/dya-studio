#!/usr/bin/env python3
"""Apply the agreed per-file resolutions to an in-progress upstream merge.

Policy: follow upstream (cormoran/dya-studio) as closely as possible and
re-apply the fork-specific behaviour on top of the upstream version, rather
than keeping the fork's parallel implementation.

Each entry in RESOLUTIONS lists one rule per conflict hunk, in file order:
  ("ours",)                 keep the fork side
  ("theirs",)               keep the upstream side
  ("ours_then_theirs", j)   fork side, optional joiner lines, then upstream side
  ("theirs_then_ours",)     upstream side first, then the fork side
  ("text", s)               replace the hunk with an explicit block
"""

import pathlib
import subprocess
import sys

RESOLUTIONS: dict[str, list[tuple]] = {
    # Upstream drops the commit pin on the react hook and adds the keyboard-hub
    # packages. The pin and @bufbuild/protobuf are deliberate fork decisions
    # (npm migration), so keep them and add upstream's new dependencies.
    "package.json": [
        (
            "text",
            '    "@bufbuild/protobuf": "^2.0.0",\n'
            '    "@cormoran/zmk-studio-react-hook": "github:cormoran/react-zmk-studio#9192e7abca58b563f417e6f57732338c9918b772",\n'
            '    "@keyboard-hub/abyss-client": "^0.0.1",\n'
            '    "@keyboard-hub/adapter-common": "^0.0.1",\n'
            '    "@keyboard-hub/adapter-zmk": "^0.0.1",',
        )
    ],
    # Icon import list: upstream's Import/Export icon plus the fork's
    # Insights and Lab icons.
    "src/App.tsx": [
        ("text", "  IconChartBar,\n  IconCloudUpload,\n  IconFlask,"),
    ],
    # Upstream's keep-tabs-mounted implementation (TabActiveContext) replaces
    # the fork's parallel implementation entirely.
    "src/components/TabNavigation.tsx": [
        ("theirs",),
        ("theirs",),
        ("theirs",),
    ],
    "src/pages/KeymapPage.tsx": [
        # Icons: fork's Insights toggle icon + upstream's Reload icon.
        ("text", "  IconChartBar,\n  IconRefresh,"),
        # Two independent effects; keep both.
        ("ours_then_theirs", ""),
        # Toolbar: upstream's Reload button first, then the fork's Insights
        # toggle and keymap profile panel.
        ("theirs_then_ours",),
    ],
    "src/setupTests.ts": [
        (
            "text",
            'import { ReadableStream, WritableStream, TransformStream } from "stream/web";\n'
            'import { BroadcastChannel } from "worker_threads";\n'
            'import { resetRpcQueue } from "./lib/rpcQueue";',
        )
    ],
    # The fork's ts-client patch plugins and upstream's client alias are
    # unrelated; keep both. The joiner reopens the doc comment that upstream's
    # side continues.
    "vite.config.ts": [("ours_then_theirs", "/**")],
}

# Applied after conflict resolution, to clean up references that only existed
# on the discarded side of a hunk.
POST_FIXES: dict[str, list[tuple[str, str]]] = {
    "src/components/TabNavigation.tsx": [("handleTabChange", "onTabChange")],
}


def apply_rule(rule: tuple, ours: list[str], theirs: list[str]) -> list[str]:
    mode = rule[0]
    if mode == "ours":
        return ours
    if mode == "theirs":
        return theirs
    if mode == "theirs_then_ours":
        return theirs + ours
    if mode == "ours_then_theirs":
        joiner = rule[1] if len(rule) > 1 else ""
        middle = joiner.split("\n") if joiner else []
        return ours + middle + theirs
    if mode == "text":
        return rule[1].split("\n")
    raise ValueError(f"unknown resolution mode: {mode}")


def resolve_file(path: str, rules: list[tuple]) -> int:
    file = pathlib.Path(path)
    lines = file.read_text().splitlines()
    out: list[str] = []
    index = 0
    hunk = 0
    while index < len(lines):
        line = lines[index]
        if not line.startswith("<<<<<<<"):
            out.append(line)
            index += 1
            continue
        index += 1
        ours: list[str] = []
        theirs: list[str] = []
        while not lines[index].startswith(("=======", "|||||||")):
            ours.append(lines[index])
            index += 1
        if lines[index].startswith("|||||||"):
            while not lines[index].startswith("======="):
                index += 1
        index += 1
        while not lines[index].startswith(">>>>>>>"):
            theirs.append(lines[index])
            index += 1
        index += 1
        rule = rules[hunk] if hunk < len(rules) else ("theirs",)
        hunk += 1
        out.extend(apply_rule(rule, ours, theirs))
    text = "\n".join(out) + "\n"
    for old, new in POST_FIXES.get(path, []):
        text = text.replace(old, new)
    file.write_text(text)
    return hunk


def main() -> None:
    conflicted = set(
        p
        for p in subprocess.run(
            ["git", "diff", "--name-only", "--diff-filter=U"],
            capture_output=True,
            text=True,
        ).stdout.splitlines()
        if p
    )
    failures = 0
    for path, rules in RESOLUTIONS.items():
        if path not in conflicted:
            print(f"skip {path}: not conflicted")
            continue
        hunks = resolve_file(path, rules)
        if hunks != len(rules):
            print(f"WARNING {path}: {hunks} hunks but {len(rules)} rules")
            failures += 1
        subprocess.run(["git", "add", "--", path], check=True)
        print(f"resolved {path} ({hunks} hunk(s))")
    unhandled = sorted(conflicted - set(RESOLUTIONS))
    for path in unhandled:
        print(f"UNHANDLED conflict: {path}")
    if failures:
        sys.exit(0)


if __name__ == "__main__":
    main()

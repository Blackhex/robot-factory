#!/usr/bin/env python3
"""
squash_paths_into_commit.py

Rewrite git history so that changes to the specified files and/or folders
in every commit following TARGET_COMMIT are squashed into TARGET_COMMIT.

After the rewrite:
  * TARGET_COMMIT contains the final state of each specified path (as of HEAD).
  * All descendant commits keep their other changes, but no longer modify any
    of the specified paths (those paths retain the HEAD state throughout).

This is useful for folding "fixup" changes to a handful of files into the
original commit that introduced them, without touching unrelated edits in the
intervening history.

Usage:
    python scripts/squash_paths_into_commit.py <target-commit> <path> [<path> ...]

Paths may be files or directories and are interpreted relative to the
repository root.

Requirements:
    pip install git-filter-repo

WARNING: This rewrites history. Only run on a clean working tree, preferably
on a branch that has not been pushed, and make a backup of the repo first.
"""

from __future__ import annotations

import os
import subprocess
import sys


try:
    import git_filter_repo as fr  # type: ignore
except ImportError:
    sys.exit(
        "git-filter-repo Python module not found. Install with:\n"
        "    pip install git-filter-repo"
    )


def git(*args: str, quiet: bool = False) -> str:
    """Run `git <args>` and return stripped stdout as str.

    If *quiet* is True, stderr is suppressed (useful for probing calls that
    are expected to fail for some inputs).
    """
    stderr = subprocess.DEVNULL if quiet else None
    return subprocess.check_output(["git", *args], stderr=stderr).decode().strip()


def ls_tree(ref: str, path: str) -> dict[bytes, tuple[bytes, bytes]]:
    """Return {name: (mode, sha)} for every blob under `ref:path`, recursively.

    Works for both a single file and a directory. Returns an empty dict when
    the path does not exist at `ref`.
    """
    try:
        out = subprocess.check_output(
            ["git", "ls-tree", "-r", "-z", ref, "--", path],
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        return {}

    entries: dict[bytes, tuple[bytes, bytes]] = {}
    for rec in out.split(b"\x00"):
        if not rec:
            continue
        meta, name = rec.split(b"\t", 1)
        mode, type_, sha = meta.split(b" ")
        if type_ != b"blob":
            continue
        entries[name] = (mode, sha)
    return entries


def normalize_path(p: str) -> bytes:
    """Normalize a user-supplied path to the form git stores internally."""
    return p.replace(os.sep, "/").rstrip("/").encode()


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(
            f"Usage: {sys.argv[0]} <target-commit> <path> [<path> ...]"
        )

    target_arg = sys.argv[1]
    paths = sys.argv[2:]
    path_prefixes = [normalize_path(p) for p in paths]

    # Resolve commit SHAs up front so errors happen before we touch history.
    target_sha = git("rev-parse", "--verify", f"{target_arg}^{{commit}}")
    head_sha = git("rev-parse", "--verify", "HEAD^{commit}")

    try:
        target_parent = git("rev-parse", "--verify", f"{target_sha}^", quiet=True)
    except subprocess.CalledProcessError:
        target_parent = ""  # target is the root commit

    # Refuse to run with tracked modifications; untracked files are fine and
    # won't interfere with history rewriting.
    dirty = git("status", "--porcelain", "--untracked-files=no")
    if dirty:
        sys.exit(
            "Working tree has uncommitted tracked changes. "
            "Commit or stash them first:\n"
            f"{dirty}"
        )

    # Commits to rewrite: target plus every descendant reachable from HEAD.
    rev_range = f"{target_sha}^..HEAD" if target_parent else "HEAD"
    affected = set(git("rev-list", rev_range).splitlines())
    if target_sha not in affected:
        sys.exit(
            f"Target {target_sha} is not an ancestor of HEAD; nothing to do."
        )

    # Desired final state for each path, taken from HEAD.
    head_entries: dict[bytes, tuple[bytes, bytes]] = {}
    for p in paths:
        entries = ls_tree(head_sha, p)
        if not entries:
            print(
                f"[warn] path {p!r} has no tracked files at HEAD; "
                "it will be removed from history entirely.",
                file=sys.stderr,
            )
        head_entries.update(entries)

    # Files that exist under the specified paths in target's parent but not at
    # HEAD must be explicitly deleted in the rewritten target commit, because
    # its (un-rewritten) parent tree still carries them.
    parent_entries: dict[bytes, tuple[bytes, bytes]] = {}
    if target_parent:
        for p in paths:
            parent_entries.update(ls_tree(target_parent, p))
    target_deletes = [n for n in parent_entries if n not in head_entries]

    affected_bytes = {s.encode() for s in affected}
    target_bytes = target_sha.encode()

    def under_specified_path(name: bytes) -> bool:
        for pb in path_prefixes:
            if name == pb or name.startswith(pb + b"/"):
                return True
        return False

    def commit_callback(commit, _metadata) -> None:
        if commit.original_id not in affected_bytes:
            return

        # Strip every file change that touches one of the specified paths;
        # we will re-assert the desired state below.
        commit.file_changes = [
            fc for fc in commit.file_changes
            if not under_specified_path(fc.filename)
        ]

        # Force every specified path to its HEAD content. For descendants of
        # target this is idempotent (parent already matches) which is exactly
        # what we want -- those commits will produce no diff for these paths.
        for name, (mode, sha) in head_entries.items():
            commit.file_changes.append(fr.FileChange(b"M", name, sha, mode))

        # For the target commit specifically, also delete any path-prefixed
        # files that existed in target's (un-rewritten) parent but not at HEAD.
        if commit.original_id == target_bytes:
            for name in target_deletes:
                commit.file_changes.append(
                    fr.FileChange(b"D", name, None, None)
                )

    # --partial keeps remotes and original refs; --refs HEAD limits rewriting
    # to the currently checked-out branch so other branches are untouched.
    args = fr.FilteringOptions.parse_args(
        ["--force", "--partial", "--refs", "HEAD"]
    )
    filt = fr.RepoFilter(args, commit_callback=commit_callback)
    filt.run()

    print("Done. Verify with: git log --stat " + " -- " + " ".join(paths))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Structural validation for an SLS xAPI folder or ZIP.

This is a fast gate, not a substitute for browser and mock-LRS verification.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
import tempfile
import zipfile
from pathlib import Path

from zip_safety import extract_zip_safely


TEXT_SUFFIXES = {".html", ".js", ".css", ".json", ".md", ".txt"}
REQUIRED_PAYLOAD_TERMS = (
    "schemaVersion",
    "score",
    "max",
    "feedback",
    "summary",
    "history",
)
PINNED_VENDOR = {
    "lib/xAPI.js": "ba353b8d33f9bfe6e2a93e797e821a3989390186708c58e984812182c951e030",
    "lib/xapiwrapper.min.js": "ca1955f8387cc9167b3bf3f3813a0a7ed33279f9c7282b5c122f079e51632ac5",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_input(source: Path, target: Path) -> Path:
    if source.is_dir():
        return source
    if source.suffix.lower() != ".zip":
        raise ValueError("Input must be an extracted package directory or a .zip file.")
    with zipfile.ZipFile(source) as archive:
        extract_zip_safely(archive, target)
    return target


def read_text_files(root: Path) -> dict[Path, str]:
    output: dict[Path, str] = {}
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES and "lib" not in path.parts:
            try:
                output[path] = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
    return output


def validate(root: Path, reference: Path | None) -> tuple[list[str], list[str]]:
    failures: list[str] = []
    warnings: list[str] = []
    index = root / "index.html"
    if not index.is_file():
        failures.append("index.html is not at the package root")
        return failures, warnings

    texts = read_text_files(root)
    combined = "\n".join(texts.values())
    index_text = index.read_text(encoding="utf-8", errors="replace")
    scripts = re.findall(r'<script\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']',
                         re.sub(r'<!--[\s\S]*?-->', '', index_text), re.IGNORECASE)
    vendor_order = [src.removeprefix('./') for src in scripts
                    if src.removeprefix('./') in PINNED_VENDOR]
    if vendor_order != ["lib/xapiwrapper.min.js", "lib/xAPI.js"]:
        failures.append("load the wrapper once, followed by xAPI.js once")

    for library in ("lib/xAPI.js", "lib/xapiwrapper.min.js"):
        path = root / library
        if not path.is_file():
            failures.append(f"missing {library}")
        elif not reference and sha256(path) != PINNED_VENDOR[library]:
            failures.append(f"transport differs from pinned baseline: {library}; use --reference for another verified working package")
        if f'./{library}' not in index_text and library not in index_text:
            failures.append(f"index.html does not reference {library}")

    if "storeState" not in combined:
        failures.append("no call or reference to window.storeState(...) was found")

    missing_terms = [term for term in REQUIRED_PAYLOAD_TERMS if term not in combined]
    if missing_terms:
        warnings.append("payload contract terms not found: " + ", ".join(missing_terms))

    external_runtime = re.findall(
        r'''(?:src|href)\s*=\s*["']https?://[^"']+["']''', index_text, flags=re.IGNORECASE
    )
    if external_runtime:
        warnings.append(f"external runtime references found in index.html: {len(external_runtime)}")

    app_text = "\n".join(
        text for path, text in texts.items() if path.name not in {"xAPI.js", "xapiwrapper.min.js"}
    )
    if re.search(r"\b(?:fetch|XMLHttpRequest)\s*\(", app_text) and re.search(
        r"endpoint|sendState|sendStatement", app_text, flags=re.IGNORECASE
    ):
        warnings.append("application code may send xAPI traffic directly; use window.storeState instead")

    if re.search(r"keydown", app_text, flags=re.IGNORECASE) and re.search(
        r"\b(?:event|e)\.key\b", app_text
    ):
        warnings.append("literal key capture detected; record editing semantics, not raw keystrokes")

    if re.search(r"activity-started[\s\S]{0,500}score\s*:\s*0", app_text, flags=re.IGNORECASE):
        warnings.append("possible empty launch score; do not publish untouched 0/N as a result")

    if reference:
        for library in ("lib/xAPI.js", "lib/xapiwrapper.min.js"):
            actual = root / library
            expected = reference / library
            if not expected.is_file():
                failures.append(f"reference package is missing {library}")
            elif actual.is_file() and sha256(actual) != sha256(expected):
                failures.append(f"transport library differs from reference: {library}")

    return failures, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path, help="SLS package directory or ZIP")
    parser.add_argument(
        "--reference",
        type=Path,
        help="another verified working sample directory; otherwise the bundled baseline hashes are required",
    )
    args = parser.parse_args()

    if not args.package.exists():
        parser.error(f"package not found: {args.package}")
    if args.reference and not args.reference.is_dir():
        parser.error("--reference must be an extracted package directory")

    try:
        with tempfile.TemporaryDirectory(prefix="sls-xapi-validate-") as temp_dir:
            root = extract_input(args.package.resolve(), Path(temp_dir))
            failures, warnings = validate(root, args.reference.resolve() if args.reference else None)
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"FAIL: {exc}")
        return 2

    for message in failures:
        print(f"FAIL: {message}")
    for message in warnings:
        print(f"WARN: {message}")
    if failures:
        print(f"Result: failed ({len(failures)} failure(s), {len(warnings)} warning(s))")
        return 1
    print(f"Result: passed ({len(warnings)} warning(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())

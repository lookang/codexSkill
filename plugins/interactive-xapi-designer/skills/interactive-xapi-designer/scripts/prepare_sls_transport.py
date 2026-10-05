#!/usr/bin/env python3
"""Reproduce or verify the pinned public SLS transport without modifying it."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

URL = "https://iwant2study.moe.edu.sg/lookangejss/appXapiIntegratorAgent/api/samples/timeline/scorable_newTab_timeline_countable-nouns-are-nouns-that-can-be-counted-with-pictures-replacements-by-acp_plugin2.zip"
ZIP_SHA = "16f4d7e700d032af5be801c273425b964ea4dd598872e6efdae9ceb989e73d99"
FILES = {
    "lib/xAPI.js": "ba353b8d33f9bfe6e2a93e797e821a3989390186708c58e984812182c951e030",
    "lib/xapiwrapper.min.js": "ca1955f8387cc9167b3bf3f3813a0a7ed33279f9c7282b5c122f079e51632ac5",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--refresh", action="store_true", help="Verify the exact live sample against the pinned ZIP checksum")
    parser.add_argument("--verify-only", action="store_true", help="Verify existing vendor files without writing")
    args = parser.parse_args()
    bundled = Path(__file__).resolve().parents[1] / "assets" / "sls-working-reference.zip"
    if args.refresh:
        with urllib.request.urlopen(URL, timeout=45) as response:
            data = response.read(4 * 1024 * 1024 + 1)
    else:
        data = bundled.read_bytes()
    if digest(data) != ZIP_SHA:
        raise SystemExit("Reference checksum changed; inspect and confirm the baseline. No files written.")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        contents = {name: archive.read(name) for name in FILES}
    for name, expected in FILES.items():
        if digest(contents[name]) != expected:
            raise SystemExit("Reference vendor checksum mismatch: " + name)
        destination = args.output / name
        if args.verify_only and not destination.is_file():
            raise SystemExit("Missing vendor file: " + name)
        if destination.exists() and destination.read_bytes() != contents[name]:
            raise SystemExit("Existing transport differs; preserve the user's working implementation: " + name)
    if not args.verify_only:
        for name, content in contents.items():
            destination = args.output / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        (args.output / "SLS-BASELINE.json").write_text(json.dumps({
            "referenceURL": URL, "zipSHA256": ZIP_SHA,
            "vendorSHA256": FILES, "verified": "exact-bytes",
            "saveLifecycle": "active-check-completion-plus-recovery",
        }, indent=2) + "\n", encoding="utf-8")
    print("Working SLS reference verified; vendor bytes unchanged.")


if __name__ == "__main__":
    main()

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
BUNDLED_FILES = {
    "ANALYTICS-MAP.md": "8968bea689c07682b63739cacdd73c02eca5b7e322e42395a3b7e8257d2033a8",
    "analytics.js": "49a299708b1c065cf17f1f155160cc4b35109701c807f6c4da03d1c7c7eeb0ec",
    "index.html": "e3d27a16c01ba97106c3de158c497169e652eac24f8274df0a86df36e706a95c",
    "instruction.txt": "a4536d92e0e9b56a0498ab3acc5f089c7cba68fb3bb115b0ae6d4fa16c5174e3",
    "lib/xAPI.js": FILES["lib/xAPI.js"],
    "lib/xapiwrapper.min.js": FILES["lib/xapiwrapper.min.js"],
    "log.txt": "d421612711193ed5268f1d60a097ef2018de3bc2bb8d8787adb7d2d52e5d24a0",
    "script.js": "0f5111c55531d254610dd49630751e611575095b30f88c851ac68f6b91b0fda6",
    "styles.css": "5157907fc4222ed0aee787a4238d09b4f361071192014faea2f26c7d0d0a833d",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_bundled_reference(directory):
    actual = {
        path.relative_to(directory).as_posix()
        for path in directory.rglob("*")
        if path.is_file()
    }
    expected = set(BUNDLED_FILES)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise SystemExit(f"Bundled reference inventory changed; missing={missing}, extra={extra}")
    contents = {
        name: (directory / Path(*name.split("/"))).read_bytes()
        for name in BUNDLED_FILES
    }
    return contents


def read_reference_archive(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        actual = {
            info.filename
            for info in archive.infolist()
            if not info.is_dir()
        }
        expected = set(BUNDLED_FILES)
        if actual != expected:
            missing = sorted(expected - actual)
            extra = sorted(actual - expected)
            raise SystemExit(f"Reference archive inventory changed; missing={missing}, extra={extra}")
        return {name: archive.read(name) for name in BUNDLED_FILES}


def verify_reference_files(contents):
    for name, expected in BUNDLED_FILES.items():
        if digest(contents[name]) != expected:
            raise SystemExit("Reference member checksum mismatch: " + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--refresh", action="store_true", help="Verify the exact live sample against the pinned ZIP checksum")
    parser.add_argument("--verify-only", action="store_true", help="Verify existing vendor files without writing")
    args = parser.parse_args()
    bundled = Path(__file__).resolve().parents[1] / "assets" / "sls-working-reference"
    if args.refresh:
        with urllib.request.urlopen(URL, timeout=45) as response:
            data = response.read(4 * 1024 * 1024 + 1)
        if digest(data) != ZIP_SHA:
            raise SystemExit("Reference checksum changed; inspect and confirm the baseline. No files written.")
        contents = read_reference_archive(data)
    else:
        contents = read_bundled_reference(bundled)
    verify_reference_files(contents)
    for name, expected in FILES.items():
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

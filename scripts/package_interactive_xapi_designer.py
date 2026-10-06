#!/usr/bin/env python3
"""Build or verify the Claude/Codex Interactive xAPI Designer distribution ZIP."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins" / "interactive-xapi-designer"
DIST = ROOT / "dist"
ARCHIVE = DIST / "interactive-xapi-designer.zip"
CHECKSUMS = DIST / "SHA256SUMS.txt"
ARCHIVE_NAME = ARCHIVE.name
ARCHIVE_PREFIX = PLUGIN.name + "/"
REQUIRED_FILES = (
    PLUGIN / ".claude-plugin" / "plugin.json",
    PLUGIN / ".codex-plugin" / "plugin.json",
    PLUGIN / "LICENSE",
    PLUGIN / "skills" / "interactive-xapi-designer" / "SKILL.md",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_members() -> list[tuple[str, Path]]:
    if not PLUGIN.is_dir():
        raise SystemExit(f"Plugin source folder not found: {PLUGIN}")
    missing = [str(path.relative_to(ROOT)) for path in REQUIRED_FILES if not path.is_file()]
    if missing:
        raise SystemExit("Required plugin files are missing: " + ", ".join(missing))

    all_paths = sorted(PLUGIN.rglob("*"))
    symlinks = [str(path.relative_to(ROOT)) for path in all_paths if path.is_symlink()]
    if symlinks:
        raise SystemExit("Refusing to package symbolic links: " + ", ".join(symlinks))

    files = [
        path
        for path in all_paths
        if path.is_file()
        and "__pycache__" not in path.parts
        and path.suffix.lower() not in {".pyc", ".pyo"}
        and path.name != ".DS_Store"
    ]
    members = []
    for path in files:
        relative = path.relative_to(PLUGIN).as_posix()
        if PurePosixPath(relative).suffix.lower() == ".zip":
            raise SystemExit(f"Nested ZIP files are not accepted in plugin uploads: {relative}")
        members.append((ARCHIVE_PREFIX + relative, path))

    manifest = json.loads((PLUGIN / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
    if manifest.get("name") != PLUGIN.name:
        raise SystemExit("Claude plugin manifest name does not match the plugin folder")
    if manifest.get("license") != "MIT":
        raise SystemExit("Claude plugin manifest must declare the MIT license")
    return members


def validate_archive(members: list[tuple[str, Path]]) -> str:
    if not ARCHIVE.is_file():
        raise SystemExit(f"Distribution ZIP not found: {ARCHIVE}")
    expected_names = [name for name, _ in members]
    with zipfile.ZipFile(ARCHIVE, "r") as archive:
        bad_member = archive.testzip()
        if bad_member:
            raise SystemExit(f"Corrupt ZIP member: {bad_member}")
        actual_names = [info.filename for info in archive.infolist() if not info.is_dir()]
        if actual_names != expected_names:
            raise SystemExit("Distribution ZIP file list does not match the canonical plugin source")
        nested = [name for name in actual_names if PurePosixPath(name).suffix.lower() == ".zip"]
        if nested:
            raise SystemExit("Distribution ZIP contains nested ZIP files: " + ", ".join(nested))
        for name, source in members:
            if archive.read(name) != source.read_bytes():
                raise SystemExit(f"Distribution ZIP content is stale: {name}")

    archive_hash = sha256_file(ARCHIVE)
    if not CHECKSUMS.is_file():
        raise SystemExit(f"Checksum file not found: {CHECKSUMS}")
    matching_rows = [
        line.split()
        for line in CHECKSUMS.read_text(encoding="ascii").splitlines()
        if line.split() and line.split()[-1] == ARCHIVE_NAME
    ]
    if len(matching_rows) != 1 or matching_rows[0][0].lower() != archive_hash:
        raise SystemExit("dist/SHA256SUMS.txt does not match the distribution ZIP")
    return archive_hash


def write_archive(members: list[tuple[str, Path]]) -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    file_descriptor, temporary_name = tempfile.mkstemp(
        prefix=".interactive-xapi-designer-",
        suffix=".tmp",
        dir=DIST,
    )
    os.close(file_descriptor)
    try:
        with zipfile.ZipFile(
            temporary_name,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
        ) as archive:
            for name, source in members:
                info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(
                    info,
                    source.read_bytes(),
                    compress_type=zipfile.ZIP_DEFLATED,
                    compresslevel=9,
                )
        os.replace(temporary_name, ARCHIVE)
    finally:
        if os.path.exists(temporary_name):
            os.unlink(temporary_name)


def update_checksum() -> None:
    lines = CHECKSUMS.read_text(encoding="ascii").splitlines(keepends=True)
    matches = [index for index, line in enumerate(lines) if line.split() and line.split()[-1] == ARCHIVE_NAME]
    if len(matches) != 1:
        raise SystemExit("Expected exactly one interactive-xapi-designer.zip entry in dist/SHA256SUMS.txt")
    index = matches[0]
    ending = "\r\n" if lines[index].endswith("\r\n") else "\n" if lines[index].endswith("\n") else ""
    lines[index] = f"{sha256_file(ARCHIVE)}  {ARCHIVE_NAME}{ending}"
    with CHECKSUMS.open("w", encoding="ascii", newline="") as stream:
        stream.writelines(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify the existing ZIP, source identity, nested-ZIP rule, and checksum",
    )
    args = parser.parse_args()
    members = source_members()
    if not args.check:
        write_archive(members)
        update_checksum()
    archive_hash = validate_archive(members)
    print(f"Verified {ARCHIVE.relative_to(ROOT)}: {len(members)} files, SHA-256 {archive_hash}")


if __name__ == "__main__":
    main()

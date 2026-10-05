#!/usr/bin/env python3
"""Package an SLS activity with a readable provenance record and stable name."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import re
import shutil
import stat
import tempfile
import unicodedata
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import BinaryIO


METADATA_TEXT = "IWANT2STUDY-METADATA.txt"
METADATA_JSON = "IWANT2STUDY-METADATA.json"
RESERVED_NAMES = {METADATA_TEXT.casefold(), METADATA_JSON.casefold()}
SKIP_PARTS = {".git", "__pycache__"}
SKIP_NAMES = {".ds_store", "thumbs.db"}
ALLOWED_KINDS = {"scorable", "interactive"}
ALLOWED_MODES = {"integrate-only", "integrate-and-improve", "build-or-redesign"}
ALLOWED_VERIFICATION = {"verified", "partial", "not-run"}
ALLOWED_PLATFORMS = {"chatgpt", "codex", "claude-code", "other"}


def slugify(title: str) -> str:
    """Return a short, portable lowercase slug for an exported filename."""
    normalized = unicodedata.normalize("NFKD", title).lower()
    ascii_chars = []
    for char in normalized:
        if char.isascii() and char.isalnum():
            ascii_chars.append(char)
        elif unicodedata.category(char).startswith("M"):
            continue
        else:
            ascii_chars.append("-")
    slug = re.sub(r"-+", "-", "".join(ascii_chars)).strip("-")
    return (slug[:72].rstrip("-") or "activity")


def _validate_member_name(name: str) -> str:
    if not name or "\\" in name or name.startswith("./"):
        raise ValueError(f"Unsafe or ambiguous ZIP path: {name!r}")
    path = PurePosixPath(name)
    if path.is_absolute() or path.as_posix() != name or any(part in {".", ".."} for part in path.parts):
        raise ValueError(f"Unsafe or ambiguous ZIP path: {name!r}")
    if any(":" in part or "\x00" in part for part in path.parts):
        raise ValueError(f"Non-portable ZIP path: {name!r}")
    return name


def _sha256_stream(stream: BinaryIO) -> str:
    digest = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(block)
    return digest.hexdigest()


def _is_reserved(name: str) -> bool:
    return PurePosixPath(name).name.casefold() in RESERVED_NAMES


def _plugin_version() -> str:
    manifest = Path(__file__).resolve().parents[3] / ".codex-plugin" / "plugin.json"
    try:
        return str(json.loads(manifest.read_text(encoding="utf-8")).get("version", "unknown"))
    except (OSError, json.JSONDecodeError):
        return "unknown"


def _load_directory(source: Path, excluded_output: Path | None) -> list[dict]:
    files: list[dict] = []
    for path in sorted(source.rglob("*"), key=lambda item: item.relative_to(source).as_posix().casefold()):
        rel = path.relative_to(source)
        if any(part in SKIP_PARTS for part in rel.parts) or path.name.casefold() in SKIP_NAMES:
            continue
        if path.is_symlink():
            raise ValueError(f"Symbolic links are not supported in SLS packages: {rel.as_posix()}")
        if not path.is_file():
            continue
        if excluded_output is not None and path.resolve() == excluded_output:
            continue
        name = _validate_member_name(rel.as_posix())
        if _is_reserved(name):
            continue
        with path.open("rb") as stream:
            digest = _sha256_stream(stream)
        files.append({"name": name, "path": path, "sha256": digest})
    return files


def _load_archive(source: Path) -> tuple[list[dict], bytes]:
    files: list[dict] = []
    names: set[str] = set()
    with zipfile.ZipFile(source, "r") as archive:
        comment = archive.comment
        for info in archive.infolist():
            if info.is_dir():
                continue
            name = _validate_member_name(info.filename)
            if _is_reserved(name):
                continue
            folded = name.casefold()
            if folded in names:
                raise ValueError(f"Duplicate or case-conflicting ZIP path: {name!r}")
            names.add(folded)
            if info.flag_bits & 0x1:
                raise ValueError(f"Encrypted ZIP members cannot be repackaged: {name!r}")
            unix_mode = (info.external_attr >> 16) & 0xFFFF
            if stat.S_ISLNK(unix_mode):
                raise ValueError(f"Symbolic links are not supported in SLS packages: {name!r}")
            with archive.open(info, "r") as stream:
                digest = _sha256_stream(stream)
            files.append({"name": name, "info": info, "sha256": digest})
    return files, comment


def _read_notes(path: Path | None, *, required: bool = False) -> str:
    if path is None:
        if required:
            raise ValueError("A reviewed --prompt-file is required.")
        return ""
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise ValueError(f"Cannot read {path}: {exc}") from exc
    if required and not value:
        raise ValueError(f"{path} is empty; provide the final activity prompt or brief.")
    return value


def package_activity(
    source: Path,
    *,
    title: str,
    kind: str,
    mode: str,
    platform: str,
    model: str,
    effort: str,
    prompt: str,
    iterations: list[str],
    output_dir: Path,
    verification_status: str = "not-run",
    verification_notes: list[str] | None = None,
    force: bool = False,
) -> Path:
    """Create the final activity ZIP, preserving source member contents byte for byte."""
    source = Path(source)
    if source.is_symlink():
        raise ValueError("Source folder or ZIP must not be a symbolic link.")
    source = source.resolve()
    output_dir = output_dir.resolve()
    if source.is_symlink() or not source.exists() or not (source.is_dir() or source.is_file()):
        raise ValueError(f"Source must be an existing regular folder or ZIP file: {source}")
    if kind not in ALLOWED_KINDS:
        raise ValueError(f"kind must be one of: {', '.join(sorted(ALLOWED_KINDS))}")
    if mode not in ALLOWED_MODES:
        raise ValueError(f"mode must be one of: {', '.join(sorted(ALLOWED_MODES))}")
    if platform not in ALLOWED_PLATFORMS:
        raise ValueError(f"platform must be one of: {', '.join(sorted(ALLOWED_PLATFORMS))}")
    if verification_status not in ALLOWED_VERIFICATION:
        raise ValueError(f"verification_status must be one of: {', '.join(sorted(ALLOWED_VERIFICATION))}")
    if not title.strip() or not prompt.strip() or not model.strip() or not effort.strip():
        raise ValueError("Title, prompt/brief, model label, and effort label must be non-empty; use 'not-reported' when unknown.")
    cleaned_iterations = [item.strip() for item in iterations if item.strip()]
    if not cleaned_iterations:
        raise ValueError("Provide at least one concise iteration note, including for a one-pass build.")

    output_name = f"iwant2study.moe.edu.sg_{kind}_{slugify(title)}.zip"
    output_path = output_dir / output_name
    if output_path == source:
        raise ValueError("Output ZIP must not overwrite its source.")
    if output_path.exists() and not force:
        raise FileExistsError(f"{output_path} already exists; pass --force to replace this output.")

    if source.is_dir():
        excluded = output_path if output_path.is_relative_to(source) else None
        files = _load_directory(source, excluded)
        source_comment = b""
        archive_source = False
    else:
        if not zipfile.is_zipfile(source):
            raise ValueError(f"Input file is not a valid ZIP: {source}")
        files, source_comment = _load_archive(source)
        archive_source = True

    names = {record["name"] for record in files}
    folded_names: set[str] = set()
    for name in names:
        folded = name.casefold()
        if folded in folded_names:
            raise ValueError(f"Duplicate or case-conflicting package path: {name!r}")
        folded_names.add(folded)
    if "index.html" not in names:
        raise ValueError("SLS package must contain index.html at the ZIP root.")

    metadata = {
        "schemaVersion": 1,
        "generator": {"name": "Interactive xAPI Designer", "version": _plugin_version()},
        "authoringEnvironment": {
            "platform": platform,
            "model": model.strip(),
            "effort": effort.strip(),
            "effortKind": "provider-specific reasoning effort or thinking budget",
            "captureNote": "Exact runtime labels or author-reported settings; the packager does not infer them.",
        },
        "package": {
            "filename": output_name,
            "title": title.strip(),
            "kind": kind,
            "authoringMode": mode,
            "createdAtUTC": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "sourceType": "zip" if archive_source else "folder",
            "entryPoint": "index.html",
        },
        "prompt": prompt.strip(),
        "iterations": cleaned_iterations,
        "verification": {
            "status": verification_status,
            "notes": [note.strip() for note in (verification_notes or []) if note.strip()],
        },
        "sourceFiles": [{"path": record["name"], "sha256": record["sha256"]} for record in files],
        "privacy": {
            "included": "Reviewed activity prompt/brief, concise iteration notes, file hashes and verification notes.",
            "excluded": "Hidden model reasoning, learner identity or responses, launch credentials, and unrelated conversation.",
            "reviewBeforeSharing": True,
        },
    }
    metadata_json = (json.dumps(metadata, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    metadata_txt = _render_text(metadata).encode("utf-8")

    output_dir.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=output_name + ".", suffix=".tmp", dir=output_dir)
    os.close(fd)
    temp_path = Path(temp_name)
    try:
        with zipfile.ZipFile(temp_path, "w", allowZip64=True) as destination:
            destination.comment = source_comment
            if archive_source:
                with zipfile.ZipFile(source, "r") as original:
                    for record in files:
                        info = copy.copy(record["info"])
                        with original.open(record["info"], "r") as src, destination.open(info, "w") as dst:
                            shutil.copyfileobj(src, dst, length=1024 * 1024)
            else:
                for record in files:
                    path = record["path"]
                    info = zipfile.ZipInfo(record["name"], date_time=datetime.fromtimestamp(path.stat().st_mtime).timetuple()[:6])
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = (stat.S_IFREG | 0o644) << 16
                    with path.open("rb") as src, destination.open(info, "w") as dst:
                        shutil.copyfileobj(src, dst, length=1024 * 1024)
            destination.writestr(METADATA_JSON, metadata_json, compress_type=zipfile.ZIP_DEFLATED)
            destination.writestr(METADATA_TEXT, metadata_txt, compress_type=zipfile.ZIP_DEFLATED)
        if output_path.exists() and not force:
            raise FileExistsError(f"{output_path} appeared while packaging; pass --force to replace it.")
        os.replace(temp_path, output_path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    return output_path


def _render_text(metadata: dict) -> str:
    package = metadata["package"]
    verification = metadata["verification"]
    lines = [
        "IWANT2STUDY SLS PACKAGE PROVENANCE",
        "===================================",
        f"Title: {package['title']}",
        f"ZIP filename: {package['filename']}",
        f"Package type: {package['kind']}",
        f"Authoring mode: {package['authoringMode']}",
        f"Created (UTC): {package['createdAtUTC']}",
        f"Entry point: {package['entryPoint']}",
        f"Generated by: {metadata['generator']['name']} {metadata['generator']['version']}",
        f"Authoring platform: {metadata['authoringEnvironment']['platform']}",
        f"Model: {metadata['authoringEnvironment']['model']}",
        f"Reasoning/thinking effort: {metadata['authoringEnvironment']['effort']}",
        "",
        "FINAL ACTIVITY PROMPT / BRIEF",
        "-----------------------------",
        metadata["prompt"],
        "",
        "IMPLEMENTATION ITERATIONS",
        "-------------------------",
    ]
    lines.extend(f"{number}. {note}" for number, note in enumerate(metadata["iterations"], start=1))
    lines.extend(["", f"VERIFICATION: {verification['status'].upper()}"])
    lines.extend(f"- {note}" for note in verification["notes"])
    lines.extend(["", f"SOURCE FILE HASHES ({len(metadata['sourceFiles'])} files)", "------------------"])
    lines.extend(f"{item['sha256']}  {item['path']}" for item in metadata["sourceFiles"])
    lines.extend([
        "",
        "PRIVACY NOTE",
        "------------",
        "This record is stored inside the ZIP. Review it before sharing. It should contain no learner identities/responses, launch credentials, hidden model reasoning, or unrelated conversation.",
        "Model and effort labels are copied from the runtime when available or entered by the author; the helper does not detect them. Verification notes describe only the checks actually completed; they do not by themselves prove live SLS acceptance or learner attribution.",
        "",
    ])
    return "\n".join(lines)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Activity folder or ZIP with index.html at its root")
    parser.add_argument("--title", required=True, help="Activity title used to create the filename slug")
    parser.add_argument("--kind", choices=sorted(ALLOWED_KINDS), required=True, help="Use scorable only when a real score is computed")
    parser.add_argument("--mode", choices=sorted(ALLOWED_MODES), required=True, help="Authoring scope used for this activity")
    parser.add_argument("--platform", choices=sorted(ALLOWED_PLATFORMS), required=True, help="ChatGPT, Codex, Claude Code, or other authoring surface")
    parser.add_argument("--model", required=True, help="Exact model label from the runtime, or not-reported")
    parser.add_argument("--effort", required=True, help="Exact reasoning/thinking effort label, or not-reported")
    parser.add_argument("--prompt-file", type=Path, required=True, help="Reviewed final activity prompt/brief in UTF-8 text")
    parser.add_argument("--iterations-file", type=Path, required=True, help="UTF-8 text file with one concise build/integration round per line")
    parser.add_argument("--output-dir", type=Path, help="Output folder; defaults to a sibling folder named sls-packages")
    parser.add_argument("--verification-status", choices=sorted(ALLOWED_VERIFICATION), default="not-run")
    parser.add_argument("--verification-note", action="append", default=[], help="A truthful check/result note; may be repeated")
    parser.add_argument("--force", action="store_true", help="Replace the matching output ZIP after a successful rebuild")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    source = args.source
    output_dir = (args.output_dir or (source.absolute().parent / "sls-packages")).resolve()
    try:
        prompt = _read_notes(args.prompt_file, required=True)
        iteration_text = _read_notes(args.iterations_file, required=True)
        iterations = [line.strip() for line in iteration_text.splitlines() if line.strip()]
        output_path = package_activity(
            source,
            title=args.title,
            kind=args.kind,
            mode=args.mode,
            platform=args.platform,
            model=args.model,
            effort=args.effort,
            prompt=prompt,
            iterations=iterations,
            output_dir=output_dir,
            verification_status=args.verification_status,
            verification_notes=args.verification_note,
            force=args.force,
        )
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        _parser().error(str(exc))
    with output_path.open("rb") as stream:
        archive_hash = _sha256_stream(stream)
    print(f"Created: {output_path}")
    print(f"SHA-256: {archive_hash}")
    print(f"Included: {METADATA_TEXT}, {METADATA_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

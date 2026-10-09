"""Bounded extraction for user-supplied SLS ZIP packages."""

from __future__ import annotations

import stat
import zipfile
from pathlib import Path, PurePosixPath


MAX_ARCHIVE_MEMBERS = 10_000
MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024


def _validated_member_path(info: zipfile.ZipInfo) -> tuple[PurePosixPath, bool]:
    name = info.filename
    is_directory = info.is_dir()
    normalized = name[:-1] if is_directory and name.endswith("/") else name
    if (
        not normalized
        or "\\" in normalized
        or ":" in normalized
        or "\x00" in normalized
        or normalized.startswith("/")
    ):
        raise ValueError(f"Unsafe ZIP path: {name!r}")

    path = PurePosixPath(normalized)
    if not path.parts or path.is_absolute() or path.as_posix() != normalized or any(
        part in {"", ".", ".."} for part in path.parts
    ):
        raise ValueError(f"Unsafe or ambiguous ZIP path: {name!r}")

    mode = (info.external_attr >> 16) & 0xFFFF
    file_type = stat.S_IFMT(mode)
    if file_type == stat.S_IFLNK:
        raise ValueError(f"Symbolic links are not supported in ZIP packages: {name!r}")
    if file_type not in {0, stat.S_IFREG, stat.S_IFDIR}:
        raise ValueError(f"Special files are not supported in ZIP packages: {name!r}")
    if is_directory != (file_type == stat.S_IFDIR) and file_type != 0:
        raise ValueError(f"ZIP entry type does not match its path: {name!r}")
    if info.flag_bits & 0x1:
        raise ValueError(f"Encrypted ZIP entries are not supported: {name!r}")
    if is_directory and info.file_size:
        raise ValueError(f"ZIP directory entry contains data: {name!r}")
    if not is_directory and info.file_size < 0:
        raise ValueError(f"Invalid ZIP entry size: {name!r}")
    return path, is_directory


def extract_zip_safely(archive: zipfile.ZipFile, target: Path) -> int:
    """Extract regular files under target, enforcing path and expansion limits.

    Returns the number of bytes written. The destination is expected to be a new,
    private staging directory. Existing file destinations are never overwritten.
    """
    target = Path(target)
    if target.is_symlink():
        raise ValueError("ZIP extraction target must not be a symbolic link.")
    target.mkdir(parents=True, exist_ok=True)
    root = target.resolve()
    members = archive.infolist()
    if len(members) > MAX_ARCHIVE_MEMBERS:
        raise ValueError("ZIP contains too many entries.")

    checked: list[tuple[zipfile.ZipInfo, PurePosixPath, bool]] = []
    total_declared = 0
    explicit: set[str] = set()
    files: set[str] = set()
    directories: set[str] = {""}
    spellings: dict[str, str] = {}

    for info in members:
        path, is_directory = _validated_member_path(info)
        name = path.as_posix()
        key = name.casefold()
        if key in explicit:
            raise ValueError(f"Duplicate or case-conflicting ZIP path: {name!r}")
        explicit.add(key)

        for index in range(1, len(path.parts) + 1):
            prefix = "/".join(path.parts[:index])
            prefix_key = prefix.casefold()
            previous = spellings.setdefault(prefix_key, prefix)
            if previous != prefix:
                raise ValueError(f"Case-conflicting ZIP paths: {previous!r} and {prefix!r}")
            if index < len(path.parts):
                if prefix_key in files:
                    raise ValueError(f"A ZIP file is also used as a directory: {prefix!r}")
                directories.add(prefix_key)

        if is_directory:
            if key in files:
                raise ValueError(f"A ZIP path is both a file and directory: {name!r}")
            directories.add(key)
        else:
            if key in directories:
                raise ValueError(f"A ZIP path is both a file and directory: {name!r}")
            files.add(key)
            total_declared += info.file_size
            if total_declared > MAX_UNCOMPRESSED_BYTES:
                raise ValueError("ZIP expands beyond the 200 MiB safety limit.")
        checked.append((info, path, is_directory))

    total_written = 0
    for info, path, is_directory in checked:
        destination = target.joinpath(*path.parts)
        resolved = destination.resolve(strict=False)
        try:
            resolved.relative_to(root)
        except ValueError as exc:
            raise ValueError(f"ZIP path escapes the extraction directory: {info.filename!r}") from exc

        current = target
        for part in path.parts[:-1]:
            current = current / part
            if current.is_symlink():
                raise ValueError(f"ZIP path traverses a symbolic link: {info.filename!r}")

        if is_directory:
            if destination.exists() and not destination.is_dir():
                raise ValueError(f"ZIP path is both a file and directory: {info.filename!r}")
            destination.mkdir(parents=True, exist_ok=True)
            if destination.is_symlink():
                raise ValueError(f"ZIP path created a symbolic link: {info.filename!r}")
            continue

        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists() or destination.is_symlink():
            raise ValueError(f"Refusing to overwrite an existing ZIP destination: {info.filename!r}")
        member_written = 0
        with archive.open(info, "r") as source, destination.open("xb") as output:
            while True:
                chunk = source.read(CHUNK_SIZE)
                if not chunk:
                    break
                member_written += len(chunk)
                total_written += len(chunk)
                if member_written > info.file_size or total_written > MAX_UNCOMPRESSED_BYTES:
                    raise ValueError("ZIP expanded beyond its declared or allowed size.")
                output.write(chunk)
        if member_written != info.file_size:
            raise ValueError(f"ZIP entry size does not match its header: {info.filename!r}")

    return total_written

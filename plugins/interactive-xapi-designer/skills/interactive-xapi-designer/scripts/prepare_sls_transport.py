#!/usr/bin/env python3
"""Reproduce or verify the pinned bundled SLS transport without network access."""

import argparse
import hashlib
import json
from pathlib import Path


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


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_bundled_reference(directory: Path) -> dict[str, bytes]:
    paths = list(directory.rglob("*"))
    if any(path.is_symlink() for path in paths):
        raise ValueError("Bundled reference must not contain symbolic links.")
    actual = {
        path.relative_to(directory).as_posix()
        for path in paths
        if path.is_file()
    }
    expected = set(BUNDLED_FILES)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise ValueError(f"Bundled reference inventory changed; missing={missing}, extra={extra}")
    contents = {
        name: (directory / Path(*name.split("/"))).read_bytes()
        for name in BUNDLED_FILES
    }
    for name, expected_hash in BUNDLED_FILES.items():
        if digest(contents[name]) != expected_hash:
            raise ValueError("Bundled reference checksum mismatch: " + name)
    return contents


def _ensure_directory(root: Path, parts: tuple[str, ...]) -> Path:
    current = root
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Refusing to write through a symbolic link: {current}")
        current.mkdir(exist_ok=True)
    return current


def prepare_transport(output: Path, *, verify_only: bool = False) -> None:
    """Copy the hash-pinned bundled transport without network or overwrite access."""
    output = Path(output)
    if output.is_symlink():
        raise ValueError("Output directory must not be a symbolic link.")
    if verify_only:
        if not output.is_dir():
            raise ValueError("Verification output path must be an existing directory.")
    else:
        output.mkdir(parents=True, exist_ok=True)
    if not output.is_dir():
        raise ValueError("Output path must be a directory.")
    output = output.resolve()

    bundled = Path(__file__).resolve().parents[1] / "assets" / "sls-working-reference"
    contents = read_bundled_reference(bundled)
    for name in FILES:
        destination = output / Path(*name.split("/"))
        parent_parts = tuple(name.split("/")[:-1])
        if verify_only:
            parent = output
            for part in parent_parts:
                parent = parent / part
                if parent.is_symlink():
                    raise ValueError("Refusing to use a symbolic link: " + part)
                if not parent.is_dir():
                    raise ValueError("Missing transport directory: " + part)
        else:
            _ensure_directory(output, parent_parts)
        if destination.is_symlink():
            raise ValueError("Refusing to use a symbolic link: " + name)
        if destination.exists():
            if not destination.is_file() or destination.read_bytes() != contents[name]:
                raise ValueError("Existing transport differs; preserve the user's working implementation: " + name)
        elif verify_only:
            raise ValueError("Missing vendor file: " + name)

    manifest = {
        "reference": "bundled-sls-working-reference",
        "referenceFilesSHA256": BUNDLED_FILES,
        "vendorSHA256": FILES,
        "verified": "exact-bytes",
        "saveLifecycle": "active-check-completion-plus-recovery",
    }
    manifest_bytes = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    baseline = output / "SLS-BASELINE.json"
    if baseline.is_symlink():
        raise ValueError("Refusing to use a symbolic link: SLS-BASELINE.json")
    if baseline.exists() and baseline.read_bytes() != manifest_bytes:
        raise ValueError("Existing SLS-BASELINE.json differs; preserve the user's file.")

    if not verify_only:
        for name in FILES:
            destination = output / Path(*name.split("/"))
            if not destination.exists():
                with destination.open("xb") as stream:
                    stream.write(contents[name])
        if not baseline.exists():
            with baseline.open("xb") as stream:
                stream.write(manifest_bytes)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--verify-only", action="store_true", help="Verify existing vendor files without writing")
    args = parser.parse_args()
    try:
        prepare_transport(args.output, verify_only=args.verify_only)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    print("Bundled SLS reference verified; vendor bytes unchanged and no network request was made.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

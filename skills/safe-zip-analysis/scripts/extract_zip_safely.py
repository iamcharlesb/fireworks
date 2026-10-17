#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from stat import S_ISLNK
import zipfile


BLOCKED_EXECUTABLE_SUFFIXES = {
    ".app",
    ".appimage",
    ".apk",
    ".bin",
    ".com",
    ".deb",
    ".dll",
    ".dylib",
    ".exe",
    ".ipa",
    ".jar",
    ".msi",
    ".pkg",
    ".rpm",
    ".run",
    ".scr",
    ".so",
    ".war",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Safely extract ZIP files for analysis.")
    parser.add_argument("zip_path", help="Path to the source .zip file")
    parser.add_argument("output_dir", help="Directory where extracted files should be written")
    parser.add_argument("--manifest-name", default="manifest.json", help="Manifest filename to write")
    return parser.parse_args()


def is_binary_executable(member: zipfile.ZipInfo) -> bool:
    suffix = Path(member.filename).suffix.lower()
    return suffix in BLOCKED_EXECUTABLE_SUFFIXES


def member_mode(member: zipfile.ZipInfo) -> int:
    return (member.external_attr >> 16) & 0xFFFF


def is_symlink(member: zipfile.ZipInfo) -> bool:
    return S_ISLNK(member_mode(member))


def safe_destination(root: Path, member_name: str) -> Path:
    destination = (root / member_name).resolve()
    root_resolved = root.resolve()
    if os.path.commonpath([str(root_resolved), str(destination)]) != str(root_resolved):
        raise ValueError("path traversal")
    return destination


def main() -> int:
    args = parse_args()
    zip_path = Path(args.zip_path).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "archive": str(zip_path),
        "output_dir": str(output_dir),
        "extracted": [],
        "skipped": [],
    }

    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.infolist():
        if member.is_dir():
            try:
                safe_destination(output_dir, member.filename).mkdir(parents=True, exist_ok=True)
            except ValueError:
                manifest["skipped"].append({"path": member.filename, "reason": "path traversal"})
            continue

        if is_symlink(member):
            manifest["skipped"].append({"path": member.filename, "reason": "symlink"})
            continue

        if is_binary_executable(member):
            manifest["skipped"].append({"path": member.filename, "reason": "binary executable"})
            continue

        try:
            destination = safe_destination(output_dir, member.filename)
        except ValueError:
            manifest["skipped"].append({"path": member.filename, "reason": "path traversal"})
            continue

        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(member, "r") as source, destination.open("wb") as target:
            target.write(source.read())
        manifest["extracted"].append({"path": member.filename, "size": member.file_size})

    manifest_path = output_dir / args.manifest_name
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"output_dir": str(output_dir), "manifest": str(manifest_path)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Run dependency-free ffprobe/ffmpeg checks on a tutorial MP4."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def ffprobe(path: Path) -> dict:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate:"
            "stream=index,codec_name,codec_type,width,height,"
            "r_frame_rate,sample_rate,channels",
            "-of",
            "json",
            str(path),
        ]
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "ffprobe failed")
    return json.loads(result.stdout)


def detect(path: Path, filter_name: str) -> str:
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(path),
            "-vf" if not filter_name.startswith("silence") else "-af",
            filter_name,
            "-f",
            "null",
            "-",
        ]
    )
    return result.stderr


def durations(log: str, prefix: str) -> list[float]:
    pattern = re.compile(
        rf"{re.escape(prefix)}(?:_duration)?\s*:\s*([0-9.]+)"
    )
    return [float(match.group(1)) for match in pattern.finditer(log)]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify technical properties of a tutorial video."
    )
    parser.add_argument("video", type=Path)
    parser.add_argument("--json", type=Path, dest="json_path")
    parser.add_argument("--min-width", type=int, default=1280)
    parser.add_argument("--min-height", type=int, default=720)
    parser.add_argument("--max-black-seconds", type=float, default=0.25)
    parser.add_argument("--silence-warning-seconds", type=float, default=3.0)
    parser.add_argument("--freeze-warning-seconds", type=float, default=4.0)
    args = parser.parse_args()

    errors: list[str] = []
    warnings: list[str] = []
    if not args.video.is_file():
        errors.append(f"Video not found: {args.video}")
        report = {"status": "FAIL", "errors": errors, "warnings": warnings}
    else:
        try:
            metadata = ffprobe(args.video)
        except (RuntimeError, json.JSONDecodeError) as exc:
            metadata = {}
            errors.append(str(exc))

        streams = metadata.get("streams", [])
        video_streams = [
            stream
            for stream in streams
            if stream.get("codec_type") == "video"
        ]
        audio_streams = [
            stream
            for stream in streams
            if stream.get("codec_type") == "audio"
        ]
        if not video_streams:
            errors.append("No video stream.")
            width = height = 0
        else:
            width = int(video_streams[0].get("width") or 0)
            height = int(video_streams[0].get("height") or 0)
            if width < args.min_width or height < args.min_height:
                errors.append(
                    f"Resolution {width}x{height} is below "
                    f"{args.min_width}x{args.min_height}."
                )
        if not audio_streams:
            errors.append("No audio stream.")

        duration = float(metadata.get("format", {}).get("duration") or 0)
        if duration <= 1:
            errors.append(f"Implausible duration: {duration:.3f}s.")

        black_log = detect(
            args.video, "blackdetect=d=0.25:pix_th=0.10"
        )
        black_total = sum(durations(black_log, "black_duration"))
        if black_total > args.max_black_seconds:
            errors.append(
                f"Black video totals {black_total:.3f}s, exceeding "
                f"{args.max_black_seconds:.3f}s."
            )

        silence_log = detect(
            args.video, "silencedetect=noise=-45dB:d=1.0"
        )
        silence_segments = durations(silence_log, "silence_duration")
        longest_silence = max(silence_segments, default=0.0)
        if longest_silence > args.silence_warning_seconds:
            warnings.append(
                f"Longest silence is {longest_silence:.3f}s."
            )

        freeze_log = detect(
            args.video, "freezedetect=n=-50dB:d=1.0"
        )
        freeze_segments = durations(freeze_log, "freeze_duration")
        longest_freeze = max(freeze_segments, default=0.0)
        if longest_freeze > args.freeze_warning_seconds:
            warnings.append(
                f"Longest frozen segment is {longest_freeze:.3f}s; "
                "confirm it is an intentional instructional hold."
            )

        report = {
            "status": "FAIL" if errors else "PASS",
            "video": str(args.video.resolve()),
            "duration": round(duration, 3),
            "resolution": f"{width}x{height}",
            "video_codec": (
                video_streams[0].get("codec_name")
                if video_streams
                else None
            ),
            "audio_codec": (
                audio_streams[0].get("codec_name")
                if audio_streams
                else None
            ),
            "black_seconds": round(black_total, 3),
            "longest_silence": round(longest_silence, 3),
            "longest_freeze": round(longest_freeze, 3),
            "errors": errors,
            "warnings": warnings,
        }

    output = json.dumps(report, indent=2)
    print(output)
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(output + "\n", encoding="utf-8")
    return 1 if report["status"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())

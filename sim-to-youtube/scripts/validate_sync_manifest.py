#!/usr/bin/env python3
"""Validate narration-first cue timing in a tutorial sync manifest."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def number(cue: dict, key: str) -> float:
    value = cue.get(key)
    if not isinstance(value, (int, float)):
        raise ValueError(f"{key} must be a number")
    return float(value)


def validate(data: dict, minimum_delay: float | None) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    cues = data.get("cues")
    if not isinstance(cues, list) or not cues:
        return {
            "status": "FAIL",
            "errors": ["Manifest must contain a non-empty cues array."],
            "warnings": [],
            "cue_count": 0,
        }

    required_delay = (
        float(minimum_delay)
        if minimum_delay is not None
        else float(data.get("minimum_action_delay", 0.15))
    )
    previous_end = 0.0
    latest_end = 0.0

    for index, cue in enumerate(cues):
        cue_id = str(cue.get("id") or f"cue-{index + 1}")
        try:
            start = number(cue, "timeline_start")
            end = number(cue, "timeline_end")
        except ValueError as exc:
            errors.append(f"{cue_id}: {exc}")
            continue

        if start < -0.001:
            errors.append(f"{cue_id}: timeline_start cannot be negative.")
        if end <= start:
            errors.append(f"{cue_id}: timeline_end must be after start.")
        if start < previous_end - 0.001:
            errors.append(
                f"{cue_id}: overlaps the previous cue by "
                f"{previous_end - start:.3f}s."
            )
        elif start > previous_end + 0.25 and index > 0:
            warnings.append(
                f"{cue_id}: unexplained timeline gap of "
                f"{start - previous_end:.3f}s."
            )

        if "audio_duration" in cue:
            try:
                audio_duration = number(cue, "audio_duration")
            except ValueError as exc:
                errors.append(f"{cue_id}: {exc}")
                audio_duration = 0.0
            narration_end = start + audio_duration
            if narration_end > end + 0.001:
                errors.append(
                    f"{cue_id}: narration extends "
                    f"{narration_end - end:.3f}s past the cue."
                )

            if "output_action_time" in cue:
                try:
                    action = number(cue, "output_action_time")
                except ValueError as exc:
                    errors.append(f"{cue_id}: {exc}")
                    action = start
                delay = action - narration_end
                if delay < required_delay - 0.001:
                    errors.append(
                        f"{cue_id}: action is only {delay:.3f}s after "
                        f"narration; require at least "
                        f"{required_delay:.3f}s."
                    )
                if action > end + 0.001:
                    errors.append(
                        f"{cue_id}: action occurs after the cue ends."
                    )
        elif "output_action_time" in cue:
            warnings.append(
                f"{cue_id}: cannot validate action timing without "
                "audio_duration."
            )

        previous_end = max(previous_end, end)
        latest_end = max(latest_end, end)

    total = data.get("total_duration")
    if isinstance(total, (int, float)):
        difference = abs(float(total) - latest_end)
        if difference > 0.05:
            warnings.append(
                f"total_duration differs from final cue end by "
                f"{difference:.3f}s."
            )

    return {
        "status": "FAIL" if errors else "PASS",
        "errors": errors,
        "warnings": warnings,
        "cue_count": len(cues),
        "minimum_action_delay": required_delay,
        "latest_cue_end": round(latest_end, 3),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate a narration-first tutorial sync manifest."
    )
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--minimum-delay", type=float)
    parser.add_argument("--json", type=Path, dest="json_path")
    args = parser.parse_args()

    data = json.loads(args.manifest.read_text(encoding="utf-8"))
    report = validate(data, args.minimum_delay)
    output = json.dumps(report, indent=2)
    print(output)
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(output + "\n", encoding="utf-8")
    return 1 if report["status"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())

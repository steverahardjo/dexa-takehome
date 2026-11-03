#!/usr/bin/env python3
"""Generate randomised attendance for the employees in a seed JSON file.

Reads the employees (``employee.json``, or ``seed-data.json`` which nests them
under ``employees``) and writes ``attendance.json``::

    {
      "attendances": [
        {
          "email": "andi@company.com",
          "date": "2026-02-11",
          "clockIn": "09:12",
          "latitude": -6.2,
          "longitude": 106.816667,
          "proof": "https://picsum.photos/seed/wfh-proof/900/1200"
        }
      ]
    }

Every row carries the *same* proof link and the *same* coordinates; only the day
and the clock-in time differ. A clock-in after ``--work-start`` (default 09:00)
is a violation, and ``--late-rate`` decides how many of them there are.

Usage::

    python3 scripts/generate_attendance.py                          # 3 weeks, ~75% late
    python3 scripts/generate_attendance.py --late-rate 0.4 --days 30
    python3 scripts/generate_attendance.py --merge                  # into seed-data.json
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_EMPLOYEES = BASE_DIR / "src" / "database" / "seed-data.json"
DEFAULT_OUT = BASE_DIR / "src" / "database" / "attendance.json"

#: One photo for every check-in: same seed, same image, no download needed.
DEFAULT_PROOF = "https://picsum.photos/seed/wfh-proof/900/1200"

#: Everyone checked in from the same place, so the map has one cluster.
DEFAULT_LATITUDE = -6.2
DEFAULT_LONGITUDE = 106.816667


def load_employees(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf8"))

    if isinstance(data, list):
        employees = data
    elif isinstance(data, dict) and "employees" in data:
        employees = data["employees"]
    elif isinstance(data, dict) and "name" in data:
        employees = [data]
    else:
        raise SystemExit(f"{path}: expected a list, or an object with 'employees'")

    missing = [entry for entry in employees if not entry.get("email")]
    if missing:
        raise SystemExit(f"{path}: every employee needs an 'email'")

    return employees


def clock_to_minutes(value: str) -> int:
    hours, _, minutes = value.partition(":")
    return int(hours) * 60 + int(minutes)


def minutes_to_clock(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def build(args: argparse.Namespace) -> dict:
    employees = load_employees(Path(args.employees))
    rng = random.Random(args.seed)
    start = clock_to_minutes(args.work_start)

    today = date.today()
    rows: list[dict] = []

    for entry in employees:
        email = str(entry["email"]).strip().lower()

        for days_ago in range(args.days, -1, -1):
            day = today - timedelta(days=days_ago)

            if day.weekday() >= 5 and not args.weekends:
                continue

            if days_ago > 0 and rng.random() < args.absent_rate:
                continue

            # Late: up to `--late-window` minutes after the start. On time: the
            # hour before it, ending exactly at the start.
            if rng.random() < args.late_rate:
                clock = rng.randint(start + 1, start + args.late_window)
            else:
                clock = rng.randint(start - 60, start)

            rows.append(
                {
                    "email": email,
                    "date": day.isoformat(),
                    "clockIn": minutes_to_clock(clock),
                    "latitude": args.latitude,
                    "longitude": args.longitude,
                    "proof": args.proof,
                }
            )

    rows.sort(key=lambda row: (row["date"], row["email"]))

    late = sum(1 for row in rows if clock_to_minutes(row["clockIn"]) > start)

    return {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "rules": {
            "workStart": args.work_start,
            "days": args.days,
            "lateRate": args.late_rate,
            "absentRate": args.absent_rate,
        },
        "summary": {
            "employees": len(employees),
            "attendances": len(rows),
            "violations": late,
            "onTime": len(rows) - late,
        },
        "attendances": rows,
    }


def merge(args: argparse.Namespace, generated: dict) -> None:
    """Inline the generated rows into the file the backend seed actually reads."""
    seed_path = Path(args.employees)
    seed = json.loads(seed_path.read_text(encoding="utf8"))

    if isinstance(seed, list):
        raise SystemExit(
            f"{seed_path}: a plain employee list cannot hold attendances, "
            "point --employees at seed-data.json to merge"
        )

    backup = seed_path.with_suffix(seed_path.suffix + ".bak")
    backup.write_text(seed_path.read_text(encoding="utf8"), encoding="utf8")

    seed["attendances"] = generated["attendances"]
    seed_path.write_text(
        json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf8"
    )

    print(f"merged {len(seed['attendances'])} rows into {seed_path}")
    print(f"backup: {backup}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--employees", default=str(DEFAULT_EMPLOYEES), help="employee source JSON"
    )
    parser.add_argument(
        "--out", default=str(DEFAULT_OUT), help="attendance JSON to write"
    )
    parser.add_argument("--days", type=int, default=21, help="days back from today")
    parser.add_argument("--work-start", default="09:00", help="HH:mm late after this")
    parser.add_argument(
        "--late-rate", type=float, default=0.75, help="share of late check-ins"
    )
    parser.add_argument(
        "--late-window", type=int, default=90, help="minutes after the start"
    )
    parser.add_argument(
        "--absent-rate", type=float, default=0.1, help="share of skipped days"
    )
    parser.add_argument("--latitude", type=float, default=DEFAULT_LATITUDE)
    parser.add_argument("--longitude", type=float, default=DEFAULT_LONGITUDE)
    parser.add_argument("--proof", default=DEFAULT_PROOF, help="link used by every row")
    parser.add_argument("--seed", type=int, default=None, help="same seed, same file")
    parser.add_argument("--weekends", action="store_true", help="include Sat/Sun")
    parser.add_argument(
        "--merge", action="store_true", help="also inline the rows into the seed file"
    )
    args = parser.parse_args()

    if not 0 <= args.late_rate <= 1 or not 0 <= args.absent_rate <= 1:
        raise SystemExit("--late-rate and --absent-rate are shares, 0..1")

    generated = build(args)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(generated, indent=2, ensure_ascii=False) + "\n", encoding="utf8"
    )

    summary = generated["summary"]
    print(
        f"{out}: {summary['attendances']} check-ins for {summary['employees']} "
        f"employees ({summary['violations']} late, {summary['onTime']} on time)"
    )

    if args.merge:
        merge(args, generated)

    return 0


if __name__ == "__main__":
    sys.exit(main())

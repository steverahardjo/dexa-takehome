#!/usr/bin/env python3
"""Write one seed file with employees *and* their attendance.

The output is the file the backend seed reads (``src/database/seed-data.json``)::

    {
      "employees": [ ... unchanged ... ],
      "attendances": [
        {
          "email": "andi@company.com",
          "date": "2026-10-14",
          "clockIn": "08:41",
          "latitude": -6.2,
          "longitude": 106.816667,
          "proof": "https://picsum.photos/seed/wfh-proof/900/1200"
        }
      ]
    }

Three states come out of it, which is what the calendar paints:

* **late** (red) — a check-in after ``--work-start``;
* **on time** (green) — a check-in at or before it;
* **absent** (black) — a weekday with no row at all, so the gap is the record.

``--no-check-in-today`` (default 3) keeps that many accounts without a check-in
for *today*, so the dashboard's "Not yet" card has faces in it.

Every row carries the same coordinates and the same proof link. The file is
written to a temporary name and moved into place, so an interrupted run can never
leave half a JSON document behind (which the seeder cannot read).

Usage::

    python3 scripts/generate_attendance.py                     # 3 weeks, one file
    python3 scripts/generate_attendance.py --late-rate 0.3 --absent-rate 0.2
    python3 scripts/generate_attendance.py --days 60 --seed-number 7
"""

from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SEED = BASE_DIR / "src" / "database" / "seed-data.json"

#: One photo for every check-in: same seed, same image, no download needed.
DEFAULT_PROOF = "https://picsum.photos/seed/wfh-proof/900/1200"

#: Everyone checked in from the same place, so the map has one cluster.
DEFAULT_LATITUDE = -6.2
DEFAULT_LONGITUDE = 106.816667


def load_seed(path: Path) -> dict:
    try:
        data = json.loads(path.read_text(encoding="utf8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"{path}: not valid JSON ({error})") from error

    if isinstance(data, list):
        return {"employees": data, "attendances": []}

    if not isinstance(data, dict) or "employees" not in data:
        raise SystemExit(f"{path}: expected an object with 'employees'")

    data.setdefault("attendances", [])

    missing = [entry for entry in data["employees"] if not entry.get("email")]
    if missing:
        raise SystemExit(f"{path}: every employee needs an 'email'")

    return data


def clock_to_minutes(value: str) -> int:
    hours, _, minutes = value.partition(":")
    return int(hours) * 60 + int(minutes)


def minutes_to_clock(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def build(args: argparse.Namespace) -> tuple[list[dict], dict]:
    seed = load_seed(Path(args.seed))
    rng = random.Random(args.seed_number)
    start = clock_to_minutes(args.work_start)

    today = date.today()
    rows: list[dict] = []
    totals = {"late": 0, "on_time": 0, "absent": 0}

    # A few accounts simply have not checked in yet today.
    emails = [str(entry["email"]).strip().lower() for entry in seed["employees"]]
    still_out = set(
        rng.sample(emails, min(args.no_check_in_today, len(emails)))
    )

    for entry in seed["employees"]:
        email = str(entry["email"]).strip().lower()

        for days_ago in range(args.days, -1, -1):
            day = today - timedelta(days=days_ago)

            if day.weekday() >= 5 and not args.weekends:
                continue

            # Today is decided by `--no-check-in-today`, not by chance.
            if days_ago == 0:
                if email in still_out:
                    totals["absent"] += 1
                    continue
            elif rng.random() < args.absent_rate:
                totals["absent"] += 1
                continue

            # Late: up to `--late-window` minutes after the start. On time: the
            # hour before it, ending exactly at the start.
            if rng.random() < args.late_rate:
                clock = rng.randint(start + 1, start + args.late_window)
                totals["late"] += 1
            else:
                clock = rng.randint(start - 60, start)
                totals["on_time"] += 1

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

    print(
        f"no check-in today ({len(still_out)}): "
        + ", ".join(sorted(still_out))
    )

    return rows, totals


def write(args: argparse.Namespace, rows: list[dict], totals: dict) -> Path:
    seed_path = Path(args.seed)
    seed = load_seed(seed_path)

    seed["attendances"] = rows
    seed["meta"] = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "rules": {
            "workStart": args.work_start,
            "days": args.days,
            "lateRate": args.late_rate,
            "absentRate": args.absent_rate,
        },
        "summary": totals,
    }

    if not args.no_backup:
        shutil.copyfile(seed_path, seed_path.with_suffix(seed_path.suffix + ".bak"))

    # Write beside the target, then swap: readers never see a partial document.
    temporary = seed_path.with_suffix(seed_path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf8"
    )
    os.replace(temporary, seed_path)

    return seed_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seed",
        "--employees",
        dest="seed",
        default=str(DEFAULT_SEED),
        help="the one file to read employees from and write attendances into",
    )
    parser.add_argument("--days", type=int, default=21, help="days back from today")
    parser.add_argument(
        "--no-check-in-today",
        type=int,
        default=3,
        help="accounts left without a check-in for today",
    )
    parser.add_argument("--work-start", default="09:00", help="HH:mm late after this")
    parser.add_argument(
        "--late-rate", type=float, default=0.35, help="share of late (red) check-ins"
    )
    parser.add_argument(
        "--absent-rate",
        type=float,
        default=0.15,
        help="share of skipped weekdays (no row, black)",
    )
    parser.add_argument(
        "--late-window", type=int, default=90, help="minutes after the start"
    )
    parser.add_argument("--latitude", type=float, default=DEFAULT_LATITUDE)
    parser.add_argument("--longitude", type=float, default=DEFAULT_LONGITUDE)
    parser.add_argument("--proof", default=DEFAULT_PROOF, help="link used by every row")
    parser.add_argument(
        "--seed-number", type=int, default=None, help="same number, same file"
    )
    parser.add_argument("--weekends", action="store_true", help="include Sat/Sun")
    parser.add_argument(
        "--no-backup", action="store_true", help="overwrite without a .bak copy"
    )
    args = parser.parse_args()

    if not 0 <= args.late_rate <= 1 or not 0 <= args.absent_rate <= 1:
        raise SystemExit("--late-rate and --absent-rate are shares, 0..1")

    rows, totals = build(args)
    path = write(args, rows, totals)

    total = sum(totals.values())
    print(
        f"{path}: {len(rows)} check-ins for the last {args.days} days "
        f"({totals['late']} late / {totals['on_time']} on time, "
        f"{totals['absent']} absent days)"
    )
    print(
        "calendar: "
        f"{100 * totals['late'] / total:.0f}% red, "
        f"{100 * totals['on_time'] / total:.0f}% green, "
        f"{100 * totals['absent'] / total:.0f}% black"
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())

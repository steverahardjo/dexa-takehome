"use client";

import * as React from "react";
import { LoaderCircleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const YEAR = new Date().getFullYear();

type HistoryRow = {
  date: string;
  status: string;
};

type HistoryPage = {
  data: HistoryRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

function dayKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);

  return new Date(year, month - 1, day);
}

export type EmployeeCalendarProps = {
  employeeId: string;
  employeeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EmployeeCalendar({
  employeeId,
  employeeName,
  open,
  onOpenChange,
}: EmployeeCalendarProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{employeeName}: late days</DialogTitle>
          <DialogDescription>
            Red dates indicate late attendance in {YEAR}. Select one to
            highlight the day.
          </DialogDescription>
        </DialogHeader>

        <LateYear
          key={`${employeeId}-${open}`}
          employeeId={employeeId}
          year={YEAR}
        />
      </DialogContent>
    </Dialog>
  );
}

type LateYearProps = {
  employeeId: string;
  year: number;
};

function LateYear({ employeeId, year }: LateYearProps) {
  const [lateDays, setLateDays] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [selected, setSelected] = React.useState<Date>();
  const [month, setMonth] = React.useState(() => new Date(year, 0, 1));

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const page = await api<HistoryPage>(
          `/reports/employees/${employeeId}/history?year=${year}&limit=100`
        );

        if (cancelled) return;

        setLateDays(
          page.data
            .filter((row) => row.status === "LATE")
            .map((row) => row.date.slice(0, 10))
        );
        setError(null);
      } catch (loadError) {
        if (cancelled) return;

        setError(
          loadError instanceof Error
            ? loadError.message
            : "The late days could not be loaded."
        );
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [employeeId, year, attempt]);

  function retry() {
    setLateDays(null);
    setError(null);
    setAttempt((current) => current + 1);
  }

  const late = React.useMemo(
    () => (lateDays ?? []).map((date) => parseDay(date)),
    [lateDays]
  );

  const lateDateKeys = React.useMemo(() => new Set(lateDays ?? []), [lateDays]);

  function handleSelect(date: Date | undefined) {
    if (!date) return;

    // Only late dates can be selected.
    if (!lateDateKeys.has(dayKey(date))) return;

    // Client-side state only. No API request.
    setSelected(date);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>

        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Calendar
        mode="single"
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        onSelect={handleSelect}
        startMonth={new Date(year, 0)}
        endMonth={new Date(year, 11)}
        captionLayout="label"
        modifiers={{ late }}
        components={{
          DayButton: (props) => (
            <CalendarDayButton
              {...props}
              className={cn(
                props.className,
                props.modifiers.late &&
                  "cursor-pointer bg-rose-500 font-semibold text-white hover:bg-rose-600 focus-visible:ring-rose-500/50 data-[selected-single=true]:bg-rose-600 dark:bg-rose-600 dark:hover:bg-rose-500"
              )}
            />
          ),
        }}
        className="[--cell-radius:var(--radius-md)]"
      />

      <div className="w-full space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2.5 rounded-sm bg-rose-500" />
            Late attendance
          </span>

          <span className="text-muted-foreground">
            {lateDays === null
              ? "Loading…"
              : `${lateDays.length} late ${
                  lateDays.length === 1 ? "day" : "days"
                }`}
          </span>
        </div>

        {lateDays === null ? (
          <p className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" />
            Loading {year}…
          </p>
        ) : lateDays.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No late attendance in {year}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

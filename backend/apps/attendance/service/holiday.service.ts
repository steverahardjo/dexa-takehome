import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isWeekendDate } from '../../../shared/time/local-time.js';

export type DayType = 'WORKING_DAY' | 'WEEKEND' | 'HOLIDAY' | 'UNKNOWN';

interface HolidayResponse {
  metadata?: { year?: number; timezone?: string };
  data?: Array<{ date?: string; name?: string; is_cuti_bersama?: boolean }>;
}

const DEFAULT_API_URL =
  'https://api.kemendesa.link/libur-nasional/api/holidays/latest';
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_TIMEOUT_MS = 5000;
/** After a failed fetch, wait this long before trying again. */
const FAILURE_BACKOFF_MS = 60_000;

/**
 * Indonesian national holidays from the Kemendesa calendar.
 *
 * A day is a working day when it is neither a weekend nor a national holiday.
 * Weekends are decided locally (no network); holidays are cached because the
 * calendar changes a handful of times a year.
 */
@Injectable()
export class HolidayService {
  private readonly logger = new Logger(HolidayService.name);
  private readonly apiUrl: string;
  private readonly ttlMs: number;
  private readonly timeoutMs: number;

  private cache: { expiresAt: number; dates: Map<string, string> } | null =
    null;
  private failureUntil = 0;

  constructor(config: ConfigService) {
    this.apiUrl = config.get<string>('HOLIDAY_API_URL', DEFAULT_API_URL);
    this.ttlMs =
      Number(config.get('HOLIDAY_CACHE_TTL_SECONDS', DEFAULT_TTL_SECONDS)) *
      1000;
    this.timeoutMs = Number(
      config.get('HOLIDAY_API_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
    );
  }

  /** Classifies a `YYYY-MM-DD` date. `UNKNOWN` means "weekday, calendar unavailable". */
  async dayType(date: string): Promise<{ type: DayType; name: string | null }> {
    if (isWeekendDate(date)) {
      return { type: 'WEEKEND', name: null };
    }

    const holidays = await this.holidayDates();

    if (!holidays) {
      return { type: 'UNKNOWN', name: null };
    }

    const name = holidays.get(date);

    return name
      ? { type: 'HOLIDAY', name }
      : { type: 'WORKING_DAY', name: null };
  }

  /**
   * `date -> holiday name` for the published calendar, or null when the
   * calendar has never been fetched successfully.
   */
  async holidayDates(): Promise<Map<string, string> | null> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.dates;
    }

    if (this.failureUntil > Date.now()) {
      return this.cache?.dates ?? null;
    }

    try {
      const response = await fetch(this.apiUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as HolidayResponse;
      const dates = new Map<string, string>();

      for (const entry of body.data ?? []) {
        if (entry.date) {
          dates.set(entry.date, entry.name ?? 'National holiday');
        }
      }

      this.cache = { expiresAt: Date.now() + this.ttlMs, dates };

      return dates;
    } catch (error) {
      this.failureUntil = Date.now() + FAILURE_BACKOFF_MS;
      this.logger.warn(
        `Holiday calendar unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      // A stale calendar is better than no calendar.
      return this.cache?.dates ?? null;
    }
  }
}

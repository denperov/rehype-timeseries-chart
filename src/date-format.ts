/**
 * Detect column-0 format and supply parser metadata.
 * 1. Try explicit Y/M/D & time patterns               (fast regex table)
 * 2. Fallback-1: plain integer → Number               (isDate = false)
 * 3. Fallback-2: Date.parse() → Date                  (isDate = true)
 *
 * @module date-format
 */

import { timeParse } from 'd3-time-format';

/** Parser transforms a string into Date or number */
export type Parser = (s: string) => Date | number | null;

/** Metadata returned for a detected format */
export interface DateInfo {
  parser: Parser;
  isDate: boolean;
}

interface FormatConfig {
  test: RegExp;
  parser: Parser;
}

/* ------------------------------------------------------------------ */
/* 1. Explicit date/time regex patterns                               */
/* ------------------------------------------------------------------ */

const patterns: FormatConfig[] = [
  { test: /^\d{4}-\d{2}-\d{2}$/, parser: timeParse('%Y-%m-%d') }, // YYYY-MM-DD
  { test: /^\d{4}-\d{2}$/, parser: timeParse('%Y-%m') }, // YYYY-MM
  { test: /^\d{4}$/, parser: timeParse('%Y') }, // YYYY
  { test: /^\d{2}:\d{2}:\d{2}$/, parser: timeParse('%H:%M:%S') }, // HH:MM:SS
  { test: /^\d{2}:\d{2}$/, parser: timeParse('%H:%M') }, // HH:MM
  { test: /^\d{2}$/, parser: timeParse('%H') }, // HH
  { test: /^\d{10}$/, parser: (s) => new Date(+s * 1000) }, // unix-sec
  { test: /^\d{13}$/, parser: (s) => new Date(+s) }, // unix-ms
  { test: /^\d{16}$/, parser: (s) => new Date(+s / 1000) }, // unix-µs
];

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export function detectDateParser(sample: string): DateInfo | null {
  /* explicit patterns */
  for (const { test, parser } of patterns) {
    if (!test.test(sample)) continue;

    return {
      parser,
      isDate: true, // every explicit pattern yields a Date
    };
  }

  /* Date.parse() fallback */
  const ts = Date.parse(sample);
  if (!isNaN(ts)) {
    return {
      parser: (s) => new Date(Date.parse(s)),
      isDate: true,
    };
  }

  /* numeric fallback */
  if (/^-?\d+$/.test(sample)) {
    return {
      parser: (s) => Number(s),
      isDate: false,
    };
  }

  return null;
}

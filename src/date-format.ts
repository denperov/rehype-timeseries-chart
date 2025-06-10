/**
 * Detect column-0 format and supply parser/formatter metadata.
 * Supports ISO dates, time-only strings, Unix timestamps, and numeric values.
 * Runs in O(n × formats) — one pass per candidate format.
 *
 * @module date-format
 */

import {timeParse, timeFormat} from 'd3-time-format'

/** Parser transforms a string into Date or number */
export type Parser = (s: string) => Date | number | null
/** Formatter transforms a Date or number back to string */
export type Formatter = ((d: Date) => string) | ((n: number) => string)

/** Metadata returned for a detected format */
export interface DateInfo {
  parser: Parser
  formatter: Formatter
  type: string
  isDate: boolean
}

interface FormatConfig {
  type: string
  test: RegExp | ((s: string) => boolean)
  fmt: string | Formatter
  parser: Parser
}

const formats: FormatConfig[] = [
  {
    type: 'YYYY-MM-DD',
    test: /^\d{4}-\d{2}-\d{2}$/,
    fmt: '%Y-%m-%d',
    parser: timeParse('%Y-%m-%d')
  },
  {
    type: 'YYYY-MM',
    test: /^\d{4}-\d{2}$/,
    fmt: '%Y-%m',
    parser: timeParse('%Y-%m')
  },
  {type: 'YYYY', test: /^\d{4}$/, fmt: '%Y', parser: timeParse('%Y')},
  {
    type: 'HH:MM:SS',
    test: /^\d{2}:\d{2}:\d{2}$/,
    fmt: '%H:%M:%S',
    parser: timeParse('%H:%M:%S')
  },
  {
    type: 'HH:MM',
    test: /^\d{2}:\d{2}$/,
    fmt: '%H:%M',
    parser: timeParse('%H:%M')
  },
  {type: 'HH', test: /^\d{2}$/, fmt: '%H', parser: timeParse('%H')},
  {
    type: 'unix-seconds',
    test: /^\d{10}$/,
    fmt: (d: Date) => String(Math.floor((d as Date).getTime() / 1000)),
    parser: (s) => new Date(+s * 1000)
  },
  {
    type: 'unix-ms',
    test: /^\d{13}$/,
    fmt: (d: Date) => String((d as Date).getTime()),
    parser: (s) => new Date(+s)
  },
  {
    type: 'unix-us',
    test: /^\d{16}$/,
    fmt: (d: Date) => String((d as Date).getTime() * 1000),
    parser: (s) => new Date(+s / 1000)
  },
  {type: 'number', test: /^-?\d+$/, fmt: String, parser: (s) => Number(s)},
  {
    type: 'iso',
    test: (s) => !isNaN(Date.parse(s)),
    fmt: '%Y-%m-%dT%H:%M:%S.%LZ',
    parser: (s) => new Date(s)
  }
]

/**
 * Detects the first matching date/number format for given samples.
 * @param samples - Array of string samples to test
 * @returns DateInfo or null if no format matches
 */
export function detectDateParserFormatter(
  samples: string[] = []
): DateInfo | null {
  if (!samples.length) return null

  for (const cfg of formats) {
    const matches = samples.every((s) =>
      cfg.test instanceof RegExp ? cfg.test.test(s) : cfg.test(s)
    )
    if (!matches) continue

    const formatter: Formatter =
      typeof cfg.fmt === 'string' ? timeFormat(cfg.fmt) : cfg.fmt

    return {
      parser: cfg.parser,
      formatter,
      type: cfg.type,
      isDate: cfg.type !== 'number'
    }
  }

  return null
}

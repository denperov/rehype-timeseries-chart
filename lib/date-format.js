// @ts-check
import {timeParse, timeFormat} from 'd3-time-format'

// ---------------------------------------------------------------------------
// Detect column-0 format and supply:
//   { parser, formatter, type, isDate }           // or null if no match
//
// * The formatter **mirrors the original pattern** (no contextual trimming).
// * Unix-timestamp and integer columns round-trip numerically.
// * Runs in O(n × formats) — one pass per candidate.
// ---------------------------------------------------------------------------

/**
 * @typedef {(s: string) => Date|number|null} Parser
 * @typedef {(d: any) => string} Formatter
 */

/** @type {{ type: string; test: RegExp|((s: string) => boolean); fmt: string|Formatter; parser: Parser; }[]} */
const formats = [
  /* ISO-like calendar strings -------------------------------------------- */
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
  {
    type: 'YYYY',
    test: /^\d{4}$/,
    fmt: '%Y',
    parser: timeParse('%Y')
  },

  /* Clock-only strings ---------------------------------------------------- */
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
  {
    type: 'HH',
    test: /^\d{2}$/,
    fmt: '%H',
    parser: timeParse('%H')
  },

  /* Unix time stamps ------------------------------------------------------ */
  {
    type: 'unix-seconds',
    test: /^\d{10}$/,
    fmt: (d) => String(Math.floor(d.getTime() / 1000)),
    parser: (s) => new Date(+s * 1000)
  },
  {
    type: 'unix-ms',
    test: /^\d{13}$/,
    fmt: (d) => String(d.getTime()),
    parser: (s) => new Date(+s)
  },
  {
    type: 'unix-us',
    test: /^\d{16}$/,
    fmt: (d) => String(d.getTime() * 1000),
    parser: (s) => new Date(+s / 1000)
  },

  /* Pure integers --------------------------------------------------------- */
  {
    type: 'number',
    test: /^-?\d+$/,
    fmt: String,
    parser: (s) => Number(s)
  },

  /* Fallback: anything Date.parse accepts --------------------------------- */
  {
    type: 'iso',
    test: (s) => !isNaN(Date.parse(s)),
    fmt: '%Y-%m-%dT%H:%M:%S.%LZ',
    parser: (s) => new Date(s)
  }
]

/**
 * Detects the first matching date/number format and returns parser/formatter.
 *
 * @param {string[]} samples
 * @returns {{ parser: Parser; formatter: Formatter; type: string; isDate: boolean }|null}
 */
export function detectDateParserFormatter(samples = []) {
  if (!samples.length) return null

  for (const cfg of formats) {
    const matches = samples.every((s) =>
      cfg.test instanceof RegExp ? cfg.test.test(s) : cfg.test(s)
    )
    if (!matches) continue

    const formatter =
      typeof cfg.fmt === 'string' ? timeFormat(cfg.fmt) : cfg.fmt

    return {
      parser: cfg.parser,
      formatter,
      type: cfg.type,
      isDate: cfg.type !== 'number'
    }
  }

  return null // nothing matched
}

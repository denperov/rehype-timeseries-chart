// -------------------------------------------------------------------
// Turns Markdown fences marked with `language-<codeLanguage>` (default: csv)
// into a responsive multi-line SVG chart. By default, preserves the
// original <pre><code> block alongside the chart; this can be disabled.
//
// Options:
//   * width, height   – dimensions of the SVG (default 640×300)
//   * title           – optional chart title
//   * textColor       – CSS color for all text (default black)
//   * backgroundColor – CSS color for SVG background (default none)
//   * containerClass  – CSS class on the wrapping <div> (default "timeseries-chart")
//   * codeLanguage    – the language to detect on <code> (default "csv")
//   * saveOriginal    – boolean: keep the <pre><code> inside the container (default true)
// -------------------------------------------------------------------

import {visit} from 'unist-util-visit'
import {scaleTime, scaleLinear} from 'd3-scale'
import {line as d3Line, curveMonotoneX} from 'd3-shape'
import {extent, max} from 'd3-array'
import {schemeCategory10} from 'd3-scale-chromatic'
import {detectDateParserFormatter} from './date-format.js'

/* ------------------------------------------------------------------ */
/* Tiny HAST helpers for SVG elements                                 */
/* ------------------------------------------------------------------ */
const el = (tag, props = {}, children = []) => ({
  type: 'element',
  tagName: tag,
  namespace: 'http://www.w3.org/2000/svg',
  properties: props,
  children
})

const rect = (x, y, w, h, props = {}) =>
  el('rect', {x, y, width: w, height: h, ...props})

const line = (x1, y1, x2, y2, props = {}) =>
  // default stroke ensures axes, ticks, grid are visible
  el('line', {x1, y1, x2, y2, stroke: '#000', ...props})

const txt = (x, y, value, props = {}) =>
  el(
    'text',
    {x, y, fill: '#000', 'font-size': 10, 'text-anchor': 'middle', ...props},
    [{type: 'text', value: String(value)}]
  )

const svg = (w, h, children) =>
  el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${w} ${h}`,
      preserveAspectRatio: 'none',
      width: '100%',
      height: '100%'
    },
    children
  )

/* ------------------------------------------------------------------ */
/* Build the <svg> node given parsed series and formatting info        */
/* ------------------------------------------------------------------ */
function buildSvg(series, xInfo, opt = {}) {
  const W = opt.width ?? 640
  const H = opt.height ?? 300
  const M = {top: 40, right: 20, bottom: 30, left: 50}
  const w = W - M.left - M.right
  const h = H - M.top - M.bottom
  const textCol = opt.textColor ?? '#000'

  // Collect X and Y data
  const xs = series.flatMap((s) => s.values.map((v) => v.x))
  const ys = series.flatMap((s) => s.values.map((v) => v.y))

  // Scales
  const xScale = xInfo.isDate
    ? scaleTime()
        .domain(extent(xs))
        .range([M.left, M.left + w])
    : scaleLinear()
        .domain(extent(xs))
        .range([M.left, M.left + w])

  const yScale = scaleLinear()
    .domain([0, max(ys)])
    .nice()
    .range([M.top + h, M.top])

  // Default D3 tick formatter for Date, or custom for numbers
  const tickFmt = xInfo.isDate ? xScale.tickFormat() : xInfo.formatter
  const gen = d3Line()
    .x((d) => xScale(d.x))
    .y((d) => yScale(d.y))
    .curve(curveMonotoneX)

  const children = []

  // Optional background rectangle
  if (opt.backgroundColor) {
    children.push(rect(0, 0, W, H, {fill: opt.backgroundColor}))
  }

  // Optional title
  if (opt.title) {
    children.push(txt(W / 2, 20, opt.title, {'font-size': 16, fill: textCol}))
  }

  // Legend (only if more than one series)
  if (series.length > 1) {
    const legendY = M.top - 20
    const itemSpacing = 100
    series.forEach((s, i) => {
      const color = schemeCategory10[i % schemeCategory10.length]
      const x0 = M.left + i * itemSpacing
      children.push(
        rect(x0, legendY - 8, 12, 12, {fill: color}),
        txt(x0 + 16, legendY + 2, s.name, {
          'text-anchor': 'start',
          fill: textCol
        })
      )
    })
  }

  // Axes
  children.push(
    line(M.left, M.top + h, M.left + w, M.top + h), // X-axis
    line(M.left, M.top, M.left, M.top + h) // Y-axis
  )

  // X ticks and labels
  xScale.ticks(Math.max(1, Math.floor(w / 80))).forEach((t) => {
    const x = xScale(t)
    children.push(
      line(x, M.top + h, x, M.top + h + 6),
      txt(x, M.top + h + 20, tickFmt(t), {fill: textCol})
    )
  })

  // Y ticks, labels, grid lines
  yScale.ticks(5).forEach((t) => {
    const y = yScale(t)
    children.push(
      line(M.left - 6, y, M.left, y),
      txt(M.left - 10, y + 3, t, {'text-anchor': 'end', fill: textCol}),
      line(M.left, y, M.left + w, y, {
        stroke: '#ccc',
        'stroke-dasharray': '2,2'
      })
    )
  })

  // Data paths
  series.forEach((s, i) => {
    children.push(
      el('path', {
        d: gen(s.values) || '',
        fill: 'none',
        stroke: schemeCategory10[i % schemeCategory10.length],
        'stroke-width': 1.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      })
    )
  })

  return svg(W, H, children)
}

/* ------------------------------------------------------------------ */
/* Convert parsed rows into series arrays                              */
/* ------------------------------------------------------------------ */
const toSeries = (rows, names) =>
  names.map((n) => ({
    name: n,
    values: rows.map((r) => ({x: r.x, y: r[n]}))
  }))

/* ------------------------------------------------------------------ */
/* Rehype plugin entry point                                           */
/* ------------------------------------------------------------------ */
export default function index(options = {}) {
  const {
    width,
    height,
    title,
    textColor,
    backgroundColor,
    containerClass = 'timeseries-chart-container',
    codeLanguage = 'csv',
    saveOriginal = true
  } = options

  const langClass = `language-${codeLanguage}`

  return (tree) => {
    visit(tree, 'element', (pre, idx, parent) => {
      // 1. Ensure <pre> and <code> exist
      if (pre.tagName !== 'pre' || !parent) return
      const code = pre.children?.[0]
      if (!code || code.tagName !== 'code') return

      // 2. Detect based on codeLanguage (e.g. "csv")
      const classes = code.properties?.className
      if (!Array.isArray(classes) || !classes.includes(langClass)) return

      // 3. Extract raw CSV text
      const raw = (code.children || [])
        .map((ch) => (ch.type === 'text' ? ch.value : ''))
        .join('\n')
        .trim()

      const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines.length < 2) return // Need at least header + one data row

      // 4. Split header and data rows
      const header = lines[0].split(',').map((s) => s.trim())
      if (header.length < 2) return // Need at least one Y column

      const rowsRaw = lines
        .slice(1)
        .map((l) => l.split(',').map((s) => s.trim()))
        .filter((r) => r.length === header.length)
      if (!rowsRaw.length) return

      // 5. Detect first-column format (dates or numbers)
      const detector = detectDateParserFormatter(rowsRaw.map((r) => r[0]))
      if (!detector) return

      // 6. Parse all rows into objects { x: Date|number, [colName]: number, … }
      const parsed = []
      for (const cells of rowsRaw) {
        const xVal = detector.parser(cells[0])
        if (detector.isDate && (!(xVal instanceof Date) || isNaN(xVal))) return
        const obj = {x: xVal}
        for (let i = 1; i < header.length; i++) {
          const yNum = Number(cells[i])
          if (Number.isNaN(yNum)) return
          obj[header[i]] = yNum
        }
        parsed.push(obj)
      }

      // 7. Build the SVG chart node
      const series = toSeries(parsed, header.slice(1))
      const svgNode = buildSvg(series, detector, {
        width,
        height,
        title,
        textColor,
        backgroundColor
      })

      // 8. Depending on saveOriginal, either wrap both SVG & <pre>,
      //    or replace <pre> with just the SVG.
      if (saveOriginal) {
        const container = {
          type: 'element',
          tagName: 'div',
          properties: {className: [containerClass]},
          children: [svgNode, pre] // keep original <pre>
        }
        parent.children.splice(idx, 1, container)
      } else {
        parent.children.splice(idx, 1, svgNode)
      }
    })
  }
}

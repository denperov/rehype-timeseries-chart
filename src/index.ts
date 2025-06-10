/**
 * Rehype plugin to transform fenced CSV code blocks into SVG charts.
 *
 * By default, this plugin preserves the original <pre><code> block alongside the generated chart.
 *
 * @module rehypeTimeseriesChart
 */

import {visit} from 'unist-util-visit'
import {scaleTime, scaleLinear, NumberValue} from 'd3-scale'
import {line as d3Line, curveMonotoneX} from 'd3-shape'
import {extent, max} from 'd3-array'
import {schemeCategory10} from 'd3-scale-chromatic'
import {detectDateParserFormatter, DateInfo} from './date-format.ts'
import {
  Node as HastNode,
  Parent as HastParent,
  Element as HastElement
} from 'hast'

/** Represents a text node in HAST */
interface TextNode {
  type: 'text'
  value: string
}

/**
 * Generic SVG element factory
 * @param tag - Tag name of the SVG element
 * @param props - Element attributes/properties
 * @param children - Child nodes (elements or text)
 * @returns HAST element representing the SVG node
 */
const el = (
  tag: string,
  props: Record<string, any> = {},
  children: Array<HastElement | TextNode> = []
): HastElement => ({
  type: 'element',
  tagName: tag,
  properties: props,
  children: children
})

/**
 * Create an SVG <rect> element
 * @param x - X-coordinate of the rectangle
 * @param y - Y-coordinate of the rectangle
 * @param w - Width of the rectangle
 * @param h - Height of the rectangle
 * @param props - Additional SVG attributes
 */
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  props: Record<string, any> = {}
): HastElement => el('rect', {x, y, width: w, height: h, ...props})

/**
 * Create an SVG <line> element
 * @param x1 - Starting X coordinate
 * @param y1 - Starting Y coordinate
 * @param x2 - Ending X coordinate
 * @param y2 - Ending Y coordinate
 * @param props - Additional SVG attributes
 */
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  props: Record<string, any> = {}
): HastElement => el('line', {x1, y1, x2, y2, stroke: '#000', ...props})

/**
 * Create an SVG <text> element
 * @param x - X-coordinate of the text anchor
 * @param y - Y-coordinate of the text baseline
 * @param value - Content of the text node
 * @param props - Additional SVG attributes
 */
const txt = (
  x: number,
  y: number,
  value: string | number,
  props: Record<string, any> = {}
): HastElement =>
  el(
    'text',
    {x, y, fill: '#000', 'font-size': 10, 'text-anchor': 'middle', ...props},
    [{type: 'text', value: String(value)}]
  )

/**
 * Create root <svg> container with responsive viewBox
 * @param w - ViewBox width
 * @param h - ViewBox height
 * @param children - Child SVG elements
 */
const svg = (w: number, h: number, children: HastElement[]): HastElement =>
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

/** Data point in a series */
interface SeriesPoint {
  x: Date | number
  y: number
}

/** Named series of data points */
interface Series {
  name: string
  values: SeriesPoint[]
}

/** Options for buildSvg layout & styling */
interface BuildOptions {
  width?: number
  height?: number
  title?: string
  textColor?: string
  backgroundColor?: string
}

/**
 * Build an SVG chart from data series
 * @param series - Array of series with name & points
 * @param xInfo - Metadata for X axis (date vs number)
 * @param opt - Layout/styling options
 * @returns HAST element for the <svg>
 */
function buildSvg(
  series: Series[],
  xInfo: DateInfo,
  opt: BuildOptions = {}
): HastElement {
  const W = opt.width ?? 640
  const H = opt.height ?? 300
  const M = {top: 40, right: 20, bottom: 30, left: 50}
  const w = W - M.left - M.right
  const h = H - M.top - M.bottom
  const textCol = opt.textColor ?? '#000'

  const xs = series.flatMap((s) => s.values.map((v) => v.x))
  const ys = series.flatMap((s) => s.values.map((v) => v.y))

  const xScale = xInfo.isDate
    ? scaleTime()
        .domain(extent(xs) as [Date, Date])
        .range([M.left, M.left + w])
    : scaleLinear()
        .domain(extent(xs) as [number, number])
        .range([M.left, M.left + w])
  const yScale = scaleLinear()
    .domain([0, max(ys) ?? 0])
    .nice()
    .range([M.top + h, M.top])

  const tickFmt = xScale.tickFormat() as (d: Date | NumberValue) => string

  const gen = d3Line<SeriesPoint>()
    .x((d) => xScale(d.x as any))
    .y((d) => yScale(d.y))
    .curve(curveMonotoneX)

  const children: HastElement[] = []

  if (opt.backgroundColor)
    children.push(rect(0, 0, W, H, {fill: opt.backgroundColor}))
  if (opt.title)
    children.push(txt(W / 2, 20, opt.title, {'font-size': 16, fill: textCol}))
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

  children.push(
    line(M.left, M.top + h, M.left + w, M.top + h),
    line(M.left, M.top, M.left, M.top + h)
  )

  xScale.ticks(Math.max(1, Math.floor(w / 80))).forEach((t) => {
    const x = xScale(t as any)
    children.push(
      line(x, M.top + h, x, M.top + h + 6),
      txt(x, M.top + h + 20, tickFmt(t), {fill: textCol})
    )
  })

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

/**
 * Convert raw row objects into named series
 * @param rows - Array of records with x and y values
 * @param names - Property keys to plot as series
 */
function toSeries(
  rows: Array<Record<string, any> & {x: Date | number}>,
  names: string[]
): Series[] {
  return names.map((name) => ({
    name,
    values: rows.map((r) => ({x: r.x, y: r[name]}))
  }))
}

/**
 * Options to customize the plugin behavior and styling.
 *
 * @property width - SVG width in pixels (default: 640)
 * @property height - SVG height in pixels (default: 300)
 * @property title - Optional chart title text
 * @property textColor - CSS color for text elements (default: black)
 * @property backgroundColor - CSS background fill (default: none)
 * @property containerClass - CSS class for the wrapper <div> (default: 'timeseries-chart-container')
 * @property codeLanguage - Language class to match on <code> (default: 'csv')
 * @property saveOriginal - Whether to keep original code block alongside the chart (default: false)
 */
/**
 * Configuration options for the rehypeTimeseriesChart plugin.
 */
export interface ChartOptions {
  /**
   * SVG width in pixels.
   * @default 640
   */
  width?: number
  /**
   * SVG height in pixels.
   * @default 300
   */
  height?: number
  /**
   * Text to display as the chart title.
   * @default undefined
   */
  title?: string
  /**
   * CSS color for all text elements in the chart.
   * @default '#000'
   */
  textColor?: string
  /**
   * CSS background color for the SVG container.
   * @default none
   */
  backgroundColor?: string
  /**
   * CSS class name applied to the wrapping <div>.
   * @default 'timeseries-chart-container'
   */
  containerClass?: string
  /**
   * Language class to match on <code> elements (e.g., 'csv').
   * @default 'csv'
   */
  codeLanguage?: string
  /**
   * Whether to preserve the original code block alongside the chart.
   * @default true
   */
  saveOriginal?: boolean
}

/**
 * Rehype plugin entry point: scans the AST for CSV code blocks and
 * replaces or wraps them with generated SVG charts.
 *
 * @param options - Options to customize rendering behavior
 * @returns Transformer function for the AST
 */
export default function rehypeTimeseriesChart(options: ChartOptions = {}) {
  const {
    containerClass = 'timeseries-chart-container',
    codeLanguage = 'csv',
    saveOriginal = false
  } = options

  const langClass = `language-${codeLanguage}`

  return (tree: HastNode) => {
    visit(
      tree,
      'element',
      (node: HastElement, idx: number, parent: HastParent) => {
        // Only process <pre><code> elements
        if (node.tagName !== 'pre' || !parent) return
        const code = node.children?.[0] as HastElement | undefined
        if (!code || code.tagName !== 'code') return

        // Match based on language class
        const classes = code.properties?.className as string[] | undefined
        if (!classes?.includes(langClass)) return

        // Extract CSV text
        const raw = code.children
          .filter((c): c is TextNode => c.type === 'text')
          .map((c) => c.value)
          .join('\n')
          .trim()

        const lines = raw
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
        if (lines.length < 2) return

        // Parse header and data rows
        const header = lines[0].split(',').map((s) => s.trim())
        if (header.length < 2) return

        const rowsRaw = lines
          .slice(1)
          .map((line) => line.split(',').map((s) => s.trim()))
        if (!rowsRaw.length) return

        // Detect date or numeric parser
        const detector = detectDateParserFormatter(rowsRaw.map((r) => r[0]))
        if (!detector) return

        // Build data objects
        const parsed: Array<Record<string, any> & {x: Date | number}> = []
        for (const cells of rowsRaw) {
          const xVal = detector.parser(cells[0])
          if (
            detector.isDate &&
            (!(xVal instanceof Date) || isNaN(xVal.getTime()))
          )
            return
          const obj: any = {x: xVal}
          for (let i = 1; i < header.length; i++) {
            const yNum = Number(cells[i])
            if (isNaN(yNum)) return
            obj[header[i]] = yNum
          }
          parsed.push(obj)
        }

        // Generate SVG
        const series = toSeries(parsed, header.slice(1))
        const svgNode = buildSvg(series, detector, options)

        // Replace or wrap original node
        if (saveOriginal) {
          const container: HastElement = {
            type: 'element',
            tagName: 'div',
            properties: {className: [containerClass]},
            children: [svgNode, node]
          }
          parent.children.splice(idx, 1, container)
        } else {
          parent.children.splice(idx, 1, svgNode)
        }
      }
    )
  }
}

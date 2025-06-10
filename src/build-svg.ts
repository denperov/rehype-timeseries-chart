import { scaleTime, scaleLinear, NumberValue } from 'd3-scale';
import { line as d3Line, curveMonotoneX } from 'd3-shape';
import { extent, max } from 'd3-array';
import { schemeCategory10 } from 'd3-scale-chromatic';
import { Element as HastElement } from 'hast';

/** Data point in a series */
interface SeriesPoint {
  x: Date | number;
  y: number;
}

/** Named series of data points */
interface Series {
  name: string;
  values: SeriesPoint[];
}

/** Represents a text node in HAST */
interface TextNode {
  type: 'text';
  value: string;
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
  children: children,
});

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
): HastElement => el('rect', { x, y, width: w, height: h, ...props });

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
): HastElement => el('line', { x1, y1, x2, y2, stroke: '#000', ...props });

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
  el('text', { x, y, fill: '#000', 'font-size': 10, 'text-anchor': 'middle', ...props }, [
    { type: 'text', value: String(value) },
  ]);

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
      height: '100%',
    },
    children
  );

/** Options controlling overall chart build */
export interface BuildOptions {
  /** chart width in px */
  width?: number;
  /** chart height in px */
  height?: number;
  /** optional title string */
  title?: string;
  /** text color for labels */
  textColor?: string;
  /** background color of SVG */
  backgroundColor?: string;
}

/**
 * Build an SVG chart from data series
 * @param series - Array of series with name & points
 * @param isDate -
 * @param opt - Layout/styling options
 * @returns HAST element for the <svg>
 */
export function buildSvg(series: Series[], isDate: boolean, opt: BuildOptions = {}): HastElement {
  const W = opt.width ?? 640;
  const H = opt.height ?? 300;
  const M = { top: 40, right: 20, bottom: 30, left: 50 };
  const w = W - M.left - M.right;
  const h = H - M.top - M.bottom;
  const textCol = opt.textColor ?? '#000';

  const xs = series.flatMap((s) => s.values.map((v) => v.x));
  const ys = series.flatMap((s) => s.values.map((v) => v.y));

  const xScale = isDate
    ? scaleTime()
        .domain(extent(xs) as [Date, Date])
        .range([M.left, M.left + w])
    : scaleLinear()
        .domain(extent(xs) as [number, number])
        .range([M.left, M.left + w]);
  const yScale = scaleLinear()
    .domain([0, max(ys) ?? 0])
    .nice()
    .range([M.top + h, M.top]);

  const tickFmt = xScale.tickFormat() as (d: Date | NumberValue) => string;

  const gen = d3Line<SeriesPoint>()
    .x((d) => xScale(d.x as any))
    .y((d) => yScale(d.y))
    .curve(curveMonotoneX);

  const children: HastElement[] = [];

  if (opt.backgroundColor) children.push(rect(0, 0, W, H, { fill: opt.backgroundColor }));
  if (opt.title) children.push(txt(W / 2, 20, opt.title, { 'font-size': 16, fill: textCol }));
  if (series.length > 1) {
    const legendY = M.top - 20;
    const itemSpacing = 100;
    series.forEach((s, i) => {
      const color = schemeCategory10[i % schemeCategory10.length];
      const x0 = M.left + i * itemSpacing;
      children.push(
        rect(x0, legendY - 8, 12, 12, { fill: color }),
        txt(x0 + 16, legendY + 2, s.name, {
          'text-anchor': 'start',
          fill: textCol,
        })
      );
    });
  }

  // Axes
  children.push(
    line(M.left, M.top + h, M.left + w, M.top + h), // X-axis
    line(M.left, M.top, M.left, M.top + h) // Y-axis
  );

  // X ticks and labels
  xScale.ticks(Math.max(1, Math.floor(w / 80))).forEach((t) => {
    const x = xScale(t as any);
    children.push(
      line(x, M.top + h, x, M.top + h + 6),
      txt(x, M.top + h + 20, tickFmt(t), { fill: textCol })
    );
  });

  // Y ticks, labels, grid lines
  yScale.ticks(5).forEach((t) => {
    const y = yScale(t);
    children.push(
      line(M.left - 6, y, M.left, y),
      txt(M.left - 10, y + 3, t, { 'text-anchor': 'end', fill: textCol }),
      line(M.left, y, M.left + w, y, {
        stroke: '#ccc',
        'stroke-dasharray': '2,2',
      })
    );
  });

  // Data paths
  series.forEach((s, i) => {
    children.push(
      el('path', {
        d: gen(s.values) || '',
        fill: 'none',
        stroke: schemeCategory10[i % schemeCategory10.length],
        'stroke-width': 1.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      })
    );
  });

  return svg(W, H, children);
}

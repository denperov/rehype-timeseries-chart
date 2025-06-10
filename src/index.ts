/**
 * Rehype plugin to transform fenced CSV code blocks into SVG charts.
 *
 * By default, this plugin preserves the original <pre><code> block alongside the generated chart.
 *
 * @module rehypeTimeseriesChart
 */

import { visit } from 'unist-util-visit';
import { detectDateParserFormatter, DateInfo } from './date-format.ts';
import { buildSvg } from './build-svg.js';
import { Node as HastNode, Parent as HastParent, Element as HastElement } from 'hast';

/** Represents a text node in HAST */
interface TextNode {
  type: 'text';
  value: string;
}

/**
 * Convert raw row objects into named series
 * @param rows - Array of records with x and y values
 * @param names - Property keys to plot as series
 */
function toSeries(rows: Array<Record<string, any> & { x: Date | number }>, names: string[]) {
  return names.map((name) => ({
    name,
    values: rows.map((r) => ({ x: r.x, y: r[name] })),
  }));
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
  width?: number;
  /**
   * SVG height in pixels.
   * @default 300
   */
  height?: number;
  /**
   * Text to display as the chart title.
   * @default undefined
   */
  title?: string;
  /**
   * CSS color for all text elements in the chart.
   * @default '#000'
   */
  textColor?: string;
  /**
   * CSS background color for the SVG container.
   * @default none
   */
  backgroundColor?: string;
  /**
   * CSS class name applied to the wrapping <div>.
   * @default 'timeseries-chart-container'
   */
  containerClass?: string;
  /**
   * Language class to match on <code> elements (e.g., 'csv').
   * @default 'csv'
   */
  codeLanguage?: string;
  /**
   * Whether to preserve the original code block alongside the chart.
   * @default true
   */
  saveOriginal?: boolean;
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
    saveOriginal = false,
  } = options;

  const langClass = `language-${codeLanguage}`;

  return (tree: HastNode) => {
    visit(tree, 'element', (node: HastElement, idx: number, parent: HastParent) => {
      // Only process <pre><code> elements
      if (node.tagName !== 'pre' || !parent) return;
      const code = node.children?.[0] as HastElement | undefined;
      if (!code || code.tagName !== 'code') return;

      // Match based on language class
      const classes = code.properties?.className as string[] | undefined;
      if (!classes?.includes(langClass)) return;

      // Extract CSV text
      const raw = code.children
        .filter((c): c is TextNode => c.type === 'text')
        .map((c) => c.value)
        .join('\n')
        .trim();

      const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) return;

      // Parse header and data rows
      const header = lines[0].split(',').map((s) => s.trim());
      if (header.length < 2) return;

      const rowsRaw = lines.slice(1).map((line) => line.split(',').map((s) => s.trim()));
      if (!rowsRaw.length) return;

      // Detect date or numeric parser
      const detector = detectDateParserFormatter(rowsRaw.map((r) => r[0]));
      if (!detector) return;

      // Build data objects
      const parsed: Array<Record<string, any> & { x: Date | number }> = [];
      for (const cells of rowsRaw) {
        const xVal = detector.parser(cells[0]);
        if (detector.isDate && (!(xVal instanceof Date) || isNaN(xVal.getTime()))) return;
        const obj: any = { x: xVal };
        for (let i = 1; i < header.length; i++) {
          const yNum = Number(cells[i]);
          if (isNaN(yNum)) return;
          obj[header[i]] = yNum;
        }
        parsed.push(obj);
      }

      // Generate SVG
      const series = toSeries(parsed, header.slice(1));
      const svgNode = buildSvg(series, detector.isDate, options);

      // Replace or wrap the original node
      if (saveOriginal) {
        const container: HastElement = {
          type: 'element',
          tagName: 'div',
          properties: { className: [containerClass] },
          children: [svgNode, node],
        };
        parent.children.splice(idx, 1, container);
      } else {
        parent.children.splice(idx, 1, svgNode);
      }
    });
  };
}

/* ------------------------------------------------------------------ */
/* Validation helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * A row is “complete” when it has the same number of cells as the header
 * AND ended with a line-feed in the raw text.
 */
function isCompleteRow(rowText: string, headerLen: number): boolean {
  return rowText.endsWith('\n') && rowText.split(',').length === headerLen;
}

/**
 * Validate a completed row against the chosen detector.
 * The first cell must parse, remaining cells must be finite numbers.
 */
function rowMatchesFormat(cells: string[], detector: DateInfo): boolean {
  const xVal = detector.parser(cells[0]);
  if (detector.isDate) {
    if (!(xVal instanceof Date) || isNaN(+xVal)) return false;
  } else if (typeof xVal !== 'number' || !isFinite(xVal)) {
    return false;
  }
  return cells.slice(1).every((c) => Number.isFinite(Number(c)));
}

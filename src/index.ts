/**
 * Rehype plugin to transform fenced CSV code blocks into SVG charts.
 *
 * By default, this plugin preserves the original <pre><code> block alongside the generated chart.
 *
 * @module rehypeTimeseriesChart
 */

import { visit } from 'unist-util-visit';
import { DateInfo, detectDateParser } from './date-format.ts';
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

/* ------------------------------------------------------------------ */
/* Validation helpers                                                 */
/* ------------------------------------------------------------------ */

/**
 * A row is “complete” when it has exactly the same number of cells
 * as the header row. The check is **syntax-only**; semantic validation
 * is delegated to {@link rowMatchesFormat}.
 */
function isCompleteRow(cells: string[], headerLen: number): boolean {
  return cells.length === headerLen;
}

/**
 * Validate a completed row against the chosen detector.
 * The first cell must parse, remaining cells must be finite numbers.
 */
function rowMatchesFormat(cells: string[], detector: DateInfo): boolean {
  const xVal = detector.parser(cells[0]);
  if (detector.isDate) {
    if (!(xVal instanceof Date) || isNaN(xVal.getTime())) return false;
  } else if (typeof xVal !== 'number' || !isFinite(xVal)) {
    return false;
  }
  return cells.slice(1).every((c) => Number.isFinite(Number(c)));
}

/* ------------------------------------------------------------------ */
/* Plugin options                                                     */
/* ------------------------------------------------------------------ */

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
export interface ChartOptions {
  width?: number;
  height?: number;
  title?: string;
  textColor?: string;
  backgroundColor?: string;
  containerClass?: string;
  codeLanguage?: string;
  saveOriginal?: boolean;
}

/**
 * Rehype plugin entry point: scans the AST for CSV code blocks and
 * replaces or wraps them with generated SVG charts.
 *
 * Stream-friendly strategy:
 * 1. Perform **lightweight syntactic checks** first – header & ≥2 data rows.
 * 2. Ignore the *last* row if it is incomplete (still streaming).
 * 3. Abort the whole transform as soon as a completed row violates the
 *    selected Date/Number format → prevents flicker.
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
      /* -------------------------------------------------------------- */
      /* 1. Identify <pre><code class="language-csv"> … </code></pre>    */
      /* -------------------------------------------------------------- */
      if (node.tagName !== 'pre' || !parent) return;
      const code = node.children?.[0] as HastElement | undefined;
      if (!code || code.tagName !== 'code') return;

      const classes = code.properties?.className as string[] | undefined;
      if (!classes?.includes(langClass)) return;

      /* -------------------------------------------------------------- */
      /* 2. Extract raw text                                            */
      /* -------------------------------------------------------------- */
      const raw = code.children
        .filter((c): c is TextNode => c.type === 'text')
        .map((c) => c.value)
        .join('\n');

      console.debug(`rehypeTimeseriesChart: Processing CSV block:\n${raw}`);

      const allLines = raw.split('\n');
      if (allLines.length < 3) return; /* rows >= 3 */

      /* ---------------------------------------------------------------- */
      /* 3. Basic structural checks                                       */
      /* ---------------------------------------------------------------- */
      const headerCells = allLines[0]
        .trim()
        .split(',')
        .map((c) => c.trim());
      const headerLen = headerCells.length;
      if (headerLen < 2) return; /* columns >= 2 */

      const secondRowCells = allLines[1]
        .trim()
        .split(',')
        .map((c) => c.trim());
      if (secondRowCells.length !== headerLen) return; /* header vs second row */

      /* ---------------------------------------------------------------- */
      /* 4. Detect x-axis parser (based on second row)                    */
      /* ---------------------------------------------------------------- */
      const detector = detectDateParser(secondRowCells[0]);
      if (!detector) return;

      /* ---------------------------------------------------------------- */
      /* 5. Collect completed & valid rows                                */
      /* ---------------------------------------------------------------- */
      const completed: string[][] = [];

      for (let i = 1; i < allLines.length; i++) {
        const cells = allLines[i]
          .trim()
          .split(',')
          .map((c) => c.trim());

        if (!isCompleteRow(cells, headerLen)) {
          /* Ignore the final streaming row if it is incomplete */
          console.debug(`rehypeTimeseriesChart: Incomplete row at line ${i}:`, cells);
          break;
        }

        if (!rowMatchesFormat(cells, detector)) {
          /* First completed row that fails → abort transform to avoid flicker */
          console.debug(`rehypeTimeseriesChart: Invalid row at line ${i}:`, cells);
          return;
        }

        completed.push(cells);
      }

      if (completed.length < 2) return; /* need ≥2 valid data rows */

      /* ---------------------------------------------------------------- */
      /* 6. Convert to JS objects                                         */
      /* ---------------------------------------------------------------- */
      const parsed: Array<Record<string, any> & { x: Date | number }> = completed.map((cells) => {
        const x = detector.parser(cells[0]) as Date | number;
        const obj: Record<string, any> & { x: Date | number } = { x };
        for (let c = 1; c < headerLen; c++) obj[headerCells[c]] = Number(cells[c]);
        return obj;
      });

      /* ---------------------------------------------------------------- */
      /* 7. Generate SVG                                                  */
      /* ---------------------------------------------------------------- */
      const series = toSeries(parsed, headerCells.slice(1));
      const svgNode = buildSvg(series, detector.isDate, options);

      /* ---------------------------------------------------------------- */
      /* 8. Replace or wrap original node                                 */
      /* ---------------------------------------------------------------- */
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

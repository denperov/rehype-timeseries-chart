import {test} from 'node:test'
import assert from 'node:assert/strict'
import {unified} from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeStringify from 'rehype-stringify'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeTimeseriesChart from 'rehype-timeseries-chart'

/* ------------------------------------------------------------------ */
/* Rehype-only pipeline: HTML → SVG chart                          */
/* ------------------------------------------------------------------ */

test('rehype: converts an HTML <code class="language-csv"> block into an <svg>', async () => {
  const html = `<pre><code class="language-csv">date,value
2024-01-01,10
2024-01-02,20
</code></pre>`

  const out = await unified()
    // Parse raw HTML into a HAST tree
    .use(rehypeParse, {fragment: true})
    // 🔌 our plugin
    .use(rehypeTimeseriesChart)
    // Serialize back to HTML
    .use(rehypeStringify)
    .process(html)

  const result = String(out)

  // The plugin should have replaced the <code> block with an inline SVG chart
  assert.match(result, /<svg[^>]*>/, 'output should contain an <svg>')
  assert.doesNotMatch(
    result,
    /<code[^>]*language-csv/,
    'CSV code block should be gone'
  )
})

/* ------------------------------------------------------------------ */
/* Remark + Rehype pipeline: Markdown → HTML with SVG              */
/* ------------------------------------------------------------------ */

test('remark → rehype: converts a fenced ```csv block in Markdown into an <svg>', async () => {
  const md = '```csv\ndate,value\n2024-01-01,10\n2024-01-02,20\n```'

  const out = await unified()
    // Parse Markdown to MDAST
    .use(remarkParse)
    // MDAST → HAST
    .use(remarkRehype, {allowDangerousHtml: true})
    // 🔌 our plugin
    .use(rehypeTimeseriesChart)
    // HAST → HTML
    .use(rehypeStringify)
    .process(md)

  const result = String(out)

  assert.match(result, /<svg[^>]*>/, 'output should contain an <svg>')
  assert.doesNotMatch(
    result,
    /<code[^>]*language-csv/,
    'CSV code block should be gone'
  )
})

/* ------------------------------------------------------------------ */
/* Preserve original CSV block with saveOriginal:true                */
/* ------------------------------------------------------------------ */

test('rehype: wraps output in a container div with both <svg> and <pre> when saveOriginal is true', async () => {
  const html = `<pre><code class="language-csv">date,value
2024-01-01,10
2024-01-02,20
</code></pre>`

  const out = await unified()
    .use(rehypeParse, {fragment: true})
    .use(rehypeTimeseriesChart, {saveOriginal: true})
    .use(rehypeStringify)
    .process(html)

  const result = String(out)

  assert.match(result, /<div class="timeseries-chart-container">/, 'container div should be present')

  const start = result.indexOf('<div class="timeseries-chart-container">')
  const end = result.indexOf('</div>', start)
  const containerContent = result.slice(start, end)

  assert.match(containerContent, /<svg[^>]*>/, 'container should include <svg>')
  assert.match(containerContent, /<pre>/, 'container should include <pre>')
})

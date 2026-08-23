import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, Packer, Paragraph, HeadingLevel } from 'docx'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { parseDocument, isSupportedDoc } from '../src/doc-sources.js'

const root = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const docsRoot = join(root, 'docs')
const CJK_FONT = process.env.KB_CJK_FONT ?? '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'

async function makePdfWithCjk(text: string, outPath: string) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await readFile(CJK_FONT))
  const page = pdf.addPage()
  page.drawText(text, { x: 50, y: 700, size: 12, font })
  await writeFile(outPath, await pdf.save())
}

async function setupFixtures() {
  await mkdir(docsRoot, { recursive: true })

  await writeFile(join(docsRoot, 'sample.md'), '# 标题\n\nMarkdown 正文内容。\n')

  const docx = new Document({
    sections: [{ children: [
      new Paragraph({ text: 'Word 标题', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: 'Word 文档正文，包含关键词：弹性工作制。' }),
    ] }],
  })
  await writeFile(join(docsRoot, 'sample.docx'), await Packer.toBuffer(docx))

  await makePdfWithCjk('PDF 文档正文，包含关键词：办公用品。', join(docsRoot, 'sample.pdf'))
}

describe('doc-sources', () => {
  it('recognizes supported extensions', () => {
    assert.equal(isSupportedDoc('a.md'), true)
    assert.equal(isSupportedDoc('a.pdf'), true)
    assert.equal(isSupportedDoc('a.docx'), true)
    assert.equal(isSupportedDoc('a.xlsx'), false)
  })

  it('parses markdown, docx, and pdf', async () => {
    await setupFixtures()
    const md = await parseDocument(join(docsRoot, 'sample.md'), 'sample.md')
    assert.match(md, /Markdown 正文/)

    const docx = await parseDocument(join(docsRoot, 'sample.docx'), 'sample.docx')
    assert.match(docx, /弹性工作制/)

    const pdf = await parseDocument(join(docsRoot, 'sample.pdf'), 'sample.pdf')
    assert.match(pdf, /办公用品/)
  })
})

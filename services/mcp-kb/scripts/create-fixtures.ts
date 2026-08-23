/**
 * 生成 PDF/Word 试点文档（npm run fixtures）
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), '../docs')
const CJK_FONT = process.env.KB_CJK_FONT ?? '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'

await mkdir(docsRoot, { recursive: true })

// ── Word (.docx) ──────────────────────────────────────────────────────────
const docx = new Document({
  sections: [{
    children: [
      new Paragraph({ text: '考勤须知', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun('弹性工作制：核心工作时间 10:00–16:00 必须在岗。')] }),
      new Paragraph({ text: '外勤打卡', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun('外出拜访客户需在钉钉「外勤打卡」定位签到，未打卡按缺勤处理。')] }),
      new Paragraph({ text: '加班申请', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new TextRun('加班须提前在 OA 提交申请，未经审批的加班不计调休。')] }),
    ],
  }],
})
await writeFile(join(docsRoot, '考勤须知.docx'), await Packer.toBuffer(docx))
console.log('✓ docs/考勤须知.docx')

// ── PDF（CJK 字体） ─────────────────────────────────────────────────────────
const pdfDoc = await PDFDocument.create()
pdfDoc.registerFontkit(fontkit)
const fontBytes = await readFile(CJK_FONT)
const font = await pdfDoc.embedFont(fontBytes)
const page = pdfDoc.addPage([612, 792])
const lines = [
  '办公用品申领制度',
  '',
  '1. 在 OA 系统提交申领单，注明物品名称与数量',
  '2. 行政部审核（1 个工作日）',
  '3. 到前台领取，每月限额 200 元/人',
  '4. 超额部分需部门主管审批',
]
let y = 750
for (const line of lines) {
  page.drawText(line, { x: 50, y, size: 12, font })
  y -= 20
}
await writeFile(join(docsRoot, '办公用品申领.pdf'), await pdfDoc.save())
console.log('✓ docs/办公用品申领.pdf')

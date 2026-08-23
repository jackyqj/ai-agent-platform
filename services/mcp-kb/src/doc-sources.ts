/**
 * doc-sources.ts — 文档读取与解析（Markdown / PDF / Word）
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

export const SUPPORTED_EXT = new Set(['.md', '.txt', '.markdown', '.pdf', '.docx'])

export function isSupportedDoc(filename: string): boolean {
  return SUPPORTED_EXT.has(extname(filename).toLowerCase())
}

/** 解析单文件为纯文本（Markdown 类文档保留 # 标题以便切块） */
export async function parseDocument(filePath: string, filename: string): Promise<string> {
  const ext = extname(filename).toLowerCase()
  const buf = await readFile(filePath)

  switch (ext) {
    case '.md':
    case '.txt':
    case '.markdown':
      return buf.toString('utf8')
    case '.pdf': {
      const parser = new PDFParse({ data: new Uint8Array(buf) })
      try {
        const result = await parser.getText()
        return normalizePlainText(result.text)
      } finally {
        await parser.destroy()
      }
    }
    case '.docx': {
      const result = await mammoth.extractRawText({ buffer: buf })
      return normalizePlainText(result.value)
    }
    default:
      throw new Error(`unsupported format: ${ext}`)
  }
}

/** PDF/Word 输出归一化：段落换行、压缩空行 */
function normalizePlainText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 扫描目录，解析全部支持格式的文档 */
export async function listAndParseDocs(docsRoot: string): Promise<{ path: string; text: string }[]> {
  const out: { path: string; text: string }[] = []
  let names: string[]
  try {
    names = await readdir(docsRoot)
  } catch {
    return out
  }

  for (const name of names) {
    if (!isSupportedDoc(name)) continue
    const full = join(docsRoot, name)
    try {
      const text = await parseDocument(full, name)
      if (text.length >= 20) out.push({ path: name, text })
    } catch (e) {
      console.error(`[doc-sources] skip ${name}: ${(e as Error).message}`)
    }
  }
  return out
}

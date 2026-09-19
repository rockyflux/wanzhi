import { hostOf } from './tree'
import type { Category, Site } from '../types'

function esc(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sitesIn(sites: Site[], categoryId: number) {
  return sites
    .filter((s) => s.categoryId === categoryId && s.status === 'PUBLISHED')
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

function folderDl(nodes: Category[], sites: Site[], indent: string): string {
  const lines: string[] = []
  for (const node of nodes) {
    lines.push(`${indent}<DT><H3>${esc(node.name)}</H3>`)
    lines.push(`${indent}<DL><p>`)
    for (const site of sitesIn(sites, node.id)) {
      lines.push(`${indent}    <DT><A HREF="${esc(site.url)}">${esc(site.title)}</A>`)
    }
    if (node.children?.length) lines.push(folderDl(node.children, sites, `${indent}    `))
    lines.push(`${indent}</DL><p>`)
  }
  return lines.join('\n')
}

export function toNetscape(title: string, tree: Category[], sites: Site[]) {
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>${esc(title)}</TITLE>
<H1>${esc(title)}</H1>
<DL><p>
${folderDl(tree, sites, '    ')}
</DL><p>
`
}

function folderMd(nodes: Category[], sites: Site[], depth: number): string {
  const lines: string[] = []
  for (const node of nodes) {
    lines.push(`${'#'.repeat(Math.min(depth + 1, 6))} ${node.name}`, '')
    for (const site of sitesIn(sites, node.id)) {
      lines.push(`- [${site.title}](${site.url})`)
    }
    if (sitesIn(sites, node.id).length) lines.push('')
    if (node.children?.length) lines.push(folderMd(node.children, sites, depth + 1))
  }
  return lines.join('\n')
}

export function toMarkdown(title: string, tree: Category[], sites: Site[]) {
  return `# ${title}\n\n${folderMd(tree, sites, 1)}`
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function hostLabel(url: string) {
  return hostOf(url)
}

export function faviconSrc(url: string) {
  return `https://www.laolibab.cn/public/api/favicon_api.php?url=${encodeURIComponent(hostOf(url))}&output=image`
}

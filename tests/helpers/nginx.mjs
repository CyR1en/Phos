// Parse direct child blocks recursively; quoted regexes/headers may contain braces.
export function nginxBlocks(text, offset = 0, depth = 0) {
  const result = []
  let start = 0, quote = '', escaped = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (escaped) { escaped = false; continue }
    if (char === '\\') { escaped = true; continue }
    if (quote) { if (char === quote) quote = ''; continue }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === ';' || char === '}') { start = i + 1; continue }
    if (char !== '{') continue
    const header = text.slice(start, i).trim()
    let balance = 1, end = i + 1, innerQuote = '', innerEscape = false
    for (; end < text.length && balance; end++) {
      const token = text[end]
      if (innerEscape) { innerEscape = false; continue }
      if (token === '\\') { innerEscape = true; continue }
      if (innerQuote) { if (token === innerQuote) innerQuote = ''; continue }
      if (token === '"' || token === "'") innerQuote = token
      else if (token === '{') balance++
      else if (token === '}') balance--
    }
    const body = text.slice(i + 1, end - 1)
    result.push({ header, body, depth, index: offset + start, end: offset + end }, ...nginxBlocks(body, offset + i + 1, depth + 1))
    i = end - 1; start = end
  }
  return result
}

export function nginxDirectives(text) {
  for (const block of nginxBlocks(text).filter(block => block.depth === 0).reverse()) {
    text = text.slice(0, block.index) + text.slice(block.end)
  }
  return text
}

export function nginxHeaderMap(text) {
  return new Map([...nginxDirectives(text).matchAll(/\badd_header\s+([\w-]+)\s+((?:"[^"]*"|'[^']*'|[^;"'])+)\s*;/g)]
    .map(([, name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')]))
}

// Accept explicit snippet copies, matching docker/*.conf globs, or the whole directory.
export function dockerCopiesFile(dockerfile, file) {
  const copies = [...dockerfile.matchAll(/^\s*COPY\s+(?:--[^\s]+\s+)*(.+)$/gm)].map(([, args]) => args.trim().split(/\s+/))
  return copies.some(parts => {
    const destination = parts.at(-1).replace(/\/$/, '')
    const sources = parts.slice(0, -1)
    const covered = sources.some(source => {
      const pattern = source.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.')
      return new RegExp('^' + pattern + '$').test('docker/' + file)
    })
    return covered && (destination === '/app/docker/' + file || destination === '/app/docker') ||
      sources.some(source => /^\.?\/?docker\/?$/.test(source)) && destination === '/app/docker'
  })
}

// A deliberately small smoke heuristic, not a browser accessibility-tree model.
function textAlternative(element) {
  if (element.getAttribute?.('aria-hidden') === 'true') return ''
  if (element.localName === 'img') return element.getAttribute('alt') || ''
  if (element.childNodes?.length) return element.childNodes.map(node => node.localName ? textAlternative(node) : node.textContent || '').join(' ')
  return element.textContent || ''
}
function explicitName(element, root) {
  const ids = element.getAttribute('aria-labelledby')?.trim().split(/\s+/)
  if (ids?.length) {
    const name = ids.map(id => root.querySelector('#' + id)).filter(Boolean).map(textAlternative).join(' ').trim()
    if (name) return name
  }
  return element.getAttribute('aria-label')?.trim() || ''
}
export function accessibleName(element, root) {
  return explicitName(element, root) || textAlternative(element).trim()
}
export function formControlName(element, root) {
  const explicit = explicitName(element, root)
  if (explicit) return explicit
  return element.id ? root.querySelectorAll('label').filter(label => label.getAttribute('for') === element.id).map(textAlternative).join(' ').trim() : ''
}

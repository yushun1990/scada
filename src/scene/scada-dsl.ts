import type {
  ComponentActionDefinition,
  ComponentDefinition,
  ComponentEventDefinition,
  ComponentPropertyDefinition,
  ComponentScalarValue,
} from '../component-system/definition'

export type ScadaDslSpan = {
  start: number
  end: number
}

export type ScadaDslReferenceExpression = {
  kind: 'reference'
  path: readonly string[]
  span: ScadaDslSpan
}

export type ScadaDslLiteralExpression = {
  kind: 'literal'
  value: ComponentScalarValue
  span: ScadaDslSpan
}

export type ScadaDslUnaryExpression = {
  kind: 'unary'
  operator: 'not' | '-'
  operand: ScadaDslExpression
  span: ScadaDslSpan
}

export type ScadaDslBinaryOperator =
  | 'or'
  | 'and'
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'

export type ScadaDslBinaryExpression = {
  kind: 'binary'
  operator: ScadaDslBinaryOperator
  left: ScadaDslExpression
  right: ScadaDslExpression
  span: ScadaDslSpan
}

export type ScadaDslConditionalExpression = {
  kind: 'conditional'
  condition: ScadaDslExpression
  consequent: ScadaDslExpression
  alternate: ScadaDslExpression
  span: ScadaDslSpan
}

export type ScadaDslExpression =
  | ScadaDslReferenceExpression
  | ScadaDslLiteralExpression
  | ScadaDslUnaryExpression
  | ScadaDslBinaryExpression
  | ScadaDslConditionalExpression

export type ScadaDslCallExpression = {
  kind: 'call'
  callee: ScadaDslReferenceExpression
  arguments: readonly ScadaDslExpression[]
  span: ScadaDslSpan
}

export type ScadaDslAssignmentStatement = {
  kind: 'assignment'
  target: ScadaDslReferenceExpression
  value: ScadaDslExpression
  span: ScadaDslSpan
}

export type ScadaDslCallStatement = {
  kind: 'call-statement'
  call: ScadaDslCallExpression
  span: ScadaDslSpan
}

export type ScadaDslIfStatement = {
  kind: 'if'
  condition: ScadaDslExpression
  consequent: readonly ScadaDslStatement[]
  alternate: readonly ScadaDslStatement[] | null
  span: ScadaDslSpan
}

export type ScadaDslOnStatement = {
  kind: 'on'
  event: ScadaDslReferenceExpression
  body: readonly ScadaDslStatement[]
  span: ScadaDslSpan
}

export type ScadaDslStatement =
  | ScadaDslAssignmentStatement
  | ScadaDslCallStatement
  | ScadaDslIfStatement
  | ScadaDslOnStatement

export type ScadaDslProgram = {
  kind: 'program'
  statements: readonly ScadaDslStatement[]
  span: ScadaDslSpan
}

export type ScadaDslDiagnostic = {
  message: string
  span: ScadaDslSpan
}

export type ScadaDslParseResult = {
  program: ScadaDslProgram | null
  diagnostics: readonly ScadaDslDiagnostic[]
}

type TokenKind =
  | 'identifier'
  | 'number'
  | 'string'
  | 'keyword'
  | 'operator'
  | 'punctuation'
  | 'newline'
  | 'eof'

type Token = {
  kind: TokenKind
  value: string
  start: number
  end: number
}

const KEYWORDS = new Set([
  'if',
  'else',
  'then',
  'on',
  'true',
  'false',
  'null',
  'and',
  'or',
  'not',
])

function isIdentifierStart(char: string) {
  return /[A-Za-z_\u4E00-\u9FFF]/u.test(char)
}

function isIdentifierPart(char: string) {
  return /[A-Za-z0-9_\u4E00-\u9FFF]/u.test(char)
}

function tokenizeScadaDsl(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]!

    if (char === ' ' || char === '\t' || char === '\r') {
      index += 1
      continue
    }

    if (char === '\n') {
      tokens.push({ kind: 'newline', value: '\n', start: index, end: index + 1 })
      index += 1
      continue
    }

    if (char === '#' || (char === '/' && source[index + 1] === '/')) {
      index += char === '#' ? 1 : 2
      while (index < source.length && source[index] !== '\n') {
        index += 1
      }
      continue
    }

    if (char === '"' || char === "'") {
      const quote = char
      const start = index
      index += 1
      let value = ''
      let closed = false

      while (index < source.length) {
        const current = source[index]!
        if (current === quote) {
          index += 1
          closed = true
          break
        }
        if (current === '\\') {
          const next = source[index + 1]
          if (next === undefined) break
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next
          index += 2
          continue
        }
        value += current
        index += 1
      }

      if (!closed) {
        tokens.push({ kind: 'string', value, start, end: index })
        tokens.push({ kind: 'eof', value: '', start: index, end: index })
        return tokens
      }

      tokens.push({ kind: 'string', value, start, end: index })
      continue
    }

    if (/\d/u.test(char) || (char === '.' && /\d/u.test(source[index + 1] ?? ''))) {
      const start = index
      let seenDot = false
      while (index < source.length) {
        const current = source[index]!
        if (current === '.') {
          if (seenDot) break
          seenDot = true
          index += 1
          continue
        }
        if (!/\d/u.test(current)) break
        index += 1
      }
      tokens.push({
        kind: 'number',
        value: source.slice(start, index),
        start,
        end: index,
      })
      continue
    }

    if (isIdentifierStart(char)) {
      const start = index
      index += 1
      while (index < source.length && isIdentifierPart(source[index]!)) {
        index += 1
      }
      const value = source.slice(start, index)
      tokens.push({
        kind: KEYWORDS.has(value) ? 'keyword' : 'identifier',
        value,
        start,
        end: index,
      })
      continue
    }

    const pair = source.slice(index, index + 2)
    if (pair === '==' || pair === '!=' || pair === '>=' || pair === '<=') {
      tokens.push({ kind: 'operator', value: pair, start: index, end: index + 2 })
      index += 2
      continue
    }

    if ('=><+-*/%'.includes(char)) {
      tokens.push({ kind: 'operator', value: char, start: index, end: index + 1 })
      index += 1
      continue
    }

    if ('.(){};,'.includes(char)) {
      tokens.push({ kind: 'punctuation', value: char, start: index, end: index + 1 })
      index += 1
      continue
    }

    tokens.push({ kind: 'punctuation', value: char, start: index, end: index + 1 })
    index += 1
  }

  tokens.push({ kind: 'eof', value: '', start: source.length, end: source.length })
  return tokens
}

class ParseFailure extends Error {
  readonly diagnostic: ScadaDslDiagnostic

  constructor(message: string, token: Token) {
    super(message)
    this.diagnostic = {
      message,
      span: { start: token.start, end: Math.max(token.end, token.start + 1) },
    }
  }
}

class ScadaDslParser {
  private readonly tokens: readonly Token[]
  private index = 0

  constructor(source: string) {
    this.tokens = tokenizeScadaDsl(source)
  }

  parseProgram(): ScadaDslProgram {
    const statements: ScadaDslStatement[] = []
    this.skipSeparators()
    while (!this.is('eof')) {
      statements.push(this.parseStatement())
      this.skipSeparators()
    }
    return {
      kind: 'program',
      statements,
      span: { start: 0, end: this.current().end },
    }
  }

  private parseStatement(): ScadaDslStatement {
    if (this.isKeyword('if')) return this.parseIfStatement()
    if (this.isKeyword('on')) return this.parseOnStatement()

    const target = this.parseReference()
    if (this.matchOperator('=')) {
      const value = this.parseExpression()
      return {
        kind: 'assignment',
        target,
        value,
        span: { start: target.span.start, end: value.span.end },
      }
    }

    if (this.isPunctuation('(')) {
      const call = this.parseCallAfterCallee(target)
      return { kind: 'call-statement', call, span: call.span }
    }

    throw new ParseFailure(
      '语句必须是 Property 赋值、Action 调用、if/else 或 on Event',
      this.current(),
    )
  }

  private parseIfStatement(): ScadaDslIfStatement {
    const ifToken = this.expectKeyword('if')
    const condition = this.parseExpression()
    this.expectPunctuation('{')
    const consequent = this.parseBlock()

    let alternate: readonly ScadaDslStatement[] | null = null
    let end = this.previous().end
    this.skipSeparators()

    if (this.matchKeyword('else')) {
      if (this.isKeyword('if')) {
        const nested = this.parseIfStatement()
        alternate = [nested]
        end = nested.span.end
      } else {
        this.expectPunctuation('{')
        alternate = this.parseBlock()
        end = this.previous().end
      }
    }

    return {
      kind: 'if',
      condition,
      consequent,
      alternate,
      span: { start: ifToken.start, end },
    }
  }

  private parseOnStatement(): ScadaDslOnStatement {
    const onToken = this.expectKeyword('on')
    const event = this.parseReference()
    this.expectPunctuation('{')
    const body = this.parseBlock()
    return {
      kind: 'on',
      event,
      body,
      span: { start: onToken.start, end: this.previous().end },
    }
  }

  private parseBlock() {
    const statements: ScadaDslStatement[] = []
    this.skipSeparators()
    while (!this.isPunctuation('}')) {
      if (this.is('eof')) {
        throw new ParseFailure('块缺少 }', this.current())
      }
      statements.push(this.parseStatement())
      this.skipSeparators()
    }
    this.expectPunctuation('}')
    return statements
  }

  private parseExpression(): ScadaDslExpression {
    return this.isKeyword('if')
      ? this.parseConditionalExpression()
      : this.parseOrExpression()
  }

  private parseConditionalExpression(): ScadaDslConditionalExpression {
    const start = this.expectKeyword('if').start
    const condition = this.parseOrExpression()
    this.expectKeyword('then')
    const consequent = this.parseExpression()
    this.expectKeyword('else')
    const alternate = this.parseExpression()
    return {
      kind: 'conditional',
      condition,
      consequent,
      alternate,
      span: { start, end: alternate.span.end },
    }
  }

  private parseOrExpression(): ScadaDslExpression {
    let expression = this.parseAndExpression()
    while (this.matchKeyword('or')) {
      expression = this.binary('or', expression, this.parseAndExpression())
    }
    return expression
  }

  private parseAndExpression(): ScadaDslExpression {
    let expression = this.parseEqualityExpression()
    while (this.matchKeyword('and')) {
      expression = this.binary('and', expression, this.parseEqualityExpression())
    }
    return expression
  }

  private parseEqualityExpression(): ScadaDslExpression {
    let expression = this.parseComparisonExpression()
    while (this.isOperator('==') || this.isOperator('!=')) {
      const operator = this.advance().value as '==' | '!='
      expression = this.binary(operator, expression, this.parseComparisonExpression())
    }
    return expression
  }

  private parseComparisonExpression(): ScadaDslExpression {
    let expression = this.parseAdditiveExpression()
    while (
      this.isOperator('>') ||
      this.isOperator('>=') ||
      this.isOperator('<') ||
      this.isOperator('<=')
    ) {
      const operator = this.advance().value as '>' | '>=' | '<' | '<='
      expression = this.binary(operator, expression, this.parseAdditiveExpression())
    }
    return expression
  }

  private parseAdditiveExpression(): ScadaDslExpression {
    let expression = this.parseMultiplicativeExpression()
    while (this.isOperator('+') || this.isOperator('-')) {
      const operator = this.advance().value as '+' | '-'
      expression = this.binary(operator, expression, this.parseMultiplicativeExpression())
    }
    return expression
  }

  private parseMultiplicativeExpression(): ScadaDslExpression {
    let expression = this.parseUnaryExpression()
    while (
      this.isOperator('*') ||
      this.isOperator('/') ||
      this.isOperator('%')
    ) {
      const operator = this.advance().value as '*' | '/' | '%'
      expression = this.binary(operator, expression, this.parseUnaryExpression())
    }
    return expression
  }

  private parseUnaryExpression(): ScadaDslExpression {
    if (this.matchKeyword('not')) {
      const start = this.previous().start
      const operand = this.parseUnaryExpression()
      return {
        kind: 'unary',
        operator: 'not',
        operand,
        span: { start, end: operand.span.end },
      }
    }
    if (this.matchOperator('-')) {
      const start = this.previous().start
      const operand = this.parseUnaryExpression()
      return {
        kind: 'unary',
        operator: '-',
        operand,
        span: { start, end: operand.span.end },
      }
    }
    return this.parsePrimaryExpression()
  }

  private parsePrimaryExpression(): ScadaDslExpression {
    const token = this.current()
    if (token.kind === 'number') {
      this.advance()
      return {
        kind: 'literal',
        value: Number(token.value),
        span: { start: token.start, end: token.end },
      }
    }
    if (token.kind === 'string') {
      this.advance()
      return {
        kind: 'literal',
        value: token.value,
        span: { start: token.start, end: token.end },
      }
    }
    if (this.matchKeyword('true')) return this.literalFromPrevious(true)
    if (this.matchKeyword('false')) return this.literalFromPrevious(false)
    if (this.matchKeyword('null')) return this.literalFromPrevious(null)
    if (this.matchPunctuation('(')) {
      const expression = this.parseExpression()
      this.expectPunctuation(')')
      return expression
    }
    if (token.kind === 'identifier') return this.parseReference()
    throw new ParseFailure('这里需要 Property、字面量或表达式', token)
  }

  private parseReference(): ScadaDslReferenceExpression {
    const first = this.expect('identifier', '这里需要 Property、Action 或 Event 引用')
    const path = [first.value]
    let end = first.end
    while (this.matchPunctuation('.')) {
      const member = this.expect('identifier', '点号后需要能力名称')
      path.push(member.value)
      end = member.end
    }
    if (path.length < 2) {
      throw new ParseFailure(
        '引用至少需要“对象.能力”两段，例如 device.pressure',
        first,
      )
    }
    return { kind: 'reference', path, span: { start: first.start, end } }
  }

  private parseCallAfterCallee(
    callee: ScadaDslReferenceExpression,
  ): ScadaDslCallExpression {
    this.expectPunctuation('(')
    const args: ScadaDslExpression[] = []
    if (!this.isPunctuation(')')) {
      do {
        args.push(this.parseExpression())
      } while (this.matchPunctuation(','))
    }
    const close = this.expectPunctuation(')')
    return {
      kind: 'call',
      callee,
      arguments: args,
      span: { start: callee.span.start, end: close.end },
    }
  }

  private binary(
    operator: ScadaDslBinaryOperator,
    left: ScadaDslExpression,
    right: ScadaDslExpression,
  ): ScadaDslBinaryExpression {
    return {
      kind: 'binary',
      operator,
      left,
      right,
      span: { start: left.span.start, end: right.span.end },
    }
  }

  private literalFromPrevious(
    value: ComponentScalarValue,
  ): ScadaDslLiteralExpression {
    const token = this.previous()
    return {
      kind: 'literal',
      value,
      span: { start: token.start, end: token.end },
    }
  }

  private skipSeparators() {
    while (this.is('newline') || this.isPunctuation(';')) this.advance()
  }

  private current() {
    return this.tokens[this.index]!
  }

  private previous() {
    return this.tokens[Math.max(0, this.index - 1)]!
  }

  private advance() {
    const token = this.current()
    if (token.kind !== 'eof') this.index += 1
    return token
  }

  private is(kind: TokenKind) {
    return this.current().kind === kind
  }

  private isKeyword(value: string) {
    const token = this.current()
    return token.kind === 'keyword' && token.value === value
  }

  private isOperator(value: string) {
    const token = this.current()
    return token.kind === 'operator' && token.value === value
  }

  private isPunctuation(value: string) {
    const token = this.current()
    return token.kind === 'punctuation' && token.value === value
  }

  private matchKeyword(value: string) {
    if (!this.isKeyword(value)) return false
    this.advance()
    return true
  }

  private matchOperator(value: string) {
    if (!this.isOperator(value)) return false
    this.advance()
    return true
  }

  private matchPunctuation(value: string) {
    if (!this.isPunctuation(value)) return false
    this.advance()
    return true
  }

  private expect(kind: TokenKind, message: string) {
    const token = this.current()
    if (token.kind !== kind) throw new ParseFailure(message, token)
    return this.advance()
  }

  private expectKeyword(value: string) {
    const token = this.current()
    if (!this.isKeyword(value)) {
      throw new ParseFailure(`这里需要 ${value}`, token)
    }
    return this.advance()
  }

  private expectPunctuation(value: string) {
    const token = this.current()
    if (!this.isPunctuation(value)) {
      throw new ParseFailure(`这里需要 ${value}`, token)
    }
    return this.advance()
  }
}

export function parseScadaDsl(source: string): ScadaDslParseResult {
  try {
    return {
      program: new ScadaDslParser(source).parseProgram(),
      diagnostics: [],
    }
  } catch (error) {
    if (error instanceof ParseFailure) {
      return { program: null, diagnostics: [error.diagnostic] }
    }
    throw error
  }
}

export type ScadaDslCapabilityKind = 'property' | 'action' | 'event'

export type ScadaDslCapabilityItem = {
  sourceId: string
  sourceTitle: string
  symbol: string
  member: string
  title: string
  capabilityKind: ScadaDslCapabilityKind
  property?: ComponentPropertyDefinition
  action?: ComponentActionDefinition
  event?: ComponentEventDefinition
}

export type ScadaDslSourceDefinition = {
  sourceId: string
  title: string
  symbol: string
  properties: Readonly<Record<string, ComponentPropertyDefinition>>
  actions: Readonly<Record<string, ComponentActionDefinition>>
  events?: Readonly<Record<string, ComponentEventDefinition>>
}

export type ScadaDslCapabilityCatalog = {
  items: readonly ScadaDslCapabilityItem[]
}

function appendCapabilities(
  items: ScadaDslCapabilityItem[],
  source: ScadaDslSourceDefinition,
) {
  for (const [member, property] of Object.entries(source.properties)) {
    items.push({
      sourceId: source.sourceId,
      sourceTitle: source.title,
      symbol: source.symbol,
      member,
      title: property.title,
      capabilityKind: 'property',
      property,
    })
  }
  for (const [member, action] of Object.entries(source.actions)) {
    items.push({
      sourceId: source.sourceId,
      sourceTitle: source.title,
      symbol: source.symbol,
      member,
      title: action.title,
      capabilityKind: 'action',
      action,
    })
  }
  for (const [member, event] of Object.entries(source.events ?? {})) {
    items.push({
      sourceId: source.sourceId,
      sourceTitle: source.title,
      symbol: source.symbol,
      member,
      title: event.title,
      capabilityKind: 'event',
      event,
    })
  }
}

export function createScadaDslCapabilityCatalog(
  component: ComponentDefinition,
  sources: readonly ScadaDslSourceDefinition[],
): ScadaDslCapabilityCatalog {
  const items: ScadaDslCapabilityItem[] = []
  appendCapabilities(items, {
    sourceId: 'component',
    title: component.title,
    symbol: 'component',
    properties: component.properties,
    actions: component.actions,
    events: component.events,
  })
  for (const source of sources) appendCapabilities(items, source)
  return { items }
}

export function getScadaDslInsertText(item: ScadaDslCapabilityItem) {
  const suffix = item.capabilityKind === 'action' ? '()' : ''
  return `${item.symbol}.${item.member}${suffix}`
}

export type ScadaDslCompletionResult = {
  replacement: ScadaDslSpan
  items: readonly ScadaDslCapabilityItem[]
}

export function getScadaDslCompletionItems(
  source: string,
  cursor: number,
  catalog: ScadaDslCapabilityCatalog,
): ScadaDslCompletionResult {
  const safeCursor = Math.max(0, Math.min(cursor, source.length))
  const before = source.slice(0, safeCursor)
  const match = before.match(
    /([A-Za-z_\u4E00-\u9FFF][A-Za-z0-9_\u4E00-\u9FFF]*)\.([A-Za-z0-9_\u4E00-\u9FFF]*)$/u,
  )

  if (match) {
    const symbol = match[1]!
    const memberPrefix = match[2]!
    return {
      replacement: {
        start: safeCursor - memberPrefix.length,
        end: safeCursor,
      },
      items: catalog.items.filter(
        (item) => item.symbol === symbol && item.member.startsWith(memberPrefix),
      ),
    }
  }

  const rootMatch = before.match(
    /([A-Za-z_\u4E00-\u9FFF][A-Za-z0-9_\u4E00-\u9FFF]*)$/u,
  )
  const rootPrefix = rootMatch?.[1] ?? ''
  const symbols = new Set<string>()
  const rootItems: ScadaDslCapabilityItem[] = []

  for (const item of catalog.items) {
    if (!item.symbol.startsWith(rootPrefix) || symbols.has(item.symbol)) continue
    symbols.add(item.symbol)
    rootItems.push(item)
  }

  return {
    replacement: {
      start: safeCursor - rootPrefix.length,
      end: safeCursor,
    },
    items: rootItems,
  }
}

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

export type ScadaDslRoot = '$self' | '$device'

export type ScadaDslReferenceExpression = {
  kind: 'reference'
  path: readonly [ScadaDslRoot, string]
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

export type ScadaDslExpression =
  | ScadaDslReferenceExpression
  | ScadaDslLiteralExpression
  | ScadaDslUnaryExpression
  | ScadaDslBinaryExpression

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

export type ScadaDslCasePattern =
  | { kind: 'literal'; value: ComponentScalarValue; span: ScadaDslSpan }
  | { kind: 'wildcard'; span: ScadaDslSpan }

export type ScadaDslCaseArm = {
  pattern: ScadaDslCasePattern
  body: readonly ScadaDslStatement[]
  span: ScadaDslSpan
}

export type ScadaDslCaseStatement = {
  kind: 'case'
  expression: ScadaDslExpression
  arms: readonly ScadaDslCaseArm[]
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
  | ScadaDslCaseStatement
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
  'case',
  'on',
  'true',
  'false',
  'null',
  'and',
  'or',
  'not',
])

const SCADA_DSL_ROOTS = new Set<ScadaDslRoot>(['$self', '$device'])

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
      while (index < source.length && source[index] !== '\n') index += 1
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

      tokens.push({ kind: 'string', value, start, end: index })
      if (!closed) {
        tokens.push({ kind: 'eof', value: '', start: index, end: index })
        return tokens
      }
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

    if (char === '$') {
      const start = index
      index += 1
      if (!isIdentifierStart(source[index] ?? '')) {
        tokens.push({ kind: 'punctuation', value: '$', start, end: index })
        continue
      }
      index += 1
      while (index < source.length && isIdentifierPart(source[index]!)) index += 1
      tokens.push({
        kind: 'identifier',
        value: source.slice(start, index),
        start,
        end: index,
      })
      continue
    }

    if (isIdentifierStart(char)) {
      const start = index
      index += 1
      while (index < source.length && isIdentifierPart(source[index]!)) index += 1
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

    if ('.(){};,:'.includes(char)) {
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
    if (this.isKeyword('case')) return this.parseCaseStatement()
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
      '语句必须是 Property 赋值、Action 调用、if、case 或 on Event',
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

  private parseCaseStatement(): ScadaDslCaseStatement {
    const caseToken = this.expectKeyword('case')
    const expression = this.parseExpression()
    this.expectPunctuation('{')
    const arms: ScadaDslCaseArm[] = []
    let wildcardSeen = false
    this.skipSeparators()

    while (!this.isPunctuation('}')) {
      if (this.is('eof')) throw new ParseFailure('case 块缺少 }', this.current())
      const pattern = this.parseCasePattern()
      if (pattern.kind === 'wildcard') {
        if (wildcardSeen) throw new ParseFailure('case 的 _ fallback 只能出现一次', this.previous())
        wildcardSeen = true
      } else if (wildcardSeen) {
        throw new ParseFailure('case 的 _ fallback 必须是最后一个 arm', this.previous())
      }

      this.expectPunctuation(':')
      const bodyStart = this.current().start
      let body: readonly ScadaDslStatement[]
      let armEnd: number

      if (this.matchPunctuation('{')) {
        body = this.parseBlock()
        armEnd = this.previous().end
      } else {
        const statement = this.parseStatement()
        body = [statement]
        armEnd = statement.span.end
        if (
          !this.is('newline') &&
          !this.isPunctuation(';') &&
          !this.isPunctuation('}')
        ) {
          throw new ParseFailure('case 单行 arm 后需要换行、; 或 }', this.current())
        }
      }

      if (body.length === 0) {
        throw new ParseFailure('case arm 不能为空', {
          kind: 'punctuation',
          value: ':',
          start: bodyStart,
          end: Math.max(bodyStart + 1, armEnd),
        })
      }

      arms.push({
        pattern,
        body,
        span: { start: pattern.span.start, end: armEnd },
      })
      this.skipSeparators()

      if (pattern.kind === 'wildcard' && !this.isPunctuation('}')) {
        throw new ParseFailure('case 的 _ fallback 必须是最后一个 arm', this.current())
      }
    }

    const close = this.expectPunctuation('}')
    return {
      kind: 'case',
      expression,
      arms,
      span: { start: caseToken.start, end: close.end },
    }
  }

  private parseCasePattern(): ScadaDslCasePattern {
    const token = this.current()
    if (token.kind === 'identifier' && token.value === '_') {
      this.advance()
      return { kind: 'wildcard', span: { start: token.start, end: token.end } }
    }
    if (token.kind === 'number') {
      this.advance()
      return {
        kind: 'literal',
        value: Number(token.value),
        span: { start: token.start, end: token.end },
      }
    }
    if (this.matchOperator('-')) {
      const minus = this.previous()
      const number = this.expect('number', 'case 的 - 后需要数字字面量')
      return {
        kind: 'literal',
        value: -Number(number.value),
        span: { start: minus.start, end: number.end },
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
    if (this.matchKeyword('true')) return this.caseLiteralFromPrevious(true)
    if (this.matchKeyword('false')) return this.caseLiteralFromPrevious(false)
    if (this.matchKeyword('null')) return this.caseLiteralFromPrevious(null)
    throw new ParseFailure('case arm 只支持标量字面量或 _ fallback', token)
  }

  private caseLiteralFromPrevious(value: ComponentScalarValue): ScadaDslCasePattern {
    const token = this.previous()
    return {
      kind: 'literal',
      value,
      span: { start: token.start, end: token.end },
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
      if (this.is('eof')) throw new ParseFailure('块缺少 }', this.current())
      statements.push(this.parseStatement())
      this.skipSeparators()
    }
    this.expectPunctuation('}')
    return statements
  }

  private parseExpression(): ScadaDslExpression {
    return this.parseOrExpression()
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
    const first = this.expect('identifier', '这里需要 $self 或 $device 能力引用')
    if (!SCADA_DSL_ROOTS.has(first.value as ScadaDslRoot)) {
      throw new ParseFailure(
        'SCADA DSL v1 只允许 $self 与 $device 两个根',
        first,
      )
    }
    const root = first.value as ScadaDslRoot
    this.expectPunctuation('.')
    const member = this.expect('identifier', '点号后需要能力名称')
    if (this.isPunctuation('.')) {
      throw new ParseFailure('SCADA DSL v1 引用只允许“根.能力”两段', this.current())
    }
    return {
      kind: 'reference',
      path: [root, member.value],
      span: { start: first.start, end: member.end },
    }
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
    if (!this.isKeyword(value)) throw new ParseFailure(`这里需要 ${value}`, token)
    return this.advance()
  }

  private expectPunctuation(value: string) {
    const token = this.current()
    if (!this.isPunctuation(value)) throw new ParseFailure(`这里需要 ${value}`, token)
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
  symbol: ScadaDslRoot
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
  /** Legacy authoring hint. DSL v1 ignores it and always exposes the source as $device. */
  symbol?: string
  properties: Readonly<Record<string, ComponentPropertyDefinition>>
  actions: Readonly<Record<string, ComponentActionDefinition>>
  events?: Readonly<Record<string, ComponentEventDefinition>>
}

export type ScadaDslCapabilityCatalog = {
  items: readonly ScadaDslCapabilityItem[]
}

function appendCapabilities(
  items: ScadaDslCapabilityItem[],
  source: Omit<ScadaDslSourceDefinition, 'symbol'> & { symbol: ScadaDslRoot },
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
  if (sources.length > 1) {
    throw new Error(
      'SCADA DSL v1 每个组件只允许一个绑定设备，Capability Catalog 不能包含多个 device source',
    )
  }

  const items: ScadaDslCapabilityItem[] = []
  appendCapabilities(items, {
    sourceId: 'component',
    title: component.title,
    symbol: '$self',
    properties: component.properties,
    actions: component.actions,
    events: component.events,
  })

  const device = sources[0]
  if (device) {
    appendCapabilities(items, {
      sourceId: device.sourceId,
      title: device.title,
      symbol: '$device',
      properties: device.properties,
      actions: device.actions,
      events: device.events,
    })
  }

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
    /(\$(?:self|device))\.([A-Za-z0-9_\u4E00-\u9FFF]*)$/u,
  )

  if (match) {
    const symbol = match[1] as ScadaDslRoot
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

  const rootMatch = before.match(/(\$[A-Za-z0-9_]*)$/u)
  const rootPrefix = rootMatch?.[1] ?? ''
  const symbols = new Set<ScadaDslRoot>()
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

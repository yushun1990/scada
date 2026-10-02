import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const baseUrl = (process.env.SCADA_PAGES_URL ?? 'http://localhost:5199/').replace(/\/?$/, '/')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

/**
 * 属性契约紧凑行的列对齐契约：保存后的行是四列网格
 * （名称[+绑定徽标] / 默认值控件 / 说明 / 图标操作），列轨与行内容无关，
 * 同一个表内每一行的列边界必须完全一致——长名称、缺说明、绑定徽标
 * 都不得移动后续列。本冒烟通过真实 UI 造出混合行后做确定性坐标断言。
 */

async function addContractRow({ addLabel, entryLabel, name, kind, description }) {
  await page.getByRole('button', { name: addLabel }).click()
  const form = page.locator('.contract-row-form')
  await form.waitFor()

  await form.getByRole('textbox', { name: `${entryLabel} 名称` }).fill(name)
  if (kind) {
    await form.getByRole('combobox', { name: `${entryLabel} 类型` }).click()
    await page.getByRole('option', { name: kind }).click()
  }
  if (description) {
    await form.getByRole('textbox', { name: '说明' }).fill(description)
  }
  await form.locator("button[type='submit']").click()
  await form.waitFor({ state: 'hidden' })
}

async function readTableColumns() {
  return page.locator('.contract-row-list.has-items').evaluateAll((tables) =>
    tables.map((table) =>
      Array.from(table.querySelectorAll('.contract-row-display')).map((row) => {
        const cell = (selector) => {
          const el = row.querySelector(selector)
          if (!el) return null
          const rect = el.getBoundingClientRect()
          return { x: rect.x, right: rect.right }
        }
        return {
          key: row.querySelector('.contract-row-name-text')?.textContent ?? '',
          badge: Boolean(row.querySelector('.contract-row-badge')),
          name: cell('.contract-row-name'),
          value: cell('.contract-row-value'),
          description: cell('.contract-row-description'),
          actions: cell('.contract-row-actions'),
        }
      }),
    ),
  )
}

try {
  await page.goto(`${baseUrl}#/components/component-smart-storage-tank`, { waitUntil: 'load' })
  const shell = page.locator('.studio-shell.component-studio-shell')
  await shell.waitFor()

  // 属性契约编辑器在组件定义工作页里；先激活该工作页
  await page.locator('section.component-definition-page-host').click()
  await page.getByRole('region', { name: '组件定义工作页' }).getByRole('tab', { name: '属性' }).waitFor()

  // 混合行样本：长名称带说明的颜色配置、短名称无说明的数字配置、
  // 带说明与绑定徽标的运行属性（level / alarmThreshold 为已存在的无说明行）
  await addContractRow({
    addLabel: '+ 添加配置',
    entryLabel: 'Attribute',
    name: 'tankShellBackgroundColor',
    kind: '颜色',
    description: '罐体外壳的基础金属色，超高液位时叠加红色报警光晕',
  })
  await addContractRow({
    addLabel: '+ 添加配置',
    entryLabel: 'Attribute',
    name: 'showScale',
    kind: undefined,
    description: undefined,
  })
  await addContractRow({
    addLabel: '+ 添加属性',
    entryLabel: 'Property',
    name: 'temperature',
    kind: undefined,
    description: '介质温度，绑定遥测点 TE-101，超出 85°C 触发高温规则',
  })

  const tables = await readTableColumns()
  assert.equal(tables.length, 2, '静态属性与运行属性两个契约表都必须渲染')

  for (const [tableIndex, rows] of tables.entries()) {
    assert.ok(rows.length >= 2, `表 ${tableIndex} 需要至少两行才能验证对齐`)
    assert.ok(
      rows.some((row) => row.description),
      `表 ${tableIndex} 样本必须包含带说明的行`,
    )

    const columnEdge = (pick, edge) => {
      const values = rows.map((row) => (pick(row) ? Math.round(pick(row)[edge]) : null))
      const present = values.filter((value) => value !== null)
      return { values, present }
    }

    for (const [selector, label] of [
      [(row) => row.name, '名称'],
      [(row) => row.value, '默认值'],
      [(row) => row.actions, '操作'],
    ]) {
      const { values, present } = columnEdge(selector, 'x')
      assert.ok(
        present.length === rows.length,
        `表 ${tableIndex} 的${label}列必须在每一行出现`,
      )
      assert.ok(
        present.every((value) => value === present[0]),
        `表 ${tableIndex} 的${label}列左边界必须跨行一致：${values.join(', ')}`,
      )
      if (label === '操作') {
        const rights = rows.map((row) => (row.actions ? Math.round(row.actions.right) : null))
        assert.ok(
          rights.every((value) => value === rights[0]),
          `表 ${tableIndex} 的操作列右边界必须跨行一致：${rights.join(', ')}`,
        )
      }
    }

    const descEdges = columnEdge((row) => row.description, 'x')
    assert.ok(
      descEdges.present.length >= 1,
      `表 ${tableIndex} 的样本必须包含带说明的行`,
    )
    // 缺说明的行其说明列为空，但操作列不得前移（由上面操作列断言覆盖）
  }

  // 说明列左边界跨表一致（两个表共享同一轨道定义与容器宽度）
  const allDescX = tables
    .flat()
    .filter((row) => row.description)
    .map((row) => Math.round(row.description.x))
  assert.ok(
    allDescX.every((value) => value === allDescX[0]),
    `说明列左边界必须处处一致：${allDescX.join(', ')}`,
  )

  // 绑定徽标位于名称列内部，不得把默认值列右移
  const propertyRows = tables[1]
  assert.ok(
    propertyRows.every((row) => row.badge),
    '运行属性保存行都应携带绑定徽标',
  )
  const attributeRows = tables[0]
  assert.ok(
    attributeRows.every((row) => !row.badge),
    '静态属性行不应有绑定徽标',
  )
  const propertyValueX = Math.round(propertyRows[0].value.x)
  const attributeValueX = Math.round(attributeRows[0].value.x)
  assert.equal(
    propertyValueX,
    attributeValueX,
    '两个表的默认值列使用同一轨道（同容器宽度下）',
  )

  // 视觉证据：两个表的混合行（长/短名称、有/无说明、徽标、颜色控件）
  const attributeList = page.locator('.contract-row-list.has-items').first()
  await attributeList.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'artifacts/component-contract-rows-aligned.png', fullPage: true })

  // 页面处于未保存状态即可：本冒烟不点击头部保存，测试数据不落盘
  assert.deepEqual(errors, [])
  console.log('Contract rows alignment smoke passed: 标签 / 默认值 / 说明 / 操作 four columns stay aligned across mixed saved rows.')
} finally {
  await browser.close()
}

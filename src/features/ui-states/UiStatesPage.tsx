import { useState } from 'react'
import {
  Button,
  Checkbox,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
  Input,
  MenuItem,
  MenuPopup,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
  SegmentedControl,
  Select,
  SplitPane,
  StatusBar,
  Textarea,
} from '../../ui'
import './UiStatesPage.css'

const palette = [
  ['app', '--ui-color-app-background'],
  ['panel', '--ui-color-panel'],
  ['surface', '--ui-color-surface'],
  ['surface subtle', '--ui-color-surface-subtle'],
  ['canvas', '--ui-color-canvas'],
  ['text', '--ui-color-text'],
  ['text secondary', '--ui-color-text-secondary'],
  ['border strong', '--ui-color-border-strong'],
  ['accent', '--ui-color-accent'],
  ['accent soft', '--ui-color-accent-soft'],
  ['success', '--ui-color-success'],
  ['warning', '--ui-color-warning'],
  ['danger', '--ui-color-danger'],
] as const

const selectOptions = [
  { value: 'auto', label: '自动' },
  { value: 'manual', label: '手动' },
]

export function UiStatesPage() {
  const [checked, setChecked] = useState(true)
  const [mode, setMode] = useState<'design' | 'preview'>('design')
  const [selectValue, setSelectValue] = useState('auto')
  const [splitSize, setSplitSize] = useState(220)

  return (
    <main className="ui-state-page" aria-label="Studio UI state samples">
      <header className="ui-state-header">
        <div>
          <span className="ui-state-eyebrow">C1 · visual authority</span>
          <h1>Studio primitive states</h1>
          <p>内部验收页。正常 Workspace 不提供入口。</p>
        </div>
        <code>tokens.css → ui-primitives.css</code>
      </header>

      <section className="ui-state-section" aria-labelledby="palette-title">
        <h2 id="palette-title">Palette tokens</h2>
        <div className="ui-token-grid">
          {palette.map(([label, token]) => (
            <div className="ui-token-swatch" key={token} data-token={token}>
              <span style={{ background: `var(${token})` }} />
              <strong>{label}</strong>
              <code>{token}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="ui-state-section" aria-labelledby="button-title">
        <h2 id="button-title">Button states</h2>
        <div className="ui-state-row">
          <Button variant="primary" data-testid="state-button-primary">保存</Button>
          <Button data-testid="state-button-interaction">默认 / hover / focus / pressed</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">删除</Button>
          <Button disabled data-testid="state-button-disabled">Disabled</Button>
        </div>
      </section>

      <section className="ui-state-section" aria-labelledby="field-title">
        <h2 id="field-title">Field states</h2>
        <div className="ui-state-field-grid">
          <label>
            <span>Default</span>
            <Input defaultValue="P-101" data-testid="state-input-default" />
          </label>
          <label>
            <span>Read-only</span>
            <Input readOnly defaultValue="runtime.value" data-testid="state-input-readonly" />
          </label>
          <label>
            <span>Error</span>
            <Input aria-invalid="true" defaultValue="invalid" data-testid="state-input-error" />
          </label>
          <label>
            <span>Disabled</span>
            <Input disabled defaultValue="disabled" data-testid="state-input-disabled" />
          </label>
          <label className="ui-state-field-wide">
            <span>Textarea</span>
            <Textarea defaultValue="12px long-form help remains readable." />
          </label>
          <label>
            <span>Select</span>
            <Select
              value={selectValue}
              options={selectOptions}
              ariaLabel="状态样本选择器"
              onValueChange={setSelectValue}
            />
          </label>
        </div>
      </section>

      <section className="ui-state-section" aria-labelledby="selection-title">
        <h2 id="selection-title">Selection states</h2>
        <div className="ui-state-row">
          <Checkbox checked={checked} onCheckedChange={setChecked} label="Checked" />
          <Checkbox checked={false} indeterminate onCheckedChange={() => {}} label="Mixed" className="state-mixed-checkbox" />
          <Checkbox checked readOnly onCheckedChange={() => {}} label="Read-only" />
          <Checkbox checked={false} disabled onCheckedChange={() => {}} label="Disabled" />
          <Checkbox checked={false} invalid onCheckedChange={() => {}} label="Error" />
        </div>
        <div className="ui-state-mode-row">
          <SegmentedControl
            value={mode}
            items={[
              { value: 'design', label: '设计' },
              { value: 'preview', label: '预览' },
            ]}
            onValueChange={setMode}
            ariaLabel="状态样本工作模式"
          />
        </div>
      </section>

      <section className="ui-state-section" aria-labelledby="overlay-title">
        <h2 id="overlay-title">Floating primitives</h2>
        <div className="ui-state-row">
          <MenuRoot>
            <MenuTrigger data-testid="state-menu-trigger">文件 ▾</MenuTrigger>
            <MenuPopup>
              <MenuItem>保存</MenuItem>
              <MenuItem>导出</MenuItem>
              <MenuSeparator />
              <MenuItem destructive>删除</MenuItem>
            </MenuPopup>
          </MenuRoot>

          <DialogRoot>
            <DialogTrigger data-testid="state-dialog-trigger">打开对话框</DialogTrigger>
            <DialogContent>
              <DialogTitle>未保存修改</DialogTitle>
              <DialogDescription>
                对话框使用同一 surface、border、focus 和 4px floating radius。
              </DialogDescription>
              <div className="ui-state-dialog-actions">
                <DialogClose>取消</DialogClose>
                <Button variant="primary">保存并继续</Button>
              </div>
            </DialogContent>
          </DialogRoot>
        </div>
      </section>

      <section className="ui-state-section" aria-labelledby="split-title">
        <h2 id="split-title">SplitPane + StatusBar</h2>
        <div className="ui-state-split-host">
          <SplitPane
            ariaLabel="样本面板宽度"
            size={splitSize}
            minSize={180}
            maxSize={320}
            onSizeChange={setSplitSize}
            first={<div className="ui-state-pane">Navigator · {Math.round(splitSize)}px</div>}
            second={<div className="ui-state-pane ui-state-pane-secondary">Canvas / Inspector surface</div>}
          />
        </div>
        <StatusBar data-testid="state-status-bar">
          <span>问题 0 · 已保存</span>
          <span>设计 · 100%</span>
        </StatusBar>
      </section>
    </main>
  )
}

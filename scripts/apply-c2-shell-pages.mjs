import { readFile, writeFile } from 'node:fs/promises'

function between(source, start, end, label) {
  const startIndex = source.indexOf(start)
  if (startIndex < 0) throw new Error(`${label}: start marker not found`)
  const endIndex = source.indexOf(end, startIndex)
  if (endIndex < 0) throw new Error(`${label}: end marker not found`)
  return source.slice(startIndex, endIndex)
}

async function patchScada() {
  const path = 'src/features/scada-editor/ScadaEditorPage.tsx'
  let text = await readFile(path, 'utf8')
  const importMarker = "import { EditorLeaveDialog } from '../../editor/EditorLeaveDialog'"
  if (!text.includes("from '../../editor/StudioShell'")) {
    text = text.replace(
      importMarker,
      `${importMarker}\nimport { StudioShell, type StudioMenuDefinition } from '../../editor/StudioShell'`,
    )
  }
  text = text.replace(
    'export function ScadaEditorPage({ workId }: { workId: string }) {',
    `export function ScadaEditorPage({\n  workId,\n  onNavigateWorkspace,\n}: {\n  workId: string\n  onNavigateWorkspace: () => void\n}) {`,
  )

  const returnStart = text.lastIndexOf('\n  return (\n')
  if (returnStart < 0) throw new Error('SCADA return block not found')
  const prefix = text.slice(0, returnStart)
  const oldReturn = text.slice(returnStart)
  const left = between(
    oldReturn,
    '        <aside className="component-panel">',
    '\n\n        <section className="canvas-area"',
    'SCADA left panel',
  )
  const center = between(
    oldReturn,
    '        <section className="canvas-area"',
    '\n\n        <aside className="property-panel">',
    'SCADA center',
  )
  const right = between(
    oldReturn,
    '        <aside className="property-panel">',
    '\n      </main>\n\n      <EditorLeaveDialog',
    'SCADA right panel',
  )

  const replacement = `
  const menus: StudioMenuDefinition[] = [
    {
      id: 'file',
      label: '文件',
      commands: [
        {
          id: 'save',
          label: saveState.saving ? '保存中…' : '保存',
          disabled: saveState.saving || (!saveState.dirty && saveState.status !== 'error'),
          onSelect: () => void saveScene(),
        },
        {
          id: 'import',
          label: '导入场景',
          disabled: !designEditingEnabled,
          onSelect: () => importInputRef.current?.click(),
        },
        { id: 'export', label: '导出场景', onSelect: exportScene },
        {
          id: 'workspace',
          label: '返回工作台',
          separatorBefore: true,
          onSelect: onNavigateWorkspace,
        },
      ],
    },
    {
      id: 'edit',
      label: '编辑',
      commands: [
        { id: 'undo', label: '撤销', shortcut: 'Ctrl+Z', disabled: !designEditingEnabled || !canUndo, onSelect: undo },
        { id: 'redo', label: '重做', shortcut: 'Ctrl+Shift+Z', disabled: !designEditingEnabled || !canRedo, onSelect: redo },
        { id: 'duplicate', label: '复制选中对象', disabled: !designEditingEnabled || selectedNodes.length === 0, separatorBefore: true, onSelect: duplicateSelectedNodes },
        { id: 'delete', label: '删除选中对象', disabled: !designEditingEnabled || !hasSelection, destructive: true, onSelect: deleteSelection },
      ],
    },
    {
      id: 'view',
      label: '视图',
      commands: [
        { id: 'grid', label: gridVisible ? '隐藏格线' : '显示格线', onSelect: () => setGridVisible((current) => !current) },
        { id: 'snap', label: snapSettings.gridEnabled ? '关闭网格吸附' : '开启网格吸附', onSelect: () => setSnapSettings((current) => ({ ...current, gridEnabled: !current.gridEnabled })) },
      ],
    },
    {
      id: 'insert',
      label: '插入',
      commands: builtInComponentRegistry.list().map(({ definition }) => ({
        id: \`insert-\${definition.type}\`,
        label: definition.title,
        disabled: !designEditingEnabled,
        onSelect: () => addComponent(definition.type),
      })),
    },
    {
      id: 'arrange',
      label: '排列',
      commands: [
        { id: hierarchyMode, label: hierarchyTitle, disabled: !designEditingEnabled || !hierarchyEnabled, onSelect: hierarchyMode === 'ungroup' ? ungroupSelectedNode : groupSelectedNodes },
        ...alignButtons.map((item) => ({
          id: \`align-\${item.mode}\`,
          label: item.title,
          disabled: !designEditingEnabled || selectedNodes.length < 2,
          onSelect: () => applyAlignment(item.mode),
        })),
        { id: 'distribute-horizontal', label: '水平等距分布', disabled: !designEditingEnabled || selectedNodes.length < 3, onSelect: () => applyDistribution('horizontal') },
        { id: 'distribute-vertical', label: '垂直等距分布', disabled: !designEditingEnabled || selectedNodes.length < 3, onSelect: () => applyDistribution('vertical') },
      ],
    },
    {
      id: 'run',
      label: '运行',
      commands: [
        { id: 'design', label: '设计模式', disabled: mode === 'editor', onSelect: () => setMode('editor') },
        { id: 'preview', label: '预览模式', disabled: mode === 'preview', onSelect: () => setMode('preview') },
      ],
    },
  ]

  return (
    <>
      <StudioShell
        documentTitle={scene.name}
        documentType="SCADA Work"
        dirty={saveState.dirty}
        menus={menus}
        workspaceNavigationLabel="返回 SCADA 作品工作台"
        onNavigateWorkspace={onNavigateWorkspace}
        mainToolbar={(
          <>
            <Button
              variant="primary"
              disabled={saveState.saving || (!saveState.dirty && saveState.status !== 'error')}
              onClick={() => void saveScene()}
            >
              {saveState.saving ? '保存中…' : '保存'}
            </Button>
            <span className={\`document-save-status \${saveState.status}\`}>
              {saveState.saving
                ? saveState.changedWhileSaving ? '保存中 · 有新修改' : '保存中…'
                : saveState.status === 'error' ? '保存失败'
                : saveState.dirty ? '未保存' : '已保存'}
            </span>
            <Button variant="secondary" disabled={!designEditingEnabled || !canUndo} onClick={undo}>撤销</Button>
            <Button variant="secondary" disabled={!designEditingEnabled || !canRedo} onClick={redo}>重做</Button>
            <Input
              ref={importInputRef}
              className="hidden-input"
              type="file"
              accept="application/json,.json"
              disabled={!designEditingEnabled}
              onChange={(event) => void importScene(event)}
            />
          </>
        )}
        modeControl={(
          <SegmentedControl
            value={mode}
            items={MODE_ITEMS}
            onValueChange={setMode}
            ariaLabel="工作模式"
            className="mode-switch"
          />
        )}
        leftPanel={(
${left}
        )}
        center={(
${center}
        )}
        rightPanel={(
${right}
        )}
        status={(
          <>
            <span className="studio-status-cluster">
              <strong>{mode === 'preview' ? '预览' : '设计'}</strong>
              <span>{selectedConnection ? selectedConnection.name : selectedNodes.length > 1 ? \`已选 \${selectedNodes.length} 个对象\` : primaryNode?.name ?? '未选择对象'}</span>
            </span>
            <span className="studio-status-cluster">
              <span>{saveState.status === 'error' ? '保存失败' : saveState.dirty ? '未保存' : '已保存'}</span>
              <code>{scene.width} × {scene.height}</code>
              <span>{scene.nodes.length} 个组件 · {scene.connections.length} 条连线</span>
            </span>
          </>
        )}
      />

      <EditorLeaveDialog
        open={leaveProtection.pendingTargetHash !== null}
        saveStatus={saveState.status}
        saving={saveState.saving}
        busy={leaveProtection.leavingBusy}
        errorMessage={saveState.error?.message}
        onSaveAndLeave={() => void leaveProtection.saveAndLeave()}
        onDiscardAndLeave={leaveProtection.discardAndLeave}
        onCancel={leaveProtection.cancelLeave}
      />
    </>
  )
}
`
  await writeFile(path, prefix + replacement)
}

async function patchComponent() {
  const path = 'src/features/component-library/ComponentEditorPage.tsx'
  let text = await readFile(path, 'utf8')
  const importMarker = "import { EditorLeaveDialog } from '../../editor/EditorLeaveDialog'"
  if (!text.includes("from '../../editor/StudioShell'")) {
    text = text.replace(
      importMarker,
      `${importMarker}\nimport { StudioShell, type StudioMenuDefinition } from '../../editor/StudioShell'`,
    )
  }
  text = text.replace(
    'export function ComponentEditorPage({ componentId }: { componentId: string }) {',
    `export function ComponentEditorPage({\n  componentId,\n  onNavigateWorkspace,\n}: {\n  componentId: string\n  onNavigateWorkspace: () => void\n}) {`,
  )

  const returnStart = text.lastIndexOf('\n  return (\n')
  if (returnStart < 0) throw new Error('Component return block not found')
  const prefix = text.slice(0, returnStart)
  const oldReturn = text.slice(returnStart)
  const left = between(
    oldReturn,
    '        <aside className="component-panel component-layer-panel"',
    '\n\n        <section className="canvas-area component-canvas-area"',
    'Component left panel',
  )
  const center = between(
    oldReturn,
    '        <section className="canvas-area component-canvas-area"',
    '\n\n        <aside className="property-panel component-property-panel">',
    'Component center',
  )
  const right = between(
    oldReturn,
    '        <aside className="property-panel component-property-panel">',
    '\n      </main>\n\n      <EditorLeaveDialog',
    'Component right panel',
  )

  const replacement = `
  const menus: StudioMenuDefinition[] = [
    {
      id: 'file',
      label: '文件',
      commands: [
        {
          id: 'save',
          label: saveState.saving ? '保存中…' : '保存',
          disabled: builtInReadOnly || saveState.saving || (!saveState.dirty && saveState.status !== 'error'),
          onSelect: () => void save(),
        },
        { id: 'publish', label: publicationBusy ? '处理中…' : '发布', disabled: !canPublish, onSelect: () => void publishRemote() },
        { id: 'workspace', label: '返回工作台', separatorBefore: true, onSelect: onNavigateWorkspace },
      ],
    },
    {
      id: 'edit',
      label: '编辑',
      commands: [
        { id: 'undo', label: '撤销', shortcut: 'Ctrl+Z', disabled: editingDisabled || !canUndo, onSelect: undo },
        { id: 'redo', label: '重做', shortcut: 'Ctrl+Shift+Z', disabled: editingDisabled || !canRedo, onSelect: redo },
      ],
    },
    {
      id: 'view',
      label: '视图',
      commands: [
        { id: 'snap', label: snapEnabled ? '关闭吸附' : '开启吸附', disabled: !componentCanvasEditable, onSelect: () => setSnapEnabled((current) => !current) },
      ],
    },
    {
      id: 'run',
      label: '运行',
      commands: [
        { id: 'design', label: '设计模式', disabled: mode === 'editor', onSelect: () => setMode('editor') },
        { id: 'preview', label: '预览模式', disabled: mode === 'preview', onSelect: () => setMode('preview') },
      ],
    },
  ]

  return (
    <>
      <StudioShell
        className="component-studio-shell"
        documentTitle={definition.title}
        documentType={\`Component · \${definition.type}\`}
        dirty={saveState.dirty}
        menus={menus}
        workspaceNavigationLabel="返回组件库工作台"
        onNavigateWorkspace={onNavigateWorkspace}
        onFocusCapture={(event) => {
          if (!editingDisabled && isTextEditingTarget(event.target)) beginTransaction()
        }}
        onBlurCapture={(event) => {
          if (!editingDisabled && isTextEditingTarget(event.target)) commitTransaction()
        }}
        mainToolbar={(
          <>
            <Button
              variant="primary"
              disabled={builtInReadOnly || saveState.saving || (!saveState.dirty && saveState.status !== 'error')}
              onClick={() => void save()}
            >
              {saveState.saving ? '保存中…' : '保存'}
            </Button>
            <span className={\`document-save-status \${saveState.status}\`}>
              {saveState.saving
                ? saveState.changedWhileSaving ? '保存中 · 有新修改' : '保存中…'
                : saveState.status === 'error' ? '保存失败'
                : saveState.dirty ? '未保存' : '已保存'}
            </span>
            <Button disabled={!canPublish} onClick={() => void publishRemote()}>
              {publicationBusy ? '处理中…' : '发布'}
            </Button>
            <Button variant="secondary" disabled={editingDisabled || !canUndo} onClick={undo}>撤销</Button>
            <Button variant="secondary" disabled={editingDisabled || !canRedo} onClick={redo}>重做</Button>
          </>
        )}
        modeControl={(
          <SegmentedControl
            value={mode}
            items={MODE_ITEMS}
            onValueChange={setMode}
            ariaLabel="组件工作模式"
            className="mode-switch"
          />
        )}
        leftPanel={(
${left}
        )}
        center={(
${center}
        )}
        rightPanel={(
${right}
        )}
        status={(
          <>
            <span className="studio-status-cluster">
              <strong>{mode === 'preview' ? '预览' : '设计'}</strong>
              <span>{selectedLayerIds.length > 1 ? \`已选 \${selectedLayerIds.length} 个图层\` : inspectorContextLabel}</span>
            </span>
            <span className="studio-status-cluster">
              <span>{saveState.status === 'error' ? '保存失败' : saveState.dirty ? '未保存' : '已保存'}</span>
              <code>{definition.size.defaultWidth} × {definition.size.defaultHeight}</code>
              <span>{snapStatus}</span>
            </span>
          </>
        )}
      />

      <EditorLeaveDialog
        open={leaveProtection.pendingTargetHash !== null}
        saveStatus={saveState.status}
        saving={saveState.saving}
        busy={leaveProtection.leavingBusy}
        errorMessage={saveState.error?.message}
        onSaveAndLeave={() => void leaveProtection.saveAndLeave()}
        onDiscardAndLeave={leaveProtection.discardAndLeave}
        onCancel={leaveProtection.cancelLeave}
      />
    </>
  )
}
`
  await writeFile(path, prefix + replacement)
}

await patchScada()
await patchComponent()
console.log('C2 StudioShell editor migration applied.')

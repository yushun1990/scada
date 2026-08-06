from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


renderer_path = Path('src/renderer/SceneRenderer.tsx')
renderer = renderer_path.read_text()
renderer = replace_once(
    renderer,
    '''      setViewport({
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(360, Math.floor(entry.contentRect.height)),
      })''',
    '''      const nextViewport = {
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(360, Math.floor(entry.contentRect.height)),
      }
      setViewport(nextViewport)

      if (!viewportInitializedRef.current) {
        viewportInitializedRef.current = true
        commitViewportTransform(
          fitSceneToViewport(nextViewport, {
            width: scene.width,
            height: scene.height,
          }),
        )
      }''',
    'fit after measured viewport',
)
renderer = replace_once(
    renderer,
    '''
  useEffect(() => {
    if (viewportInitializedRef.current) {
      return
    }

    viewportInitializedRef.current = true
    commitViewportTransform(
      fitSceneToViewport(viewport, { width: scene.width, height: scene.height }),
    )
  }, [viewport.width, viewport.height, scene.width, scene.height])
''',
    '\n',
    'remove premature initial fit effect',
)
renderer_path.write_text(renderer)

app_path = Path('src/App.tsx')
app = app_path.read_text()
app = app.replace("setMessage('v3 场景已保存到浏览器')", "setMessage('v4 场景已保存到浏览器')")
app = replace_once(
    app,
    '''            </button>
  <button
    type="button"
    className="tool-button optional-tool"
    disabled={selectedNodes.length === 0}
    onClick={resetSelectedTransforms}
  >
    重置
  </button>
            <button
              type="button"
              className="tool-button optional-tool"
              disabled={!canGroup}''',
    '''            </button>
            <button
              type="button"
              className="tool-button optional-tool"
              disabled={selectedNodes.length === 0}
              onClick={resetSelectedTransforms}
            >
              重置
            </button>
            <button
              type="button"
              className="tool-button optional-tool"
              disabled={!canGroup}''',
    'format reset toolbar command',
)
app_path.write_text(app)

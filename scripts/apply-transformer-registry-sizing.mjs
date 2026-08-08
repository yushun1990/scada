import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const path = 'src/renderer/SceneRenderer.tsx'
let text = readFileSync(path, 'utf8')

const replacements = [
  [
    `import {\n  PUMP_MIN_HEIGHT,\n  PUMP_MIN_WIDTH,\n} from '../components/PumpNode'`,
    `import { builtInComponentRegistry } from '../component-system/builtins'`,
  ],
  [
    `    const aspectRatio = node.transform.width / node.transform.height\n    const minimumWidth = isGroupNode(node) ? GROUP_MIN_SIZE : PUMP_MIN_WIDTH\n    const nextWidth = Math.max(minimumWidth, preview.width)\n    const nextHeight = nextWidth / aspectRatio`,
    `    const aspectRatio = node.transform.width / node.transform.height\n    const componentSize = !isGroupNode(node)\n      ? builtInComponentRegistry.get(node.type)?.definition.size\n      : null\n    const minimumWidth = isGroupNode(node)\n      ? Math.max(GROUP_MIN_SIZE, GROUP_MIN_SIZE * aspectRatio)\n      : Math.max(\n          componentSize?.minWidth ?? 1,\n          (componentSize?.minHeight ?? 1) * aspectRatio,\n        )\n    const nextWidth = Math.max(minimumWidth, preview.width)\n    const nextHeight = nextWidth / aspectRatio`,
  ],
  [
    `  const minimumTransformWidth =\n    transformNode && isGroupNode(transformNode)\n      ? GROUP_MIN_SIZE\n      : PUMP_MIN_WIDTH\n  const minimumTransformHeight =\n    transformNode && isGroupNode(transformNode)\n      ? GROUP_MIN_SIZE\n      : PUMP_MIN_HEIGHT`,
    `  const transformComponentSize =\n    transformNode && !isGroupNode(transformNode)\n      ? builtInComponentRegistry.get(transformNode.type)?.definition.size\n      : null\n  const minimumTransformWidth =\n    transformNode && isGroupNode(transformNode)\n      ? GROUP_MIN_SIZE\n      : transformComponentSize?.minWidth ?? 1\n  const minimumTransformHeight =\n    transformNode && isGroupNode(transformNode)\n      ? GROUP_MIN_SIZE\n      : transformComponentSize?.minHeight ?? 1`,
  ],
  [
    `              boundBoxFunc={(oldBox, newBox) => {\n                if (\n                  Math.abs(newBox.width) < minimumTransformWidth ||\n                  Math.abs(newBox.height) < minimumTransformHeight\n                ) {\n                  return oldBox\n                }\n\n                const currentViewport = viewportTransformRef.current`,
    `              boundBoxFunc={(oldBox, newBox) => {\n                const currentViewport = viewportTransformRef.current\n                const minimumBoxWidth =\n                  minimumTransformWidth * currentViewport.scale\n                const minimumBoxHeight =\n                  minimumTransformHeight * currentViewport.scale\n\n                if (\n                  Math.abs(newBox.width) < minimumBoxWidth ||\n                  Math.abs(newBox.height) < minimumBoxHeight\n                ) {\n                  return oldBox\n                }`,
  ],
]

for (const [from, to] of replacements) {
  if (!text.includes(from)) {
    throw new Error(`Expected SceneRenderer fragment not found:\n${from}`)
  }
  text = text.replace(from, to)
}

writeFileSync(path, text)

try {
  execFileSync('git', ['config', 'user.name', 'github-actions[bot]'])
  execFileSync('git', ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
  execFileSync('git', ['add', path])
  execFileSync('git', ['commit', '-m', 'refactor: read transformer sizing from registry'], { stdio: 'inherit' })
  execFileSync('git', ['push', 'origin', 'HEAD:refactor/registry-transformer-sizing'], { stdio: 'inherit' })
} catch (error) {
  console.warn('CI workspace was patched successfully, but pushing the generated source was not permitted.')
}

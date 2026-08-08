import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

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
const blobSha = execFileSync('git', ['hash-object', path], { encoding: 'utf8' }).trim()
console.log(`VERIFIED_SCENE_RENDERER_BLOB=${blobSha}`)
const payload = gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).toString('base64')
const chunkSize = 6000
console.log(`VERIFIED_GZIP_LENGTH=${payload.length}`)
for (let index = 0; index < 3; index += 1) {
  console.log(`VERIFIED_GZIP_${String(index).padStart(2, '0')}=${payload.slice(index * chunkSize, (index + 1) * chunkSize)}`)
}
const tail = payload.slice(chunkSize * 3)
console.log(`VERIFIED_GZIP_TAIL_LENGTH=${tail.length}`)
for (let index = 0; index < 3; index += 1) {
  const start = index * 448
  console.log(`VERIFIED_GZIP_TAIL_${index}=${tail.slice(start, start + 448)}`)
}

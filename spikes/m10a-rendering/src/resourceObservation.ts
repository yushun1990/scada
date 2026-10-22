import * as THREE from 'three'

// Observe the loaded scene, not declarations in its fixture manifest. Counts
// describe reachable model resources; renderer-internal allocations are separate.
export function observeModelResources(root: THREE.Object3D) {
  let meshInstances = 0
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  const backingBuffers = new Set<ArrayBufferLike>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    meshInstances++
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
  })
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) {
      const array = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array
      backingBuffers.add(array.buffer)
    }
    if (geometry.index) backingBuffers.add(geometry.index.array.buffer)
  }
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
  }
  const images = new Set<{ width?: number; height?: number }>()
  const textureRecords = [...textures].map((texture) => {
    const image = texture.source.data as { width?: number; height?: number } | null
    if (image) images.add(image)
    return {
      width: image?.width ?? null, height: image?.height ?? null,
      generateMipmaps: texture.generateMipmaps, minFilter: texture.minFilter,
      format: texture.format, type: texture.type,
    }
  })
  return {
    meshInstances, uniqueGeometries: geometries.size, uniqueTextures: textures.size,
    attributeAndIndexBytes: [...backingBuffers].reduce((total, buffer) => total + buffer.byteLength, 0),
    byteAccounting: 'unique CPU attribute/index ArrayBuffer backing lengths; not GPU or process memory',
    images: [...images].map((image) => ({ width: image.width ?? null, height: image.height ?? null })),
    textures: textureRecords,
  }
}

import assert from 'node:assert/strict'
import * as THREE from 'three'
import { observeModelResources } from '../src/resourceObservation'

const shared = new Float32Array(18)
const geometry = new THREE.BufferGeometry()
geometry.setAttribute('position', new THREE.BufferAttribute(shared.subarray(0, 9), 3))
geometry.setAttribute('normal', new THREE.BufferAttribute(shared.subarray(9), 3))
geometry.setIndex([0, 1, 2])
const texture = new THREE.Texture({ width: 4096, height: 4096 })
texture.minFilter = THREE.LinearMipmapLinearFilter
const material = new THREE.MeshStandardMaterial({ map: texture })
const root = new THREE.Group()
root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material))
const result = observeModelResources(root)
assert.equal(result.meshInstances, 2)
assert.equal(result.uniqueGeometries, 1)
assert.equal(result.attributeAndIndexBytes, shared.byteLength + geometry.index!.array.buffer.byteLength)
assert.equal(result.uniqueTextures, 1)
assert.deepEqual(result.images, [{ width: 4096, height: 4096 }])
assert.equal(result.textures[0].generateMipmaps, true)
assert.equal(result.textures[0].minFilter, THREE.LinearMipmapLinearFilter)
root.clear()
assert.equal(observeModelResources(root).attributeAndIndexBytes, 0)
assert.equal(observeModelResources(root).uniqueTextures, 0)
geometry.dispose(); material.dispose(); texture.dispose()
console.log('PASS: actual scene observation counts shared instances, geometry backing buffers and image/texture identities without multiplying allocations.')

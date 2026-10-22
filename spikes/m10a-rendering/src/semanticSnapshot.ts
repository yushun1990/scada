import type { ComponentDefinition, ComponentProps } from '../../../src/component-system/definition'
import { resolveEffectiveComponentProps } from '../../../src/runtime/effective-component-props'
import { RuntimeValueStore } from '../../../src/runtime/runtime-value-store'

// Fixed trusted fixture. This intentionally exercises the existing scalar
// resolver; it is not a Preview/DSL/compiler or a second Property authority.
export const fixtureDefinition: ComponentDefinition = {
  type: 'm10a.fixed-fixture', title: 'M10A fixture', category: 'spike',
  description: 'Disposable presentation experiment',
  size: { defaultWidth: 80, defaultHeight: 80, minWidth: 1, minHeight: 1 },
  attributes: {}, actions: {}, events: {}, anchors: [],
  properties: {
    visible: { title: 'Visible', kind: 'boolean', defaultValue: true, bindable: true },
    color: { title: 'Color', kind: 'color', defaultValue: '#35c5b1', bindable: true },
    playing: { title: 'Playing', kind: 'boolean', defaultValue: false, bindable: true },
  },
}

export const sourceValues = new RuntimeValueStore()
const bindings = ['visible', 'color', 'playing'].map((property) => ({
  id: `binding-${property}`, property, source: { kind: 'runtime-value' as const, key: `fixture.${property}` },
}))
const fallback = Object.freeze({ visible: true, color: '#35c5b1', playing: false })
let effective = Object.freeze(resolveEffectiveComponentProps(fixtureDefinition, fallback, bindings, sourceValues.getSnapshot()))
const listeners = new Set<() => void>()
sourceValues.subscribe(() => {
  effective = Object.freeze(resolveEffectiveComponentProps(fixtureDefinition, fallback, bindings, sourceValues.getSnapshot()))
  listeners.forEach((listener) => listener())
})

export const effectiveSnapshot = {
  get: () => effective,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
}

export function setFixtureProperties(values: Partial<ComponentProps>) {
  // Only the three fixed test controls reach the existing source-value store.
  const next: ComponentProps = {}
  if (typeof values.visible === 'boolean') next['fixture.visible'] = values.visible
  if (typeof values.playing === 'boolean') next['fixture.playing'] = values.playing
  if (typeof values.color === 'string' && /^#[0-9a-f]{6}$/i.test(values.color)) next['fixture.color'] = values.color
  sourceValues.setMany(next)
}

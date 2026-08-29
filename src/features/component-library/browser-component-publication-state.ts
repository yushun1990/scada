import {
  browserPersistence,
  ensureBrowserPersistenceReady,
} from '../../storage/browser-persistence'
import {
  parseComponentPublicationObservation,
  type ComponentPublicationObservation,
  type ComponentPublicationObservationStore,
} from './component-publication-client'

const PUBLICATION_OBSERVATION_META_PREFIX = 'component-publication-observation-v1:'

function publicationObservationKey(componentType: string) {
  return `${PUBLICATION_OBSERVATION_META_PREFIX}${componentType}`
}

export const browserComponentPublicationObservationStore: ComponentPublicationObservationStore = {
  async get(componentType) {
    await ensureBrowserPersistenceReady()
    return parseComponentPublicationObservation(
      await browserPersistence.getMeta(publicationObservationKey(componentType)),
    )
  },

  async put(observation: ComponentPublicationObservation) {
    await ensureBrowserPersistenceReady()
    await browserPersistence.setMeta(
      publicationObservationKey(observation.componentType),
      { ...observation },
    )
  },
}

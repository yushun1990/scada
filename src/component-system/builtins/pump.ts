import { createDefaultPropsFromDefinition } from '../definition'
import type { ComponentRegistration } from '../registration'
import { PumpComponentRenderer } from './PumpComponentRenderer'
import {
  migratePumpPersistedAuthoredState,
  pumpComponentDefinition,
} from './pump-contract'

export {
  migratePumpPersistedAuthoredState,
  pumpComponentDefinition,
  PUMP_COMPONENT_TYPE,
  PUMP_STATE_VALUES,
  type PumpSemanticState,
} from './pump-contract'

export const pumpComponentRegistration: ComponentRegistration = {
  definition: pumpComponentDefinition,
  renderer: PumpComponentRenderer,
  createDefaultProps: () => createDefaultPropsFromDefinition(pumpComponentDefinition),
  migratePersistedAuthoredState: migratePumpPersistedAuthoredState,
  actions: {
    start: ({ emit }) => {
      emit('startRequested')
    },
    stop: ({ emit }) => {
      emit('stopRequested')
    },
  },
}

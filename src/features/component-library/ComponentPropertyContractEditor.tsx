import type { ComponentDefinition } from '../../component-system/definition'
import {
  ContractRowTable,
  createContractRowEntry,
} from './ComponentContractRowTable'

type ComponentPropertyContractEditorProps = {
  definition: ComponentDefinition
  readOnly: boolean
  onChange: (definition: ComponentDefinition) => void
}

export function ComponentPropertyContractEditor({
  definition,
  readOnly,
  onChange,
}: ComponentPropertyContractEditorProps) {
  return (
    <ContractRowTable
      entryLabel="Property"
      keyPrefix="property"
      entries={definition.properties}
      readOnly={readOnly}
      addLabel="+ 添加属性"
      emptyLabel="尚未添加运行属性"
      createEntry={(key) => ({ ...createContractRowEntry(key), bindable: true })}
      isBindable={(property) => Boolean(property.bindable)}
      onEntriesChange={(properties) => onChange({ ...definition, properties })}
    />
  )
}

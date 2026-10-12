import type { ComponentDefinition } from '../../component-system/definition'
import type { ContractKeyRename } from './component-property-references'
import {
  ContractRowTable,
  createContractRowEntry,
} from './ComponentContractRowTable'

type ComponentPropertyContractEditorProps = {
  definition: ComponentDefinition
  readOnly: boolean
  onChange: (definition: ComponentDefinition, rename?: ContractKeyRename) => void
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
      onEntriesChange={(properties, rename) => onChange({ ...definition, properties }, rename)}
    />
  )
}

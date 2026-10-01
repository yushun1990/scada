import type { ComponentDefinition } from '../../component-system/definition'
import {
  ContractRowTable,
  createContractRowEntry,
} from './ComponentContractRowTable'

type ComponentAttributeContractEditorProps = {
  definition: ComponentDefinition
  readOnly: boolean
  onChange: (definition: ComponentDefinition) => void
}

export function ComponentAttributeContractEditor({
  definition,
  readOnly,
  onChange,
}: ComponentAttributeContractEditorProps) {
  return (
    <ContractRowTable
      entryLabel="Attribute"
      keyPrefix="attribute"
      entries={definition.attributes}
      readOnly={readOnly}
      addLabel="+ 添加配置"
      emptyLabel="尚未添加静态配置"
      createEntry={createContractRowEntry}
      onEntriesChange={(attributes) => onChange({ ...definition, attributes })}
    />
  )
}

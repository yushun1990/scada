import type {
  ComponentActionDefinition,
  ComponentEventDefinition,
} from '../component-system/definition'
import { describeActionParameters, describeEventPayload } from './component-interaction-schema'
import './component-interaction-schema.css'

type ComponentInteractionSchemaProps =
  | { kind: 'action'; definition: ComponentActionDefinition }
  | { kind: 'event'; definition: ComponentEventDefinition }

/** Read-only consumption of a type-owned contract; no definition editing or execution. */
export function ComponentInteractionSchema(props: ComponentInteractionSchemaProps) {
  const fields = props.kind === 'action'
    ? describeActionParameters(props.definition)
    : describeEventPayload(props.definition)
  const label = props.kind === 'action' ? '操作参数（按声明顺序）' : '事件载荷（命名字段）'
  const FieldsList = props.kind === 'action' ? 'ol' : 'ul'
  const emptyMessage = props.kind === 'action'
    ? '无参数。'
    : fields === undefined ? '不接受载荷。' : '仅接受空记录 {}。'

  return (
    <section className="interaction-contract-schema" aria-label={label}>
      <strong className="interaction-contract-schema-heading">{label} · 只读</strong>
      {!fields?.length ? (
        <p className="interaction-contract-schema-note">{emptyMessage}</p>
      ) : (
        <FieldsList className="interaction-contract-schema-fields">
          {fields.map((field) => (
            <li key={field.name} className="interaction-contract-schema-field">
              <div className="interaction-contract-schema-field-head">
                <code>{field.name}</code>
                <span>{field.title}</span>
              </div>
              <div className="interaction-contract-schema-constraints">
                <span>{field.type}</span>
                <span>{field.requirement}</span>
                <span>{field.nullability}</span>
              </div>
              {field.options.length > 0 && (
                <ul className="interaction-contract-schema-options" aria-label={`${field.name} 枚举选项`}>
                  {field.options.map((option) => (
                    <li key={option.value}>
                      <span>{option.label}</span> = <code>{option.value}</code>
                    </li>
                  ))}
                </ul>
              )}
              {field.description && <p className="interaction-contract-schema-note">{field.description}</p>}
            </li>
          ))}
        </FieldsList>
      )}
      {props.kind === 'event' && fields !== undefined && (
        <p className="interaction-contract-schema-note">不接受未声明的载荷字段。</p>
      )}
    </section>
  )
}

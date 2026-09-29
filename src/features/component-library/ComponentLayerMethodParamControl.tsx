import type { SvgLayerMethodParameter } from '../../component-system/visual'
import { Checkbox, Input, NumberInput, Select } from '../../ui'

type LayerMethodParamControlProps = {
  param: SvgLayerMethodParameter
  value: unknown
  ariaLabel?: string
  onChange: (next: string | number | boolean) => void
}

/** One editor per declared layer-method parameter kind, shared by the run
 * dialog and the code modal's test panel so both bind values identically. */
export function LayerMethodParamControl({
  param,
  value,
  ariaLabel,
  onChange,
}: LayerMethodParamControlProps) {
  const label = ariaLabel ?? (param.title || param.name)

  if (param.kind === 'select') {
    return (
      <Select
        value={String(value ?? '')}
        ariaLabel={label}
        options={(param.options ?? []).map((option) => ({
          value: String(option.value),
          label: option.label,
        }))}
        onValueChange={onChange}
      />
    )
  }

  if (param.kind === 'boolean') {
    return (
      <Checkbox
        checked={Boolean(value)}
        label={value ? 'true' : 'false'}
        onCheckedChange={onChange}
      />
    )
  }

  if (param.kind === 'number') {
    return (
      <NumberInput
        value={typeof value === 'number' ? value : 0}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.target.value)
          onChange(Number.isFinite(next) ? next : 0)
        }}
      />
    )
  }

  return (
    <Input
      value={String(value ?? '')}
      aria-label={label}
      placeholder="参数值"
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

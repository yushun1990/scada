import pumpSvg from '../water-pump'

export const pumpStatePalettes = {
  gray: {
    light: '#d8e3df',
    dark: '#788581',
  },
  green: {
    light: '#4cff32',
    dark: '#0f9f20',
  },
  blue: {
    light: '#38bdf8',
    dark: '#0369a1',
  },
  orange: {
    light: '#fb923c',
    dark: '#c2410c',
  },
  red: {
    light: '#ff4d4d',
    dark: '#b91c1c',
  },
} as const

export type PumpState = keyof typeof pumpStatePalettes

function createStateSource(state: PumpState) {
  const palette = pumpStatePalettes[state]
  const stateStyle = `<style>
    #pump-color1 { fill: ${palette.light} !important; }
    #pump-color2 { fill: ${palette.dark} !important; }
  </style>`
  const stateSvg = pumpSvg.replace(/<svg\b[^>]*>/, (openingTag) => {
    return `${openingTag}${stateStyle}`
  })

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stateSvg)}`
}

export const pumpStateSources = {
  gray: createStateSource('gray'),
  green: createStateSource('green'),
  blue: createStateSource('blue'),
  orange: createStateSource('orange'),
  red: createStateSource('red'),
} satisfies Record<PumpState, string>

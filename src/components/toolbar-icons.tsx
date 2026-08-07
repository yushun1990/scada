import type { SVGProps } from 'react'

// draw.io 风格的单色描边图标：currentColor、1.6 描边、24×24 viewBox。
// 所有按钮共用一套图形语言，禁用态由按钮透明度控制。

const base = (props: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  ...props,
})

export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

export function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

export function GroupIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
      <path d="M11 7h6a2 2 0 0 1 2 2v4" opacity="0.55" />
      <path d="M17 11V5" opacity="0.55" />
    </svg>
  )
}

export function UngroupIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}

export function AlignLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M5 3v18" />
      <rect x="5" y="4" width="11" height="5" rx="1" />
      <rect x="5" y="13" width="7" height="5" rx="1" />
    </svg>
  )
}

export function AlignCenterXIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18" />
      <rect x="6" y="4" width="12" height="5" rx="1" />
      <rect x="8" y="13" width="8" height="5" rx="1" />
    </svg>
  )
}

export function AlignRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M19 3v18" />
      <rect x="8" y="4" width="11" height="5" rx="1" />
      <rect x="12" y="13" width="7" height="5" rx="1" />
    </svg>
  )
}

export function AlignTopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 5h18" />
      <rect x="4" y="5" width="5" height="11" rx="1" />
      <rect x="13" y="5" width="7" height="7" rx="1" />
    </svg>
  )
}

export function AlignCenterYIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 12h18" />
      <rect x="4" y="6" width="5" height="12" rx="1" />
      <rect x="13" y="8" width="7" height="8" rx="1" />
    </svg>
  )
}

export function AlignBottomIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 19h18" />
      <rect x="4" y="8" width="5" height="11" rx="1" />
      <rect x="13" y="12" width="7" height="7" rx="1" />
    </svg>
  )
}

export function DistributeHorizontalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="5" width="4" height="14" rx="1" />
      <rect x="17" y="5" width="4" height="14" rx="1" />
      <path d="M7 12h10" strokeDasharray="2 2" />
      <path d="M9 9l3 3-3 3M15 9l-3 3 3 3" opacity="0.7" />
    </svg>
  )
}

export function DistributeVerticalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="3" width="14" height="4" rx="1" />
      <rect x="5" y="17" width="14" height="4" rx="1" />
      <path d="M12 7v10" strokeDasharray="2 2" />
      <path d="M9 9l3 3 3-3M9 15l3-3 3 3" opacity="0.7" />
    </svg>
  )
}

export function GridIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity="0.7" />
      <rect x="3" y="3" width="18" height="18" rx="1.5" />
    </svg>
  )
}

export function SnapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v4l3 3v6a3 3 0 0 1-6 0v-6l3-3" />
      <circle cx="12" cy="3.5" r="0.6" fill="currentColor" stroke="none" />
      <path d="M12 13v5" opacity="0.6" />
    </svg>
  )
}

// 标准左向回转箭头：撤销
export function UndoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  )
}

// 标准右向回转箭头：重做
export function RedoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
    </svg>
  )
}

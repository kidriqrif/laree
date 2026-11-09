import { useId, type ComponentPropsWithRef, type ReactElement, type ReactNode } from 'react'
import type { IconGeometry, IconNode } from './paths.ts'

type SvgProps = Omit<ComponentPropsWithRef<'svg'>, 'children' | 'viewBox' | 'width' | 'height' | 'title'>

export interface IconProps extends SvgProps {
  /** Rendered size in CSS pixels, or any CSS length. The drawing is always 24 x 24. */
  size?: number | string
  /** Accessible name. Leave out when a visible label sits next to the icon. */
  title?: string
}

/**
 * Shared frame for the hand-drawn 24 px set: 2 px round strokes in currentColor, no fill.
 * Without a title (or an aria-label) the icon is decorative and hidden from assistive technology.
 */
export function IconFrame({ size = 24, title, children, ...rest }: IconProps & { children?: ReactNode }) {
  const titleId = `${useId()}icon-title`
  const named = Boolean(title) || rest['aria-label'] !== undefined || rest['aria-labelledby'] !== undefined
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={named ? 'img' : undefined}
      aria-hidden={named ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      {...rest}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {children}
    </svg>
  )
}

function drawNode(node: IconNode): ReactElement {
  if ('d' in node) return <path key={node.d} d={node.d} />
  if ('cx' in node) {
    const key = `c ${node.cx} ${node.cy} ${node.r}`
    return node.dot ? (
      <circle key={key} cx={node.cx} cy={node.cy} r={node.r} fill="currentColor" stroke="none" />
    ) : (
      <circle key={key} cx={node.cx} cy={node.cy} r={node.r} />
    )
  }
  return (
    <rect
      key={`r ${node.x} ${node.y} ${node.w} ${node.h}`}
      x={node.x}
      y={node.y}
      width={node.w}
      height={node.h}
      rx={node.rx}
    />
  )
}

export interface IconComponentProps extends IconProps {
  /** Geometry from `paths.ts`. */
  paths: IconGeometry
}

/** Draws one icon from its geometry. The named `Icon<Name>` wrappers are the usual way in. */
export function Icon({ paths, ...props }: IconComponentProps) {
  return <IconFrame {...props}>{paths.map(drawNode)}</IconFrame>
}

import { Icon, type IconProps } from './Icon.tsx'
import { ICON_PATHS, type IconName } from './paths.ts'

export interface NamedIconProps extends IconProps {
  name: IconName
}

/**
 * Draws an icon picked by name, for data-driven lists such as the kit gallery.
 * This pulls in the whole set, so screens that know their icons should import `Icon<Name>` instead.
 */
export function NamedIcon({ name, ...props }: NamedIconProps) {
  return <Icon paths={ICON_PATHS[name]} {...props} />
}

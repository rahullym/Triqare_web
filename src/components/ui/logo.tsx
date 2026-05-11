import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'header'
  showText?: boolean
  textClassName?: string
  variant?: 'default' | 'footer'
}

const sizeClasses = {
  xs: 'h-8 w-8',
  sm: 'h-12 w-12',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
  xl: 'h-32 w-32',
  '2xl': 'h-40 w-40',
  '3xl': 'h-48 w-48',
  header: 'w-[140px] h-[90px]'
}

const textSizeClasses = {
  xs: 'text-sm',
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
  '2xl': 'text-4xl',
  '3xl': 'text-5xl',
  header: 'text-xl'
}

export function Logo({
  className,
  size = 'md',
  showText = false,
  textClassName,
  variant = 'default'
}: LogoProps) {
  const src = variant === 'footer' ? '/logo-footer.png' : '/logo.png'
  return (
    <div className={cn("flex items-center space-x-3", className)}>
      <img
        src={src}
        alt="Emergency Response Logo"
        className={cn("object-contain", sizeClasses[size])}
      />
      {showText && (
        <span className={cn(
          "font-semibold text-gray-900",
          textSizeClasses[size],
          textClassName
        )}>
          Emergency Response
        </span>
      )}
    </div>
  )
}

export default Logo

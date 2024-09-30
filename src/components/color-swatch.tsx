import React from "react"

interface ColorSwatchProps {
  color: string
  size?: 'small' | 'large'
  onClick?: () => void
  className?: string
}

export default function ColorSwatch({ color, size = 'small', onClick, className }: ColorSwatchProps) {
  const sizeClasses = size === 'large' 
    ? 'w-64 h-64 sm:w-80 sm:h-80' 
    : 'w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 lg:w-64 lg:h-64'
  
  return (
    <button
      className={`${sizeClasses} ${className} rounded-lg shadow-lg sm:transition-transform sm:hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
      style={{ backgroundColor: color }}
      onClick={onClick}
      aria-label={`Color: ${color}`}
    />
  )
}
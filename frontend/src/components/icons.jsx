export function PlayIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  )
}

export function PauseIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 2h4v12H3V2zm6 0h4v12H9V2z" />
    </svg>
  )
}

export function PreviousIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 2h2v12H3V2zm4 6l7-5v10L7 8z" />
    </svg>
  )
}

export function NextIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M11 2h2v12h-2V2zM2 3l7 5-7 5V3z" />
    </svg>
  )
}

export function VolumeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 5h3l4-3v12l-4-3H2V5zm10 1a4 4 0 010 4M11 3a7 7 0 010 10" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

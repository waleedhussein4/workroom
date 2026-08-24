'use client'

/** Avatars for everyone else currently in the document. */
export function PresenceStack({ peers }: { peers: { name: string; color: string }[] }) {
  if (peers.length === 0) return null

  const shown = peers.slice(0, 4)
  const overflow = peers.length - shown.length

  return (
    <div
      className="flex items-center -space-x-1.5"
      aria-label={`${peers.length} other people here`}
    >
      {shown.map((peer, index) => (
        <span
          key={`${peer.name}-${index}`}
          title={peer.name}
          style={{ backgroundColor: peer.color }}
          className="border-background text-2xs flex size-6 items-center justify-center rounded-full border-2 font-medium text-white"
        >
          {peer.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="border-background bg-muted text-muted-foreground text-2xs flex size-6 items-center justify-center rounded-full border-2 font-medium">
          +{overflow}
        </span>
      ) : null}
    </div>
  )
}

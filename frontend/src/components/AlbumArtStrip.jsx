export default function AlbumArtStrip({ albums, size = 40 }) {
  return (
    <div className="flex items-center gap-0 min-w-0 overflow-hidden">
      {albums.map((album) => (
        <div key={album.service_id} className="flex-shrink-0 -mr-1 first:ml-0" style={{ width: size, height: size }}>
          {album.image_url
            ? <img src={album.image_url} alt={album.name} width={size} height={size} className="rounded object-cover border border-border" style={{ width: size, height: size }} />
            : <div className="rounded bg-surface-2 border border-border" style={{ width: size, height: size }} aria-hidden="true" />
          }
        </div>
      ))}
    </div>
  )
}

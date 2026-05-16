export default function CollectionCard({ collection, albums, onOpen }) {
  const coverAlbum = collection.cover_album_id
    ? albums.find(a => a.service_id === collection.cover_album_id)
    : null

  const mosaicAlbums = albums.slice(0, 4)
  const isEmpty = albums.length === 0
  const showCover = !!coverAlbum

  return (
    <button
      type="button"
      data-testid="collection-card"
      onClick={() => onOpen(collection)}
      className="group flex flex-col text-left bg-bg-elevated border border-border rounded-md overflow-hidden cursor-pointer p-0 hover:bg-hover transition-colors duration-150"
    >
      <div className="aspect-square w-full bg-surface-2 relative">
        {isEmpty ? (
          <div
            data-testid="collection-card-placeholder"
            className="w-full h-full bg-surface-2"
            aria-hidden="true"
          />
        ) : showCover ? (
          coverAlbum.image_url ? (
            <img
              src={coverAlbum.image_url}
              alt={coverAlbum.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              data-testid="collection-card-placeholder"
              className="w-full h-full bg-surface-2"
              aria-hidden="true"
            />
          )
        ) : (
          <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
            {Array.from({ length: 4 }).map((_, i) => {
              const album = mosaicAlbums[i]
              if (!album) {
                return (
                  <div
                    key={i}
                    className="bg-surface-2"
                    aria-hidden="true"
                  />
                )
              }
              return album.image_url ? (
                <img
                  key={album.service_id}
                  src={album.image_url}
                  alt={album.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  key={album.service_id}
                  className="bg-surface-2"
                  aria-hidden="true"
                />
              )
            })}
          </div>
        )}
      </div>
      <div className="px-2 py-2">
        <div className="text-sm font-medium text-text group-hover:text-text-hover truncate">
          {collection.name}
        </div>
      </div>
    </button>
  )
}

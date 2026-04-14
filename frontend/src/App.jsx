import { useEffect, useState } from 'react'
import AlbumTable from './components/AlbumTable'

const API = 'http://127.0.0.1:8000'

export default function App() {
  const [albums, setAlbums] = useState([])
  const [metadata, setMetadata] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API}/auth/status`)
      .then(r => r.json())
      .then(({ authenticated }) => {
        if (!authenticated) {
          window.location.href = `${API}/auth/login`
          return
        }
        return Promise.all([
          fetch(`${API}/library/albums`).then(r => r.json()),
          fetch(`${API}/metadata/all`).then(r => r.json()),
        ]).then(([libraryData, metadataData]) => {
          setAlbums(libraryData.albums)
          setMetadata(metadataData)
        })
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleTierChange(spotifyId, tier) {
    const url = `${API}/metadata/${spotifyId}/tier`
    if (tier) {
      await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier }) })
    } else {
      await fetch(url, { method: 'DELETE' })
    }
    setMetadata(prev => ({ ...prev, [spotifyId]: { ...prev[spotifyId], tier } }))
  }

  if (error) return <p>Error: {error}</p>

  return (
    <div style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
      <h1>Library ({albums.length})</h1>
      <AlbumTable albums={albums} metadata={metadata} loading={loading} onTierChange={handleTierChange} />
    </div>
  )
}

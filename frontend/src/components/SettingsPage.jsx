import { useState } from 'react'
import supabase from '../supabaseClient'
import { apiFetch } from '../api'

function getInstallInstructions() {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) {
    return 'In Safari, tap the Share button then "Add to Home Screen".'
  }
  if (/Android/.test(ua)) {
    return 'Tap the browser menu (three dots) and select "Add to Home Screen" or "Install App".'
  }
  if (/Chrome/.test(ua)) {
    return 'Click the install icon in your browser\'s address bar.'
  }
  if (/Firefox/.test(ua)) {
    return 'Firefox doesn\'t support PWA install yet. Try opening this page in Chrome or Edge.'
  }
  return 'Look for an "Install" or "Add to Home Screen" option in your browser\'s menu.'
}

export default function SettingsPage({ onLogout, session }) {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [exportError, setExportError] = useState('')

  async function handleExport() {
    setExportLoading(true)
    setExportError('')
    try {
      const res = await apiFetch('/export', {}, session)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bummer-export.zip'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setExportError('Export failed. Please try again.')
    } finally {
      setExportLoading(false)
    }
  }

  async function handleDeleteConfirm() {
    setDeleting(true)
    setDeleteError('')
    try {
      const res = await apiFetch('/auth/account', { method: 'DELETE' }, session)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail ?? 'Failed to delete account')
      }
      localStorage.clear()
      await supabase.auth.signOut()
      window.location.assign('/')
    } catch (err) {
      setDeleteError(err.message)
      setDeleting(false)
    }
  }

  function closeDeleteModal() {
    setDeleteModalOpen(false)
    setConfirmText('')
    setDeleteError('')
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider">Install App</h2>
          <p className="text-sm text-text">
            Bummer works best as an installed app. {getInstallInstructions()}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider">Feedback</h2>
          <a
            href="https://github.com/toofanian/bummer/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-text bg-surface-2 border border-border rounded-lg px-4 py-3 no-underline hover:bg-hover transition-colors duration-150"
          >
            Send Feedback
          </a>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider">Export</h2>
          <p className="text-sm text-text-dim">
            Download your library and collections as CSV and JSON.
          </p>
          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="text-left text-sm text-text bg-surface-2 border border-border rounded-lg px-4 py-3 cursor-pointer hover:bg-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportLoading ? 'Downloading\u2026' : 'Download Export'}
          </button>
          {exportError && <p className="text-red-400 text-sm">{exportError}</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider">Account</h2>
          <button
            onClick={onLogout}
            className="text-left text-sm text-text bg-surface-2 border border-border rounded-lg px-4 py-3 cursor-pointer hover:bg-hover transition-colors duration-150"
          >
            Log Out
          </button>
          <button
            onClick={() => setDeleteModalOpen(true)}
            className="text-left text-sm text-red-400 bg-surface-2 border border-border rounded-lg px-4 py-3 cursor-pointer hover:bg-hover transition-colors duration-150"
          >
            Delete account
          </button>
        </section>
      </div>

      {deleteModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeDeleteModal() }}
        >
          <div className="bg-surface border border-border rounded-lg p-6 max-w-md w-full flex flex-col gap-4">
            <h2 className="text-lg font-bold text-text">Delete account?</h2>
            <p className="text-sm text-text-dim">
              This will permanently delete your Bummer account and all associated data —
              your Spotify tokens, collections, tags, ratings, play history, and library
              snapshots. This cannot be undone.
            </p>
            <p className="text-sm text-text-dim">
              Type <span className="font-mono text-text">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className="bg-gray-800 rounded-lg px-3 py-2 text-white border border-gray-700 focus:outline-none focus:border-white font-mono text-sm"
              autoFocus
            />
            {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeDeleteModal}
                disabled={deleting}
                className="px-4 py-2 text-sm text-text bg-transparent border border-border rounded hover:bg-hover transition-colors duration-150 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={confirmText !== 'DELETE' || deleting}
                className="px-4 py-2 text-sm text-white bg-red-600 border-none rounded hover:bg-red-500 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting\u2026' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

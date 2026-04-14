import { useState, useEffect, useRef } from 'react'
import supabase from '../supabaseClient'
import { apiFetch } from '../api'

export default function SettingsMenu({ onLogout, session }) {
  const [open, setOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

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
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Settings"
        className="bg-transparent border-none text-text-dim p-1.5 cursor-pointer hover:text-text transition-colors duration-150"
        title="Settings"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded shadow-lg z-50 min-w-[160px]">
          <a
            href="mailto:steels_tastier_8r@icloud.com?subject=Bummer%20Feedback&body=Hey%20Alex%2C%0A%0A"
            className="block px-4 py-2 text-sm text-text hover:bg-hover transition-colors duration-150 no-underline"
          >
            Send Feedback
          </a>
          <button
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className="w-full text-left px-4 py-2 text-sm text-text bg-transparent border-none cursor-pointer hover:bg-hover transition-colors duration-150"
          >
            Log Out
          </button>
          <button
            onClick={() => {
              setOpen(false)
              setDeleteModalOpen(true)
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-400 bg-transparent border-none cursor-pointer hover:bg-hover transition-colors duration-150"
          >
            Delete account
          </button>
        </div>
      )}

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
                {deleting ? 'Deleting…' : 'Permanently delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

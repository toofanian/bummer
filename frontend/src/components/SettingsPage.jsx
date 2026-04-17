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

export default function SettingsPage({ onLogout, session, onBack }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Back"
            className="bg-transparent border-none text-text-dim p-1.5 cursor-pointer hover:text-text transition-colors duration-150"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-text">Settings</h1>
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wider">Install App</h2>
          <p className="text-sm text-text">
            Bummer works best as an installed app. {getInstallInstructions()}
          </p>
        </section>
      </div>
    </div>
  )
}

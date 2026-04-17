import { useState } from 'react'
import supabase from '../supabaseClient'
import { apiFetch } from '../api'

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
      </div>
    </div>
  )
}

import '@testing-library/jest-dom'

// jsdom does not implement matchMedia — stub it so useIsMobile doesn't crash.
// Returns matches: false (desktop) by default; individual tests can override.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})

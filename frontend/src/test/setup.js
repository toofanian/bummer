import '@testing-library/jest-dom'

// jsdom does not implement ResizeObserver — stub it.
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom does not implement IntersectionObserver — stub it.
globalThis.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom does not implement Element.prototype.scrollIntoView — stub it.
// cmdk (used by shadcn Command) calls this on highlighted items.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

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

// Node.js 25 ships a built-in `localStorage` that requires --localstorage-file
// to function. When running under Vitest/jsdom without that flag, accessing the
// global `localStorage` hits Node's stub (which has no working methods) instead
// of jsdom's implementation. Override the global with a simple in-memory
// implementation so tests can call setItem/getItem/removeItem without errors.
;(() => {
  const store = new Map()
  const impl = {
    setItem(key, value) { store.set(String(key), String(value)) },
    getItem(key) { return store.has(String(key)) ? store.get(String(key)) : null },
    removeItem(key) { store.delete(String(key)) },
    clear() { store.clear() },
    key(index) { return [...store.keys()][index] ?? null },
    get length() { return store.size },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    get() { return impl },
  })
})()

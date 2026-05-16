// Repo-root Vitest config so `vitest --run` works regardless of cwd.
//
// Background: `npx --prefix frontend vitest --run` only changes where npx
// resolves the binary; it does NOT change cwd. With cwd at the repo root,
// Vitest cannot find `frontend/vite.config.js`, so `@vitejs/plugin-react`
// never loads and every test file fails with "ReferenceError: React is not
// defined". The standard invocation `npm --prefix frontend test -- --run`
// works because npm changes cwd to the package dir before running scripts.
//
// We chdir into `frontend/` so transitive `vite/internal` imports inside the
// React plugin resolve against `frontend/node_modules/`, then load the React
// plugin and define the test environment inline. We don't reuse
// `frontend/vite.config.js` directly because it relies on esbuild-injected
// `__dirname`, which isn't available when the file is loaded via dynamic
// import in the parent ESM scope.
import { fileURLToPath } from 'node:url'
import { chdir } from 'node:process'
import { resolve } from 'node:path'

const frontendDir = fileURLToPath(new URL('./frontend/', import.meta.url))
chdir(frontendDir)

export default async () => {
  const { default: react } = await import(
    new URL('./frontend/node_modules/@vitejs/plugin-react/dist/index.js', import.meta.url).href
  )
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(frontendDir, 'src'),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'
      ),
    },
    root: frontendDir,
    test: {
      environment: 'jsdom',
      environmentOptions: {
        jsdom: { url: 'http://localhost' },
      },
      setupFiles: [resolve(frontendDir, 'src/test/setup.js')],
      globals: true,
      exclude: ['**/node_modules/**', '**/e2e/**'],
    },
  }
}

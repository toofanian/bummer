import { Splide, SplideSlide } from '@splidejs/react-splide'
import '@splidejs/splide/css/core'

const screenshots = [
  { src: '/screenshots/home.png', alt: 'Home' },
  { src: '/screenshots/library.png', alt: 'Library' },
  { src: '/screenshots/collections.png', alt: 'Collections' },
  { src: '/screenshots/digest.png', alt: 'Digest' },
]

export default function LandingPage() {
  return (
    <main className="h-screen flex flex-col items-center justify-center px-6 py-6">
      <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-2 text-center">
        The Death of Shuffle
      </h1>
      <p className="text-base md:text-lg text-text-dim mb-4 text-center">
        An album-first music interface, for a more intentional experience.
      </p>

      <div className="w-full max-w-3xl mb-4">
        <Splide
          options={{
            type: 'loop',
            autoplay: true,
            interval: 5000,
            pauseOnHover: true,
            pagination: true,
            arrows: false,
            drag: true,
          }}
          aria-label="Feature screenshots"
        >
          {screenshots.map((s) => (
            <SplideSlide key={s.alt}>
              <img
                src={s.src}
                alt={s.alt}
                className="w-full max-h-[50vh] object-contain mx-auto rounded-lg"
              />
            </SplideSlide>
          ))}
        </Splide>
      </div>

      <a
        href="https://app.thedeathofshuffle.com"
        className="inline-block bg-surface-2 border border-border text-text font-semibold text-lg px-8 py-2 rounded-lg hover:border-accent transition-colors mb-4"
      >
        Bummer
      </a>

      <footer className="text-center text-text-dim text-sm">
        <p className="mb-2">Feedback welcome through GitHub.</p>
        <a
          href="https://github.com/toofanian/bummer"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="inline-block text-text-dim hover:text-text transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </footer>
    </main>
  )
}

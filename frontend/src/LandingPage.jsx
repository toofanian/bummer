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
    <main className="landing-page h-screen flex flex-col px-6 py-8 md:py-10 overflow-hidden relative">
      {/* Noise overlay */}
      <div className="landing-noise" aria-hidden="true" />

      {/* Top section — heading + subheading, positioned above center */}
      <div className="flex-1 flex flex-col justify-end pb-4 md:pb-6 relative z-10">
        <h1 className="landing-heading text-center">
          THE DEATH OF SHUFFLE
        </h1>
        <p className="landing-subheading text-center mt-2 md:mt-3">
          An album-first music interface, for a more intentional experience.
        </p>
      </div>

      {/* Divider */}
      <div className="landing-divider relative z-10" />

      {/* Carousel — the hero */}
      <div className="flex-[2] flex items-start justify-center pt-4 md:pt-6 relative z-10">
        <div className="w-full max-w-md md:max-w-lg">
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
                <div className="landing-screenshot-wrapper">
                  <img
                    src={s.src}
                    alt={s.alt}
                    className="landing-screenshot"
                  />
                </div>
              </SplideSlide>
            ))}
          </Splide>
        </div>
      </div>

      {/* Bottom — CTA + footer */}
      <div className="flex flex-col items-center gap-3 pb-2 relative z-10">
        <a
          href="https://app.thedeathofshuffle.com"
          className="landing-cta"
        >
          Bummer
        </a>

        <footer className="text-center">
          <p className="text-text-dim text-xs tracking-wide mb-1.5">
            Feedback welcome through GitHub.
          </p>
          <a
            href="https://github.com/toofanian/bummer"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="inline-block text-text-dim hover:text-text transition-colors duration-200"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </footer>
      </div>
    </main>
  )
}

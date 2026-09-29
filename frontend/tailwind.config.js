/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#061d15',
        foreground: '#f0fdf4',
        card: {
          DEFAULT: '#0a2e21',
          foreground: '#f0fdf4',
        },
        popover: {
          DEFAULT: '#0a2e21',
          foreground: '#f0fdf4',
        },
        primary: {
          DEFAULT: '#10b981',
          hover: '#34d399',
          foreground: '#061d15',
        },
        secondary: {
          DEFAULT: '#0e3d2c',
          foreground: '#d1fae5',
        },
        muted: {
          DEFAULT: '#072118',
          foreground: '#a7d0bf',
        },
        accent: {
          DEFAULT: '#124735',
          foreground: '#f0fdf4',
        },
        border: '#1e6045',
        ring: '#34d399',
        surface: '#0a2e21',
        'surface-elevated': '#0e3d2c',
        emerald: {
          deep: '#0b3b2a',
          pine: '#14573f',
          moss: '#082d22',
          light: '#d1fae5',
          mint: '#6ee7b7',
        },
        aqi: {
          good: '#22c55e',
          satisfactory: '#84cc16',
          moderate: '#eab308',
          poor: '#f97316',
          verypoor: '#ef4444',
          severe: '#be123c',
        },
      },
      fontFamily: {
        vaayu: ['"Newsreader"', '"Playfair Display"', 'Georgia', 'serif'],
        aeris: ['"Newsreader"', '"Playfair Display"', 'Georgia', 'serif'],
        danfo: ['"Newsreader"', '"Playfair Display"', 'Georgia', 'serif'],
        serif: ['"Newsreader"', '"Playfair Display"', 'Georgia', 'serif'],
        heading: ['"Archivo Black"', '"Plus Jakarta Sans"', 'sans-serif'],
        subheading: ['"Archivo Black"', '"Plus Jakarta Sans"', 'sans-serif'],
        title: ['"Limelight"', 'cursive', 'serif'],
        limelight: ['"Limelight"', 'cursive', 'serif'],
        righteous: ['"Archivo Black"', 'sans-serif'],
        archivo: ['"Archivo Black"', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        lato: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        numbers: ['"Archivo Black"', '"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        vt323: ['"VT323"', 'monospace'],
        ai: ['"VT323"', 'monospace'],
      }
    },
  },
  plugins: [],
}

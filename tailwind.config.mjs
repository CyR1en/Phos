/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          dark: '#0a0a0a',
        },
        muted: {
          DEFAULT: '#f5f5f5',
          dark: '#1a1a1a',
        },
        ink: {
          DEFAULT: '#1a1a1a',
          dark: '#f0f0f0',
        },
        subtle: {
          DEFAULT: '#737373',
          dark: '#a3a3a3',
        },
        border: {
          DEFAULT: '#e5e5e5',
          dark: '#2a2a2a',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}

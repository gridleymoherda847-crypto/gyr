/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'os-glass': 'rgba(255,255,255,0.12)',
      },
      boxShadow: {
        glass: '0 10px 30px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
}


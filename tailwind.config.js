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
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        giftFloat: {
          '0%': { opacity: '0', transform: 'translateY(20px) scale(0.8)' },
          '20%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '80%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-30px) scale(0.6)' },
        },
        giftFullscreen: {
          '0%': { opacity: '0', transform: 'scale(0.3)' },
          '30%': { opacity: '1', transform: 'scale(1.2)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
          '80%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.5)' },
        },
        heartFloat: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '50%': { opacity: '0.8', transform: 'translateY(-80px) scale(1.1)' },
          '100%': { opacity: '0', transform: 'translateY(-160px) scale(0.6)' },
        },
      },
      animation: {
        fadeInUp: 'fadeInUp 0.3s ease-out',
        slideUp: 'slideUp 0.3s ease-out',
        giftFloat: 'giftFloat 2.5s ease-out forwards',
        giftFullscreen: 'giftFullscreen 3s ease-out forwards',
        heartFloat: 'heartFloat 2s ease-out forwards',
      },
    },
  },
  plugins: [],
}


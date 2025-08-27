/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Jacksons Purple palette
        primary: {
          50: '#E7F1FF',  // Lightest shade
          100: '#D3E5FF',
          200: '#BCCFFF',
          300: '#93ACFF',
          400: '#4F78FF',
          500: '#2743FF',
          600: '#0135FF',
          700: '#0018FF',
          800: '#0012A4',
          900: '#0A0B8B',
          950: '#07083F'   // Darkest shade
        },
        // Neutral colors for dark/light themes
        light: {
          bg: '#FFFFFF',
          card: '#F8FAFC',
          border: '#E2E8F0',
          text: '#1E293B'
        },
        dark: {
          bg: '#0F172A',
          card: '#1E293B',
          border: '#334155',
          text: '#F8FAFC'
        }
      },
      // Add blue shades for UI elements
      backgroundColor: {
        'blue-light': '#E7F1FF',
        'blue-medium': '#93ACFF',
        'blue-dark': '#0135FF'
      }
    },
  },
  plugins: [],
};

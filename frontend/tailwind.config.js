/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        theme: {
          sidebar: '#2B2353',
          sidebarActive: '#3A3266',
          bg: '#F3F4F6', // main content background
          card: '#FFFFFF',
          textMain: '#1F2937',
          textMuted: '#6B7280',
          border: '#E5E7EB',
          primary: '#10B981', // The mint green
          primaryHover: '#059669',
          danger: '#EF4444',
          dangerBg: '#FEE2E2',
        }
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}

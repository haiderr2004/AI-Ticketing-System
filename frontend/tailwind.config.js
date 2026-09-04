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
          sidebar: '#0F172A',
          sidebarActive: '#1E293B',
          bg: '#F8FAFC', // MissionControl-aligned workspace background
          card: '#FFFFFF',
          textMain: '#1F2937',
          textMuted: '#6B7280',
          border: '#E5E7EB',
          primary: '#4F46E5',
          primaryHover: '#4338CA',
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

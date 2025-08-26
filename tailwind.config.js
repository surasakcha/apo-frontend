/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}'
  ],
  safelist: [
    'bg-red-100', 'text-red-700',
    'bg-purple-100', 'text-purple-700',
    'bg-emerald-100', 'text-emerald-700',
    'bg-slate-100', 'text-slate-700',
    'bg-blue-100', 'text-blue-700', 'bg-amber-100', 'text-amber-700'
  ],
  theme: { extend: {} },
  plugins: []
}

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Supabase url and anon key live in the repo root .env, next to the agent's settings.
// On Vercel they come from the project's environment variables instead.
// Only VITE_ names reach the page. No login is ever built into it: the person signs in on the page.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
});

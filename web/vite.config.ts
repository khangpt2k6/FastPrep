import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Supabase keys live in the repo root .env, next to the agent's settings.
// On Vercel they come from the project's environment variables instead.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
});

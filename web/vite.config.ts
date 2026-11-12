import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The Supabase keys and the agent's login live in the repo root .env, next to the agent's settings.
// On Vercel they come from the project's environment variables instead.
// The page signs in by itself as that one account: this is a one-person tool, so there is no sign-in screen.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  // The login ends up in the page's script, so a deployed page must be closed to strangers: middleware.ts lets in only
  // a browser that came through the private link, and it needs ACCESS_KEY for that. No key, no deploy.
  if (env.VERCEL && !env.ACCESS_KEY) {
    throw new Error('ACCESS_KEY is not set: the deployed page would be open to anyone. Set it in the Vercel project.');
  }
  return {
    plugins: [react()],
    envDir: '..',
    define: {
      __AGENT_EMAIL__: JSON.stringify(env.AGENT_EMAIL ?? ''),
      __AGENT_PASSWORD__: JSON.stringify(env.AGENT_PASSWORD ?? ''),
    },
  };
});

import { defineConfig } from 'vite';

export default defineConfig({
  // Simulation tests run seconds of physics, so give them room.
  test: { testTimeout: 30000 },
});

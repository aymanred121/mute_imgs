import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'Mute Similar X Images',
    description: 'Mute similar X/Twitter images with Gemini embeddings.',
    permissions: ['contextMenus', 'storage'],
    host_permissions: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://pbs.twimg.com/*',
      'https://generativelanguage.googleapis.com/*',
    ],
    action: {
      default_title: 'Mute Similar X Images',
    },
  },
});

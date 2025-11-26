import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			// Output directory for built app
			out: 'build',
			// Precompress responses
			precompress: false,
			// Environment variable for the server
			envPrefix: ''
		}),
		alias: {
			$lib: './src/lib'
		},
		prerender: {
			entries: []
		}
	}
};

export default config;


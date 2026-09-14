const esbuild = require("esbuild");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const isWebview = process.argv.includes('--webview');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			isWebview
				? 'src/webview/webview.ts'
				: 'src/extension.ts'
		],
		bundle: true,
		format: isWebview ? 'iife' : 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: isWebview ? 'browser' : 'node',
		outfile: isWebview
			? 'dist/webview/webview.js'
			: 'dist/extension.js',
		external: isWebview ? [] : ['vscode'],
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const dist = path.resolve(__dirname, "dist");
const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin");

const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const appConfig = {
	entry: "./app/main.mjs",
	devtool: "cheap-source-map",
	mode: 'development',
	devServer: {
		static: {
			directory: dist
		},
		headers: {
			"Cross-Origin-Opener-Policy": "same-origin",
			"Cross-Origin-Embedder-Policy": "require-corp",
		},
	},
	plugins: [
		new HtmlWebpackPlugin({
			template: "index.html",
			inject: "head",
			scriptLoading: "defer",
		}),
		new MiniCssExtractPlugin(),
	],
	experiments: {
		topLevelAwait: true,
		asyncWebAssembly: true
	},
	resolve: {
		extensions: [".js", ".mjs"]
	},
	output: {
		path: dist,
		filename: "app.js"
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				use: [
					MiniCssExtractPlugin.loader,
					'css-loader'
				]
			},{
				//note: untested, no svgs yet.
				test: /\.svg$/,
				use: 'file-loader'
			}
		]
	}
};

const logicWorkerConfig = {
	entry: "./worker/logicWorker.mjs",
	target: "webworker",
	devtool: "cheap-source-map",
	mode: 'development',
	plugins: [
		new WasmPackPlugin({
			crateDirectory: path.resolve(__dirname, "../crate-wasm")
		})
	],
	resolve: {
		extensions: [".js", ".wasm"]
	},
	output: {
		path: dist,
		filename: "logicWorker.mjs"
	},
	experiments: {
		topLevelAwait: true,
		asyncWebAssembly: true
	}
};

const renderWorkerConfig = {
	entry: "./worker/renderWorker.mjs",
	target: "webworker",
	devtool: "cheap-source-map",
	mode: 'development',
	plugins: [
		new WasmPackPlugin({
			crateDirectory: path.resolve(__dirname, "../crate-wasm")
		})
	],
	resolve: {
		extensions: [".js", ".wasm"]
	},
	output: {
		path: dist,
		filename: "renderWorker.mjs"
	},
	experiments: {
		topLevelAwait: true,
		asyncWebAssembly: true
	}
};

module.exports = [appConfig, logicWorkerConfig, renderWorkerConfig];

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const dist = path.resolve(__dirname, "dist");
const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin");

const appConfig = {
  entry: "./app/main.mjs",
  devtool: "cheap-source-map",
  devServer: {
    contentBase: dist
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "index.html",
      inject: "head",
      scriptLoading: "defer",
    })
  ],
  resolve: {
    extensions: [".js", ".mjs"]
  },
  output: {
    path: dist,
    filename: "app.js"
  }
};

const workerConfig = {
  entry: "./worker/worker.js",
  target: "webworker",
  devtool: "cheap-source-map",
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
    filename: "worker.js"
  },
  experiments: {
    //[DDR 2020-11-20] asyncWebAssembly is broken by webpack 5.
    //(See https://github.com/rustwasm/wasm-bindgen/issues/2343)
    syncWebAssembly: true
  }
};

module.exports = [appConfig, workerConfig];

#!/bin/bash
#Compiles our .rs to .wasm, for our web workers to load.

set -eo pipefail

if [[ $1 == *help ]]; then
	echo "$0 [help|init|uninit]"
	echo "If no option is specified, $0 will compile the rust code to the wasm compiled by the browser. If entr is installed, it will use it to watch for changes and recompile."
	echo "If init is specified, the Rust standard library will be built with the options required by $(basename $(dirname $PWD)). Your Rust version will be set to 'nightly'."
	echo "Uninit sets your Rust version back to the default. If you were using beta, you'll have to set it again with \`rustup override beta\`."
	echo "All commands may be preceded by 0 to 2 dashes."
	exit 0
fi

if [[ $1 == *uninit ]]; then
	rustup override unset
	exit 0
elif [[ $1 == *init ]]; then
	rustup toolchain install nightly
	rustup override set nightly
	rustup component add rust-src --toolchain nightly
	exit 0
fi

if command -v entr > /dev/null
then
	echo Watching *.rs for changes.
	echo *.rs | entr -ccs "
		cargo build --target=wasm32-unknown-unknown -Zbuild-std
		cp target/wasm32-unknown-unknown/debug/stardust-worker.wasm sim.wasm
	"
else
	cargo build --target=wasm32-unknown-unknown -Zbuild-std
fi
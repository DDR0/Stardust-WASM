#!/bin/sh
#Compiles our .rs to .wasm, for our web workers to load.

echo compiling *.rs

if command -v entr
then
	echo *.rs | entr -s 'rustc --target=wasm32-unknown-unknown sim.rs'
else
	rustc --target=wasm32-unknown-unknown -Ctarget-feature=+atomics,+bulk-memory sim.rs && echo done
fi
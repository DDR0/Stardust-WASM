rm -r crate-wasm/pkg target/*
cd www; npm install; cd ../
cargo build
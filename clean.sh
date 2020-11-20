rm -r crate-wasm/pkg target/*
cargo build &

cd www
	rm package-lock.json
	npm install &
cd ../

wait
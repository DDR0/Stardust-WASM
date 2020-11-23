use wasm_bindgen::prelude::*;
use web_sys::console;

mod utils;

#[wasm_bindgen]
pub fn init() {
    utils::init();
    console::log_1(&"Hello from WebAssembly!".into());
}

#[wasm_bindgen]
pub fn hello(name: String) -> String {
    "Hello ".to_owned() + &name + &".".to_owned()
}

#[wasm_bindgen]
pub fn optimize_graph(buffer: &mut [u8]) {
	buffer[0] = 10;
    console::log_1(&"Hello from og!".into());
}
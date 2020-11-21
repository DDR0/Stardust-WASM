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

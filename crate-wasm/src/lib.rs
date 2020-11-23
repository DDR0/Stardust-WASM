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
pub fn optimize_graph(
    //Nodes
    x: &mut [f32],
    _y: &mut [f32],
    _flags: &mut [u8],
    _links: &mut [u16],
    _num_links: &mut [u8],
    _node_count: &mut [u16],

    //Links
    _from: &mut [u16],
    _to: &mut [u16],
    _lflags: &mut [u8],
    _link_count: &mut [u16],
) {
    x[0] = -50.0;
}

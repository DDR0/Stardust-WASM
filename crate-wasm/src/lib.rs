//#![no_std]
use std::rc::Rc;
use wasm_bindgen::prelude::*;
// WARNING: Use of `random()` in `js_sys::Math;` silently breaks `import("../../crate-wasm/pkg/index.js")`.

mod utils;
//mod rand;
mod particles;

//use rand::Rand;
use particles::particle_data::{new_particle_data};
use particles::{hydrate_with_data, Processable};





#[wasm_bindgen]
pub fn init() { utils::init() }

#[wasm_bindgen]
pub fn hello() -> f32 {
	return 42.0;
}

#[wasm_bindgen]
pub fn process_particle(world: JsValue, thread_id: i32, x: i32, y: i32) -> f64 {
	match 
		new_particle_data(Rc::new(world), thread_id, x, y)
			.and_then(|p| hydrate_with_data(p).run())
	{
		Ok(()) => 1.0, //Object has advanced state, been processed.
		Err(()) => 0.0, //Object may have encountered an error or just not run; we don't care.
	}
}

//console::log_1(&format!("dbg: {:}→{:} {:?}", i,j, &NODE_FORCES[i_]).into());
//#![no_std]
use wasm_bindgen::prelude::*;

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
pub fn process_particle(world: &JsValue, thread_id: i32, x: i32, y: i32) -> f64 {
	match new_particle_data(world, thread_id, x, y) {
		Ok(p) => {
			match hydrate_with_data(p).run() {
				Ok(()) => 1.0,
				Err(()) => 0.0, //Object couldn't or didn't run, perhaps due to another lock.
			}
		}
		Err(()) => 0.0, //Object was locked; can't process it now.
	}
}

//console::log_1(&format!("dbg: {:}→{:} {:?}", i,j, &NODE_FORCES[i_]).into());
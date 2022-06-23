//#![no_std]
use wasm_bindgen::prelude::*;

mod utils;
//mod rand;
mod particles;

//use rand::Rand;
use particles::particle_data::{new_particle_data};
use particles::{hydrate_with_data, Processable, PARTICLE_NO_PROCESS};





#[wasm_bindgen]
pub fn init() { utils::init() }

#[wasm_bindgen]
pub fn hello() -> f32 {
	return 42.0;
}

#[wasm_bindgen]
pub fn process_particle(world: &JsValue, thread_id: i32, x: i32, y: i32) -> f64 {
	match new_particle_data(world, thread_id, x, y) {
		Some(p) => {
			return hydrate_with_data(p).run();
		}
		None => PARTICLE_NO_PROCESS, //Object was locked; can't process it now.
	}
}

//console::log_1(&format!("dbg: {:}→{:} {:?}", i,j, &NODE_FORCES[i_]).into());
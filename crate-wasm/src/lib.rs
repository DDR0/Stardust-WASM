//#![no_std]
use wasm_bindgen::prelude::*;

mod utils;
//mod rand;
mod particle_data;

//use rand::Rand;
use particle_data::{new_particle, ParticleData};





#[wasm_bindgen]
pub fn init() { utils::init() }

#[wasm_bindgen]
pub fn hello() -> f32 {
	return 42.0;
}

#[wasm_bindgen]
pub fn process_particle(world: &JsValue, thread_id: i32, x: i32, y: i32) -> f64 {
	const PARTICLE_PROCESSED: f64 = 1.0;
	const PARTICLE_UNCHANGED: f64 = 0.0;
	
	//console::log_1(&"Hello 1".into());
	
	match new_particle(world, thread_id, x, y) {
		Some(p) => {
			p.type_id();
			return PARTICLE_UNCHANGED;
		}
		None => {
			//Object was locked; can't process it now.
			return PARTICLE_UNCHANGED;
		}
	}
	
	//let mut rng = Rand::new(5);
	//rng.float();
}

//console::log_1(&format!("dbg: {:}→{:} {:?}", i,j, &NODE_FORCES[i_]).into());
//#![no_std]
use js_sys::DataView;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
// WARNING: Use of `random()` in `js_sys::Math;` silently breaks `import("../../crate-wasm/pkg/index.js")`.
use web_sys::console;

mod utils;
//mod rand;
mod particles;

//use rand::Rand;
use particles::particle_data::{new_particle_data};
use particles::{hydrate_with_data, reset_to_type as reset, Processable};





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

#[wasm_bindgen]
pub fn reset_to_type(world: JsValue, thread_id: i32, x: i32, y: i32, new_type: u8) -> f64 {
	//console::log_1(&format!("start reset particle to {}.", new_type).into());
	match 
		new_particle_data(Rc::new(world), thread_id, x, y)
			.and_then(|p| {
				reset(p, new_type);
				Ok(())
			})
	{
		Ok(()) => 1.0, //Object has advanced state, been processed.
		Err(()) => 0.0, //Object may have encountered an error or just not run; we don't care.
	}
}

//console::log_1(&format!("dbg: {:}→{:} {:?}", i,j, &NODE_FORCES[i_]).into());



#[wasm_bindgen]
pub fn render_particle(world: JsValue, pixel_buffer: DataView, thread_id: i32, x: i32, y: i32, width: i32, _height: i32) -> f64 {
	//console::log_1(&format!("start reset particle to {}.", new_type).into());
	match 
		new_particle_data(Rc::new(world), thread_id, x, y)
			.and_then(|p| {
				pixel_buffer.set_uint32_endian(
					4*(x as usize + y as usize * width as usize), 
					hydrate_with_data(p).render(), 
					false
				);
				Ok(())
			})
	{
		Ok(()) => 1.0, //Object has advanced state, been processed.
		Err(()) => 0.0, //Object may have encountered an error or just not run; we don't care.
	}
}
/// A particle in the simulation.
///
/// The reason this exists is so that we can automatically lock particles
/// upon acquisition, and release that lock when the particle is destructed.
/// We really want to do this in a somewhat automatic manner, especially
/// as we will need to acquire and release more than one particle for most
/// particles - anything that moves must lock the position it's moving to,
/// for example. It also provides a type-safe wrapper for the locked
/// particle attributes, and ensures you can't access them without locking
/// the particle they're for as well.

use crate::JsValue;
use js_sys::{Reflect, Atomics};

fn gets(obj: &JsValue, key: &str) -> JsValue {
	Reflect::get(obj, &JsValue::from_str(key)).expect("key not found")
}

fn getf(obj: &JsValue, key: f64) -> JsValue {
	Reflect::get(obj, &JsValue::from_f64(key)).expect("key not found")
}

#[derive(Debug)]
pub struct Particle<'w> {
	world: &'w JsValue,
	thread_id: i32,
	x: i32, //position from top-left
	y: i32,
	w: i32, //w/h of play field, used for dereferencing
	h: i32,
}

impl<'w> Particle<'w> {
	pub fn new(world: &JsValue, thread_id: i32, x: i32, y: i32) -> Option<Particle> {
		let world_bounds = &gets(world, "bounds");
		let w = getf(&gets(world_bounds, "x"), 0.0)
			.as_f64().expect("world.bounds.y not found") as i32;
		let h = getf(&gets(world_bounds, "y"), 0.0)
			.as_f64().expect("world.bounds.y not found") as i32;
		
		let p = Particle {
			world, thread_id,
			x,y,w,h,
		};
		
		match
			Atomics::compare_exchange(
				&gets(&gets(world, "particles"), "lock"),
				p.index(),
				0,
				thread_id,
			).expect(&format!("Locking mechanism failed (vs obtaining the lock failing) at {},{}.", x,y).as_str())
			
		{
			0 => { Some(p) }
			_ => { None }
		}
	}
	
	pub fn x(&self) -> i32 { self.x }
	pub fn y(&self) -> i32 { self.y }
	pub fn w(&self) -> i32 { self.y }
	pub fn h(&self) -> i32 { self.y }
	pub fn index(&self) -> u32 { (self.x+self.y*self.w) as u32 }
	
	pub fn replace(&mut self, dest: &mut Particle) {
		todo!()
	}
	pub fn swap(&mut self, dest: &mut Particle) {
		todo!()
	}
	
	//World data accessors:
	
	pub fn get_type(&self) -> u8 {
		getf(&gets(&gets(self.world, "particles"), "type"), self.index() as f64)
			.as_f64().expect(&format!("particles.type[{},{}] not found", self.x, self.y).as_str()) as u8
	}
	
	pub fn get_stage(&self) -> u8 {
		getf(&gets(&gets(self.world, "particles"), "stage"), self.index() as f64)
			.as_f64().expect(&format!("particles.stage[{},{}] not found", self.x, self.y).as_str()) as u8
	}
	
	pub fn get_initiative(&self) -> f32 {
		getf(&gets(&gets(self.world, "particles"), "initiative"), self.index() as f64)
			.as_f64().expect(&format!("particles.initiative[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	
	pub fn get_rgba(&self) -> u32 {
		getf(&gets(&gets(self.world, "particles"), "rgba"), self.index() as f64)
			.as_f64().expect(&format!("particles.rgba[{},{}] not found", self.x, self.y).as_str()) as u32
	}
	
	pub fn get_velocity_x(&self) -> f32 {
		getf(&gets(&gets(&gets(self.world, "particles"), "velocity"), "x"), self.index() as f64)
			.as_f64().expect(&format!("particles.velocity.x[{},{}] not found", self.x, self.y).as_str()) as f32
	}

	pub fn get_velocity_y(&self) -> f32 {
		getf(&gets(&gets(&gets(self.world, "particles"), "velocity"), "y"), self.index() as f64)
			.as_f64().expect(&format!("particles.velocity.y[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	
	pub fn get_subpixel_position_x(&self) -> f32 {
		getf(&gets(&gets(&gets(self.world, "particles"), "subpixelPosition"), "x"), self.index() as f64)
			.as_f64().expect(&format!("particles.subpixelPosition.x[{},{}] not found", self.x, self.y).as_str()) as f32
	}

	pub fn get_subpixel_position_y(&self) -> f32 {
		getf(&gets(&gets(&gets(self.world, "particles"), "subpixelPosition"), "y"), self.index() as f64)
			.as_f64().expect(&format!("particles.subpixelPosition.y[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	
	pub fn get_mass(&self) -> f32 {
		getf(&gets(&gets(self.world, "particles"), "mass"), self.index() as f64)
			.as_f64().expect(&format!("particles.mass[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	
	pub fn get_temperature(&self) -> f32 {
		getf(&gets(&gets(self.world, "particles"), "temperature"), self.index() as f64)
			.as_f64().expect(&format!("particles.temperature[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	
	pub fn get_scratch1(&self) -> u64 {
		getf(&gets(&gets(self.world, "particles"), "scratch1"), self.index() as f64)
			.as_f64().expect(&format!("particles.scratch1[{},{}] not found", self.x, self.y).as_str()) as u64
	}
	
	pub fn get_scratch2(&self) -> u64 {
		getf(&gets(&gets(self.world, "particles"), "scratch2"), self.index() as f64)
			.as_f64().expect(&format!("particles.scratch2[{},{}] not found", self.x, self.y).as_str()) as u64
	}
}

impl<'w> Drop for Particle<'w> {
	//This, this is why we're fucking around with Rust here.
	fn drop(&mut self) {
		Atomics::store(
			&gets(&gets(self.world, "particles"), "lock"),
			self.index(),
			0,
		).expect("Failed to unlock particle at {},{}.");
	}
}
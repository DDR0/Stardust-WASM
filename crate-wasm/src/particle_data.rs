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
use web_sys::console;
use enum_dispatch::enum_dispatch;

fn gets(obj: &JsValue, key: &str) -> JsValue {
	Reflect::get(obj, &JsValue::from_str(key)).expect("key not found")
}

fn getf(obj: &JsValue, key: f64) -> JsValue {
	Reflect::get(obj, &JsValue::from_f64(key)).expect("key not found")
}


#[enum_dispatch]
pub trait ParticleData {
	fn replace(&mut self, dest: &mut RealParticle);
	fn swap(&mut self, dest: &mut RealParticle);
	
	fn type_id(&self) -> u8;
	fn set_type_id(&mut self, val: u8);
	fn stage(&self) -> u8;
	fn set_stage(&mut self, val: u8);
	fn initiative(&self) -> f32;
	fn set_initiative(&mut self, val: f32);
	fn rgba(&self) -> u32;
	fn set_rgba(&mut self, val: u32);
	fn velocity_x(&self) -> f32;
	fn set_velocity_x(&mut self, val: f32);
	fn velocity_y(&self) -> f32;
	fn set_velocity_y(&mut self, val: f32);
	fn subpixel_position_x(&self) -> f32;
	fn set_subpixel_position_x(&mut self, val: f32);
	fn subpixel_position_y(&self) -> f32;
	fn set_subpixel_position_y(&mut self, val: f32);
	fn mass(&self) -> f32;
	fn set_mass(&mut self, val: f32);
	fn temperature(&self) -> f32;
	fn set_temperature(&mut self, val: f32);
	fn scratch1(&self) -> u64;
	fn set_scratch1(&mut self, val: u64);
	fn scratch2(&self) -> u64;
	fn set_scratch2(&mut self, val: u64);
}

#[derive(Debug)]
pub struct RealParticle<'w> {
	world: &'w JsValue,
	x: i32, //position from top-left
	y: i32,
	w: i32, //w/h of play field, used for dereferencing
	h: i32, //origin is always 0,0
}

#[derive(Debug)]
pub struct FakeParticle {
	type_id: u8,
}

impl<'w> RealParticle<'w> {
	fn index(&self) -> u32 { (self.x+self.y*self.w) as u32 }
}

impl<'w> ParticleData for RealParticle<'w> {
	fn replace(&mut self, dest: &mut RealParticle) {
		todo!()
	}
	fn swap(&mut self, dest: &mut RealParticle) {
		todo!()
	}
	
	
	//World data accessors:
	
	fn type_id(&self) -> u8 {
		getf(&gets(&gets(self.world, "particles"), "type"), self.index() as f64)
			.as_f64().expect(&format!("particles.type[{},{}] not found", self.x, self.y).as_str()) as u8
	}
	fn set_type_id(&mut self, val: u8) {
		todo!()
	}
	
	fn stage(&self) -> u8 {
		getf(&gets(&gets(self.world, "particles"), "stage"), self.index() as f64)
			.as_f64().expect(&format!("particles.stage[{},{}] not found", self.x, self.y).as_str()) as u8
	}
	fn set_stage(&mut self, val: u8) {
		todo!()
	}
	
	fn initiative(&self) -> f32 {
		getf(&gets(&gets(self.world, "particles"), "initiative"), self.index() as f64)
			.as_f64().expect(&format!("particles.initiative[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_initiative(&mut self, val: f32) {
		todo!()
	}
	
	fn rgba(&self) -> u32 {
		getf(&gets(&gets(self.world, "particles"), "rgba"), self.index() as f64)
			.as_f64().expect(&format!("particles.rgba[{},{}] not found", self.x, self.y).as_str()) as u32
	}
	fn set_rgba(&mut self, val: u32) {
		todo!()
	}
	
	fn velocity_x(&self) -> f32 {
		getf(&gets(&gets(&gets(self.world, "particles"), "velocity"), "x"), self.index() as f64)
			.as_f64().expect(&format!("particles.velocity.x[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_velocity_x(&mut self, val: f32) {
		todo!()
	}
	
	fn velocity_y(&self) -> f32 {
		getf(&gets(&gets(&gets(self.world, "particles"), "velocity"), "y"), self.index() as f64)
			.as_f64().expect(&format!("particles.velocity.y[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_velocity_y(&mut self, val: f32) {
		todo!()
	}
	
	fn subpixel_position_x(&self) -> f32 {
		getf(&gets(&gets(&gets(self.world, "particles"), "subpixelPosition"), "x"), self.index() as f64)
			.as_f64().expect(&format!("particles.subpixelPosition.x[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_subpixel_position_x(&mut self, val: f32) {
		todo!()
	}
	
	fn subpixel_position_y(&self) -> f32 {
		getf(&gets(&gets(&gets(self.world, "particles"), "subpixelPosition"), "y"), self.index() as f64)
			.as_f64().expect(&format!("particles.subpixelPosition.y[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_subpixel_position_y(&mut self, val: f32) {
		todo!()
	}
	
	fn mass(&self) -> f32 {
		getf(&gets(&gets(self.world, "particles"), "mass"), self.index() as f64)
			.as_f64().expect(&format!("particles.mass[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_mass(&mut self, val: f32) {
		todo!()
	}
	
	fn temperature(&self) -> f32 {
		getf(&gets(&gets(self.world, "particles"), "temperature"), self.index() as f64)
			.as_f64().expect(&format!("particles.temperature[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_temperature(&mut self, val: f32) {
		todo!()
	}
	
	fn scratch1(&self) -> u64 {
		getf(&gets(&gets(self.world, "particles"), "scratch1"), self.index() as f64)
			.as_f64().expect(&format!("particles.scratch1[{},{}] not found", self.x, self.y).as_str()) as u64
	}
	fn set_scratch1(&mut self, val: u64) {
		todo!()
	}
	
	fn scratch2(&self) -> u64 {
		getf(&gets(&gets(self.world, "particles"), "scratch2"), self.index() as f64)
			.as_f64().expect(&format!("particles.scratch2[{},{}] not found", self.x, self.y).as_str()) as u64
	}
	fn set_scratch2(&mut self, val: u64) {
		todo!()
	}
}


impl ParticleData for FakeParticle {
	fn replace(&mut self, dest: &mut RealParticle) {}
	fn swap(&mut self, dest: &mut RealParticle) {}

	fn type_id(&self) -> u8 { self.type_id }
	fn set_type_id(&mut self, _: u8) {}
	fn stage(&self) -> u8 { 0u8 }
	fn set_stage(&mut self, _: u8) {}
	fn initiative(&self) -> f32 { 0f32 }
	fn set_initiative(&mut self, _: f32) {}
	fn rgba(&self) -> u32 { 0u32 }
	fn set_rgba(&mut self, _: u32) {}
	fn velocity_x(&self) -> f32 { 0f32 }
	fn set_velocity_x(&mut self, _: f32) {}
	fn velocity_y(&self) -> f32 { 0f32 }
	fn set_velocity_y(&mut self, _: f32) {}
	fn subpixel_position_x(&self) -> f32 { 0f32 }
	fn set_subpixel_position_x(&mut self, _: f32) {}
	fn subpixel_position_y(&self) -> f32 { 0f32 }
	fn set_subpixel_position_y(&mut self, _: f32) {}
	fn mass(&self) -> f32 { 0f32 }
	fn set_mass(&mut self, _: f32) {}
	fn temperature(&self) -> f32 { 0f32 }
	fn set_temperature(&mut self, _: f32) {}
	fn scratch1(&self) -> u64 { 0u64 }
	fn set_scratch1(&mut self, _: u64) {}
	fn scratch2(&self) -> u64 { 0u64 }
	fn set_scratch2(&mut self, _: u64) {}
}


#[enum_dispatch(ParticleData)]
pub enum BaseParticle<'w> {
	Real(RealParticle<'w>),
	Fake(FakeParticle),
}


//Maybe this would better be called lock_particle or get_and_lock_particle?
pub fn new_particle(world: &JsValue, thread_id: i32, x: i32, y: i32) -> Option<BaseParticle> {
	if x < 0 { 
		return Some(FakeParticle {
			type_id: getf(&gets(world, "wrappingBehaviour"), 0.)
				.as_f64().expect("world.wrappingBehaviour[0] not found") as u8
		}.into())
	}
	if y < 0 {
		return Some(FakeParticle {
			type_id: getf(&gets(world, "wrappingBehaviour"), 3.)
				.as_f64().expect("world.wrappingBehaviour[3] not found") as u8
		}.into())
	}
	
	let world_bounds = &gets(world, "bounds");
	let w = getf(&gets(world_bounds, "x"), 0.)
		.as_f64().expect("world.bounds.y not found") as i32;
	let h = getf(&gets(world_bounds, "y"), 0.)
		.as_f64().expect("world.bounds.y not found") as i32;
	
	if x >= w {
		return Some(FakeParticle {
			type_id: getf(&gets(world, "wrappingBehaviour"), 1.)
				.as_f64().expect("world.wrappingBehaviour[1] not found") as u8
		}.into())
	}
	if y >= h {
		return Some(FakeParticle {
			type_id: getf(&gets(world, "wrappingBehaviour"), 2.)
				.as_f64().expect("world.wrappingBehaviour[2] not found") as u8
		}.into())
	}
	
	let p = RealParticle {
		world,
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
		0 => { 
			//console::log_1(&format!("locked particle {},{} on {}", x,y, thread_id).into());
			Some(BaseParticle::Real(p))
		}
		_ => { 
			console::log_1(&format!("failed to lock particle {},{} on {}", x,y, thread_id).into());
			None
		}
	}
}

impl<'w> Drop for RealParticle<'w> {
	//This, this is why we're messing around in Rust here.
	fn drop(&mut self) {
		//console::log_1(&format!("unlocked particle at {},{}.", self.x, self.y).into());
		Atomics::store(
			&gets(&gets(self.world, "particles"), "lock"),
			self.index(),
			0,
		).expect(&format!("Failed to unlock particle at {},{}.", self.x, self.y).as_str());
	}
}
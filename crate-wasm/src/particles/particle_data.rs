/// Backing data access for the particles in the simulation.
///
/// The reason this exists is so that we can automatically lock particles
/// upon acquisition, and release that lock when the particle is destructed.
/// We really want to do this in a somewhat automatic manner, especially
/// as we will need to acquire and release more than one particle for most
/// particles - anything that moves must lock the position it's moving to,
/// for example. It also provides a type-safe wrapper for the locked
/// particle attributes, and ensures you can't access them without locking
/// the particle they're for as well.

use std::thread::LocalKey;
use std::rc::Rc;
use std::fmt;

use crate::JsValue;
use js_sys::{Reflect, Atomics, BigUint64Array};
use web_sys::console;
use enum_dispatch::enum_dispatch;

std::thread_local! {
	//Allocate the JS strings used to look stuff up in the world once, vs generating them as needed.
	//This was crashing Chrome 109.0.5414.119 with SIGILL, as well as just being plain ol' slow.
	static JS_BOUNDS:             JsValue = JsValue::from_str("bounds");
	static JS_INITIATIVE:         JsValue = JsValue::from_str("initiative");
	static JS_LOCK:               JsValue = JsValue::from_str("lock");
	static JS_MASS:               JsValue = JsValue::from_str("mass");
	static JS_PARTICLES:          JsValue = JsValue::from_str("particles");
	static JS_RGBA:               JsValue = JsValue::from_str("rgba");
	static JS_SCRATCH1:           JsValue = JsValue::from_str("scratch1");
	static JS_SCRATCH2:           JsValue = JsValue::from_str("scratch2");
	static JS_STAGE:              JsValue = JsValue::from_str("stage");
	static JS_SUBPIXEL_POSITION:  JsValue = JsValue::from_str("subpixelPosition");
	static JS_TEMPERATURE:        JsValue = JsValue::from_str("temperature");
	static JS_TICK:               JsValue = JsValue::from_str("tick");
	static JS_TYPE:               JsValue = JsValue::from_str("type");
	static JS_VELOCITY:           JsValue = JsValue::from_str("velocity");
	static JS_WORKERS_RUNNING:    JsValue = JsValue::from_str("workersRunning");
	static JS_WRAPPING_BEHAVIOUR: JsValue = JsValue::from_str("wrappingBehaviour");
	static JS_X:                  JsValue = JsValue::from_str("x");
	static JS_Y:                  JsValue = JsValue::from_str("y");
	//I realise this is ugly as sin. I'm working on it. I don't have a memo() function, maybe grab https://docs.rs/fn-memo/latest/fn_memo/ in the future if this becomes more of an issue?
}

fn get1j(object: &JsValue, key1: &'static LocalKey<JsValue>) -> JsValue {
	key1.with(|key1| {
		Reflect::get(
			object, 
			key1
		).expect("key not found")
	})
}

fn get2j(object: &JsValue, key1: &'static LocalKey<JsValue>, key2: &'static LocalKey<JsValue>) -> JsValue {
	key1.with(|key1| {
		key2.with(|key2| {
			Reflect::get(
				&Reflect::get(
					object, 
					key1
				).expect("key1 not found"), 
				key2
			).expect("key2 not found")
		})
	})
}

fn get3j(object: &JsValue, key1: &'static LocalKey<JsValue>, key2: &'static LocalKey<JsValue>, key3: &'static LocalKey<JsValue>) -> JsValue {
	key1.with(|key1| {
		key2.with(|key2| {
			key3.with(|key3| {
				Reflect::get(
					&Reflect::get(
						&Reflect::get(
							object, 
							key1
						).expect("key1 not found"), 
						key2
					).expect("key2 not found"),
					key3
				).expect("key3 not found")
			})
		})
	})
}

// gets and sets are deprecated in favour of get*j, due to creating strings.
//fn gets(obj: &JsValue, key: &str) -> JsValue {
//	//console::log_1(&format!("Getting value {:?}[{:?}]…", obj, key).into());
//	Reflect::get(obj, &JsValue::from_str(key)).expect("key not found")
//}

fn getf(obj: &JsValue, key: f64) -> JsValue {
	Reflect::get_f64(obj, key).expect("key not found")
}

fn getu(obj: &JsValue, key: u32) -> JsValue {
	Reflect::get_u32(obj, key).expect("key not found")
}

//fn //sets(obj: &JsValue, key: &str, value: f64) -> bool {
//	Reflect::set(obj, &JsValue::from_str(key), &JsValue::from_f64(value)).expect("key not found")
//}

fn setf(obj: &JsValue, key: f64, value: f64) -> bool {
	Reflect::set_f64(obj, key, &JsValue::from_f64(value)).expect("key not settable in obj")
}

fn setu(obj: &JsValue, key: u32, value: f64) -> bool {
	Reflect::set_u32(obj, key, &JsValue::from_f64(value)).expect("key not settable in obj")
}


/// Basic functionality all particles implement.
#[enum_dispatch]
pub trait ParticleData {
	fn is_new_tick(&mut self) -> bool; /// Returns true on the first invocation during a tick. Must be invoked at least once per tick if used. Sets particle.tick to a boolean value under the hood, true if world.tick is an even number.
	fn get_random_seed(&self) -> u32; /// Returns a poor-quality random seed, based on particle position and world tick.
	
	fn neighbour(&self, delta_x: i32, delta_y: i32) -> Result<BaseParticle, ()>;
	
	// Technically, these should consume self too, thus invalidating both
	// objects, but neighbour's output seems to maintain a reference to us
	// so we can't move self out of the scope there. Luckily, JS-stuff uses
	// references to that, so we don't actually have to mutate anything. I
	// feel that something in the design here is, generally speaking, wrong.
	fn replace(&mut self, dest: &mut BaseParticle);
	fn swap(&mut self, dest: &mut BaseParticle);
	
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

/// Backing data for a real particle in the simulation.
//#[derive(Debug)] Can't use this, because world is cloned with JSON.stringify, which... takes a while...
pub struct RealParticle {
	world: Rc<JsValue>,
	thread_id: i32,
	x: i32, //particle position from origin of playfield
	y: i32,
	w: i32, //w/h of play field, used for dereferencing
	h: i32, //origin of play field is always 0,0
}

/// Backing data for a fake particle, used to represent pixels outside the gamefield.
///
/// By default, the fake backing data will dummy out any writes, and report 0 for reads.
/// The one exception is for type_id, which is initializable to a value and reports that.
//#[derive(Debug)] Can't use this, because world is cloned with JSON.stringify, which... takes a while...
pub struct FakeParticle {
	world: Rc<JsValue>,
	thread_id: i32,
	x: i32,
	y: i32,
	type_id: u8,
}

impl RealParticle {
	fn index(&self) -> u32 { (self.x+self.y*self.w) as u32 }
}

impl ParticleData for RealParticle {
	fn is_new_tick(&mut self) -> bool {
			let particle_tick = getf(&get2j(&self.world, &JS_PARTICLES, &JS_TICK), self.index() as f64)
				.as_f64().expect(&format!("particles.tick[{},{}] not found", self.x, self.y).as_str()) as i32;
			let world_tick = getf(&get1j(&self.world, &JS_TICK), 0.) //Don't need to load this via an atomic… right?
				.as_f64().expect("world.tick access error") as i32;
			let parity: bool = particle_tick % 2 == world_tick % 2;
			
			if !parity {
				setf(&get2j(&self.world, &JS_PARTICLES, &JS_TICK), self.index() as f64, (world_tick % 2).into());
			}
			
			parity
	}
	
	fn get_random_seed(&self) -> u32 {
		let world_tick = getf(&get1j(&self.world, &JS_TICK), 0.) //Don't need to load this via an atomic… right?
			.as_f64()
			.expect("world.tick access error") as i32;
		(world_tick | self.x << 16 | self.y) as u32
	}
	
	fn neighbour(&self, delta_x: i32, delta_y: i32) -> Result<BaseParticle, ()> {
		assert!(
			self.x != 0 || self.y != 0, 
			"neighbour({},{}) must have a non-zero delta", self.x, self.y,
		);
		new_particle_data(self.world.clone(), self.thread_id, self.x+delta_x, self.y+delta_y)
	}
	fn replace(&mut self, dest: &mut BaseParticle) {
		console::log_1(&format!("TODO: Implement replace particle function.").into());
		//todo!()
	}
	fn swap(&mut self, dest: &mut BaseParticle) {
		console::log_1(&format!("TODO: Implement swap particle function.").into());
		//todo!()
	}
	
	
	//World data accessors:
	
	fn type_id(&self) -> u8 {
		getu(&get2j(&self.world, &JS_PARTICLES, &JS_TYPE), self.index())
			.as_f64().expect(&format!("particles.type[{},{}] not found", self.x, self.y).as_str()) as u8
	}
	fn set_type_id(&mut self, val: u8) {
		setu(&get2j(&self.world, &JS_PARTICLES, &JS_TYPE), self.index(), val.into());
	}
	
	fn stage(&self) -> u8 {
		getu(&get2j(&self.world, &JS_PARTICLES, &JS_STAGE), self.index())
			.as_f64().expect(&format!("particles.stage[{},{}] not found", self.x, self.y).as_str()) as u8
	}
	fn set_stage(&mut self, val: u8) {
		setu(&get2j(&self.world, &JS_PARTICLES, &JS_STAGE), self.index(), val.into());
	}
	
	fn initiative(&self) -> f32 {
		getu(&get2j(&self.world, &JS_PARTICLES, &JS_INITIATIVE), self.index())
			.as_f64().expect(&format!("particles.initiative[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_initiative(&mut self, val: f32) {
		setu(&get2j(&self.world, &JS_PARTICLES, &JS_INITIATIVE), self.index(), val.into());
	}
	
	fn rgba(&self) -> u32 {
		getu(&get2j(&self.world, &JS_PARTICLES, &JS_RGBA), self.index())
			.as_f64().expect(&format!("particles.rgba[{},{}] not found", self.x, self.y).as_str()) as u32
	}
	fn set_rgba(&mut self, val: u32) {
		setu(&get2j(&self.world, &JS_PARTICLES, &JS_RGBA), self.index(), val.into());
	}
	
	fn velocity_x(&self) -> f32 {
		getf(&get3j(&self.world, &JS_PARTICLES, &JS_VELOCITY, &JS_X), self.index() as f64)
			.as_f64().expect(&format!("particles.velocity.x[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_velocity_x(&mut self, val: f32) {
		setu(&get3j(&self.world, &JS_PARTICLES, &JS_VELOCITY, &JS_X), self.index(), val.into());
	}
	
	fn velocity_y(&self) -> f32 {
		getf(&get3j(&self.world, &JS_PARTICLES, &JS_VELOCITY, &JS_Y), self.index() as f64)
			.as_f64().expect(&format!("particles.velocity.y[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_velocity_y(&mut self, val: f32) {
		setu(&get3j(&self.world, &JS_PARTICLES, &JS_VELOCITY, &JS_Y), self.index(), val.into());
	}
	
	fn subpixel_position_x(&self) -> f32 {
		getf(&get3j(&self.world, &JS_PARTICLES, &JS_SUBPIXEL_POSITION, &JS_X), self.index() as f64)
			.as_f64().expect(&format!("particles.subpixelPosition.x[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_subpixel_position_x(&mut self, val: f32) {
		setu(&get3j(&self.world, &JS_PARTICLES, &JS_SUBPIXEL_POSITION, &JS_X), self.index(), val.into());
	}
	
	fn subpixel_position_y(&self) -> f32 {
		getf(&get3j(&self.world, &JS_PARTICLES, &JS_SUBPIXEL_POSITION, &JS_Y), self.index() as f64)
			.as_f64().expect(&format!("particles.subpixelPosition.y[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_subpixel_position_y(&mut self, val: f32) {
		setu(&get3j(&self.world, &JS_PARTICLES, &JS_SUBPIXEL_POSITION, &JS_Y), self.index(), val.into());
	}
	
	fn mass(&self) -> f32 {
		getu(&get2j(&self.world, &JS_PARTICLES, &JS_MASS), self.index())
			.as_f64().expect(&format!("particles.mass[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_mass(&mut self, val: f32) {
		setu(&get2j(&self.world, &JS_PARTICLES, &JS_MASS), self.index(), val.into());
	}
	
	fn temperature(&self) -> f32 {
		getu(&get2j(&self.world, &JS_PARTICLES, &JS_TEMPERATURE), self.index())
			.as_f64().expect(&format!("particles.temperature[{},{}] not found", self.x, self.y).as_str()) as f32
	}
	fn set_temperature(&mut self, val: f32) {
		setu(&get2j(&self.world, &JS_PARTICLES, &JS_TEMPERATURE), self.index(), val.into());
	}
	
	fn scratch1(&self) -> u64 {
		let scratch: BigUint64Array = get2j(&self.world, &JS_PARTICLES, &JS_SCRATCH1).into();
		scratch.get_index(self.index())
	}
	fn set_scratch1(&mut self, val: u64) {
		let scratch: BigUint64Array = get2j(&self.world, &JS_PARTICLES, &JS_SCRATCH2).into();
		scratch.set_index(self.index(), val.into());
	}
	
	fn scratch2(&self) -> u64 {
		let scratch: BigUint64Array = get2j(&self.world, &JS_PARTICLES, &JS_SCRATCH2).into();
		scratch.get_index(self.index())
	}
	fn set_scratch2(&mut self, val: u64) {
		let scratch: BigUint64Array = get2j(&self.world, &JS_PARTICLES, &JS_SCRATCH2).into();
		scratch.set_index(self.index(), val.into());
	}
}


impl ParticleData for FakeParticle {
	fn is_new_tick(&mut self) -> bool { false }
	fn neighbour(&self, delta_x: i32, delta_y: i32) -> Result<BaseParticle, ()> {
		assert!(
			self.x != 0 || self.y != 0, 
			"neighbour({},{}) must have a non-zero delta", self.x, self.y,
		);
		new_particle_data(self.world.clone(), self.thread_id, self.x+delta_x, self.y+delta_y)
	}
	
	fn get_random_seed(&self) -> u32 {
		let world_tick = getf(&get1j(&self.world, &JS_TICK), 0.) //Don't need to load this via an atomic… right?
			.as_f64().expect("world.tick access error") as i32;
		(world_tick | self.x << 16 | self.y) as u32
	}
	
	fn replace(&mut self, dest: &mut BaseParticle) {}
	fn swap(&mut self, dest: &mut BaseParticle) {}

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
pub enum BaseParticle {
	Real(RealParticle),
	Fake(FakeParticle),
}


//Maybe this would better be called lock_particle or get_and_lock_particle?
pub fn new_particle_data(world: Rc<JsValue>, thread_id: i32, x: i32, y: i32) -> Result<BaseParticle, ()> {
	let wrapping_behaviour = &get1j(&world, &JS_WRAPPING_BEHAVIOUR);
	if x < 0 { 
		let type_id = getf(wrapping_behaviour, 0.)
			.as_f64().expect("world.wrappingBehaviour[0] not found") as u8;
		return Ok(FakeParticle {
			world, thread_id,
			x, y,
			type_id
		}.into())
	}
	if y < 0 {
		let type_id = getf(wrapping_behaviour, 3.)
			.as_f64().expect("world.wrappingBehaviour[3] not found") as u8;
		return Ok(FakeParticle {
			world, thread_id,
			x, y,
			type_id
		}.into())
	}
	
	let world_bounds = &get1j(&world, &JS_BOUNDS);
	let w = getf(&get1j(world_bounds, &JS_X), 0.)
		.as_f64().expect("world.bounds.y not found") as i32;
	let h = getf(&get1j(world_bounds, &JS_Y), 0.)
		.as_f64().expect("world.bounds.y not found") as i32;
	
	if x >= w {
		let type_id = getf(wrapping_behaviour, 1.)
			.as_f64().expect("world.wrappingBehaviour[1] not found") as u8;
		return Ok(FakeParticle {
			world, thread_id,
			x, y,
			type_id
		}.into())
	}
	if y >= h {
		let type_id = getf(wrapping_behaviour, 2.)
			.as_f64().expect("world.wrappingBehaviour[2] not found") as u8;
		return Ok(FakeParticle {
			world, thread_id,
			x, y,
			type_id
		}.into())
	}
	
	let particle_lock_array = &get2j(&world, &JS_PARTICLES, &JS_LOCK);
	
	let p = RealParticle {
		world, thread_id,
		x,y,w,h,
	};
	
	match
		Atomics::compare_exchange(
			particle_lock_array,
			p.index(),
			0,
			thread_id,
		).expect(&format!("Locking mechanism failed (vs obtaining the lock failing) at {},{}.", x,y).as_str())
	{
		0 => Ok(BaseParticle::Real(p)),
		_ => Err(()),
	}
}

impl Drop for RealParticle {
	//This, this is why we're messing around in Rust here.
	fn drop(&mut self) {
		//console::log_1(&format!("unlocked particle at {},{}.", self.x, self.y).into());
		Atomics::store(
			&get2j(&self.world, &JS_PARTICLES, &JS_LOCK),
			self.index(),
			0,
		).expect(&format!("Failed to unlock particle at {},{}.", self.x, self.y).as_str());
	}
}


//Let's use a custom debug formatter which doesn't involve calling JSON.stringify
//on several million elements in world. (Symptom: Long hang/pause on debug.)
impl fmt::Debug for BaseParticle {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
        	BaseParticle::Real(p) => write!(f, "BaseParticle::Real({:?})", p),
        	BaseParticle::Fake(p) => write!(f, "BaseParticle::Fake({:?})", p),
        }
    }
}

impl fmt::Debug for RealParticle {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "RealParticle(id={}, color=#{:x}), x={}, y={}) on thread {}",
        	self.type_id(), self.rgba(), self.x, self.y, self.thread_id)
    }
}

impl fmt::Debug for FakeParticle {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "FakeParticle(id={}, color=#{:x}), x={}, y={}) on thread {}",
        	self.type_id(), self.rgba(), self.x, self.y, self.thread_id)
    }
}
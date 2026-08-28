use core::sync::atomic::Ordering;

use crate::world::World;

const NULL_ID: i32 = 0;

macro_rules! swap_fields {
	($a:ident, $b:ident, $(($getter:ident, $setter:ident)), *) => {
		{
			$(
				{
					let tmp = $a.$getter();
					$a.$setter($b.$getter());
					$b.$setter(tmp);
				}
			)*
		}
	};
}

pub trait ParticleTrait {
	fn r#type(&self) -> u8;
	fn tick(&self) -> u8;
	fn stage(&self) -> u8;
	fn colour(&self) -> u32;
	fn velocity_x(&self) -> f32;
	fn velocity_y(&self) -> f32;
	fn subpixel_x(&self) -> f32;
	fn subpixel_y(&self) -> f32;
	fn temperature(&self) -> f32;
	fn scratch_a(&self) -> u64;
	fn scratch_b(&self) -> u64;
	
	fn set_type(&self, target: u8);
	fn set_tick(&self, target: u8);
	fn set_stage(&self, target: u8);
	fn set_colour(&self, target: u32);
	fn set_velocity_x(&self, target: f32);
	fn set_velocity_y(&self, target: f32);
	fn set_subpixel_x(&self, target: f32);
	fn set_subpixel_y(&self, target: f32);
	fn set_temperature(&self, target: f32);
	fn set_scratch_a(&self, target: u64);
	fn set_scratch_b(&self, target: u64);
	
	fn swap(&self, target: impl ParticleTrait) {
		swap_fields!(self, target,
			(r#type, set_type),
			(tick, set_tick),
			(stage, set_stage),
			(colour, set_colour),
			(velocity_x, set_velocity_x),
			(velocity_y, set_velocity_y),
			(subpixel_x, set_subpixel_x),
			(subpixel_y, set_subpixel_y),
			(temperature, set_temperature),
			(scratch_a, set_scratch_a),
			(scratch_b, set_scratch_b)
		)
	}
}

pub struct Particle<'world> {
	world: &'world World,
	pub index: usize,
}

impl<'world> Particle<'world> {
	/// Obtain a particle for reading and writing.
	// I think I've got the ordering right? https://doc.rust-lang.org/core/sync/atomic/enum.Ordering.html
	#[inline(always)]
	pub fn try_acquire(world: &'world World, worker_id: i32, index: usize) -> Option<Self> {
		match world.locks[index].compare_exchange(
			NULL_ID, 
			worker_id, 
			Ordering::Acquire, 
			Ordering::Relaxed
		) {
			Ok(_) => Some(Self { world, index }),
			Err(_) => None,
		}
	}
}

impl<'world> ParticleTrait for Particle<'world> {
	// Define some getters, because doing this in the "business logic" would be insane.
	#[inline(always)] fn r#type(&self) -> u8 { self.world.types[self.index].load(Ordering::Relaxed) }
	#[inline(always)] fn tick(&self) -> u8 { self.world.ticks[self.index].load(Ordering::Relaxed) }
	#[inline(always)] fn stage(&self) -> u8 { self.world.stages[self.index].load(Ordering::Relaxed) }
	#[inline(always)] fn colour(&self) -> u32 { self.world.colours[self.index].load(Ordering::Relaxed) }
	#[inline(always)] fn velocity_x(&self) -> f32 { f32::from_bits(self.world.velocity_xs[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] fn velocity_y(&self) -> f32 { f32::from_bits(self.world.velocity_ys[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] fn subpixel_x(&self) -> f32 { f32::from_bits(self.world.subpixel_xs[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] fn subpixel_y(&self) -> f32 { f32::from_bits(self.world.subpixel_ys[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] fn temperature(&self) -> f32 { f32::from_bits(self.world.temperatures[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] fn scratch_a(&self) -> u64 { self.world.scratch_a[self.index].load(Ordering::Relaxed) }
	#[inline(always)] fn scratch_b(&self) -> u64 { self.world.scratch_b[self.index].load(Ordering::Relaxed) }
	
	// Also define some setters.
	#[inline(always)] fn set_type(&self, target: u8) { self.world.types[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] fn set_tick(&self, target: u8) { self.world.ticks[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] fn set_stage(&self, target: u8) { self.world.stages[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] fn set_colour(&self, target: u32) { self.world.colours[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] fn set_velocity_x(&self, target: f32) { self.world.velocity_xs[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] fn set_velocity_y(&self, target: f32) { self.world.velocity_ys[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] fn set_subpixel_x(&self, target: f32) { self.world.subpixel_xs[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] fn set_subpixel_y(&self, target: f32) { self.world.subpixel_ys[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] fn set_temperature(&self, target: f32) { self.world.temperatures[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] fn set_scratch_a(&self, target: u64) { self.world.scratch_a[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] fn set_scratch_b(&self, target: u64) { self.world.scratch_b[self.index].store(target, Ordering::Relaxed); }
}

impl<'world> Drop for Particle<'world> {
	#[inline(always)]
	fn drop(&mut self) {
		self.world.locks[self.index].store(NULL_ID, Ordering::Release);
	}
}


pub struct InertParticle<'world> {
	world: &'world World,
	pub r#type: u8,
}

impl<'world> InertParticle<'world> {
	/// Obtain a fake particle for reading and writing. (Index is the type).
	#[inline(always)]
	pub fn new(world: &'world World, index: u8) -> Self {
		Self { world, r#type: index }
	}
}

impl<'world> ParticleTrait for &InertParticle<'world> {
	#[inline(always)] fn r#type(&self) -> u8 { self.r#type }
	#[inline(always)] fn tick(&self) -> u8 { self.world.global_tick.load(Ordering::Relaxed) as u8 }
	#[inline(always)] fn stage(&self) -> u8 { 2 }
	#[inline(always)] fn colour(&self) -> u32 { 0 }
	#[inline(always)] fn velocity_x(&self) -> f32 { 0.0 }
	#[inline(always)] fn velocity_y(&self) -> f32 { 0.0 }
	#[inline(always)] fn subpixel_x(&self) -> f32 { 0.0 }
	#[inline(always)] fn subpixel_y(&self) -> f32 { 0.0 }
	#[inline(always)] fn temperature(&self) -> f32 { 0.0 }
	#[inline(always)] fn scratch_a(&self) -> u64 { 0 }
	#[inline(always)] fn scratch_b(&self) -> u64 { 0 }
	
	#[inline(always)] fn set_type(&self, _target: u8) {}
	#[inline(always)] fn set_tick(&self, _target: u8) {}
	#[inline(always)] fn set_stage(&self, _target: u8) {}
	#[inline(always)] fn set_colour(&self, _target: u32) {}
	#[inline(always)] fn set_velocity_x(&self, _target: f32) {}
	#[inline(always)] fn set_velocity_y(&self, _target: f32) {}
	#[inline(always)] fn set_subpixel_x(&self, _target: f32) {}
	#[inline(always)] fn set_subpixel_y(&self, _target: f32) {}
	#[inline(always)] fn set_temperature(&self, _target: f32) {}
	#[inline(always)] fn set_scratch_a(&self, _target: u64) {}
	#[inline(always)] fn set_scratch_b(&self, _target: u64) {}
}

impl<'world> ParticleTrait for InertParticle<'world> {
	#[inline(always)] fn r#type(&self) -> u8 { self.r#type }
	#[inline(always)] fn tick(&self) -> u8 { self.world.global_tick.load(Ordering::Relaxed) as u8 }
	#[inline(always)] fn stage(&self) -> u8 { 2 }
	#[inline(always)] fn colour(&self) -> u32 { 0 }
	#[inline(always)] fn velocity_x(&self) -> f32 { 0.0 }
	#[inline(always)] fn velocity_y(&self) -> f32 { 0.0 }
	#[inline(always)] fn subpixel_x(&self) -> f32 { 0.0 }
	#[inline(always)] fn subpixel_y(&self) -> f32 { 0.0 }
	#[inline(always)] fn temperature(&self) -> f32 { 0.0 }
	#[inline(always)] fn scratch_a(&self) -> u64 { 0 }
	#[inline(always)] fn scratch_b(&self) -> u64 { 0 }
	
	#[inline(always)] fn set_type(&self, _target: u8) {}
	#[inline(always)] fn set_tick(&self, _target: u8) {}
	#[inline(always)] fn set_stage(&self, _target: u8) {}
	#[inline(always)] fn set_colour(&self, _target: u32) {}
	#[inline(always)] fn set_velocity_x(&self, _target: f32) {}
	#[inline(always)] fn set_velocity_y(&self, _target: f32) {}
	#[inline(always)] fn set_subpixel_x(&self, _target: f32) {}
	#[inline(always)] fn set_subpixel_y(&self, _target: f32) {}
	#[inline(always)] fn set_temperature(&self, _target: f32) {}
	#[inline(always)] fn set_scratch_a(&self, _target: u64) {}
	#[inline(always)] fn set_scratch_b(&self, _target: u64) {}
}

pub enum ParticleEnum<'world> {
	Live(Particle<'world>),
	Inert(InertParticle<'world>),
}

impl<'world> ParticleTrait for ParticleEnum<'world> {
	#[inline(always)] fn r#type(&self) -> u8 { match self { ParticleEnum::Live(p) => p.r#type(), ParticleEnum::Inert(p) => p.r#type() }}
	#[inline(always)] fn tick(&self) -> u8 { match self { ParticleEnum::Live(p) => p.tick(), ParticleEnum::Inert(p) => p.tick() }}
	#[inline(always)] fn stage(&self) -> u8 { match self { ParticleEnum::Live(p) => p.stage(), ParticleEnum::Inert(p) => p.stage() }}
	#[inline(always)] fn colour(&self) -> u32 { match self { ParticleEnum::Live(p) => p.colour(), ParticleEnum::Inert(p) => p.colour() }}
	#[inline(always)] fn velocity_x(&self) -> f32 { match self { ParticleEnum::Live(p) => p.velocity_x(), ParticleEnum::Inert(p) => p.velocity_x() }}
	#[inline(always)] fn velocity_y(&self) -> f32 { match self { ParticleEnum::Live(p) => p.velocity_y(), ParticleEnum::Inert(p) => p.velocity_y() }}
	#[inline(always)] fn subpixel_x(&self) -> f32 { match self { ParticleEnum::Live(p) => p.subpixel_x(), ParticleEnum::Inert(p) => p.subpixel_x() }}
	#[inline(always)] fn subpixel_y(&self) -> f32 { match self { ParticleEnum::Live(p) => p.subpixel_y(), ParticleEnum::Inert(p) => p.subpixel_y() }}
	#[inline(always)] fn temperature(&self) -> f32 { match self { ParticleEnum::Live(p) => p.temperature(), ParticleEnum::Inert(p) => p.temperature() }}
	#[inline(always)] fn scratch_a(&self) -> u64 { match self { ParticleEnum::Live(p) => p.scratch_a(), ParticleEnum::Inert(p) => p.scratch_a() }}
	#[inline(always)] fn scratch_b(&self) -> u64 { match self { ParticleEnum::Live(p) => p.scratch_b(), ParticleEnum::Inert(p) => p.scratch_b() }}
	
	#[inline(always)] fn set_type(&self, target: u8) {match self { ParticleEnum::Live(p) => p.set_type(target), ParticleEnum::Inert(p) => p.set_type(target) }}
	#[inline(always)] fn set_tick(&self, target: u8) {match self { ParticleEnum::Live(p) => p.set_tick(target), ParticleEnum::Inert(p) => p.set_tick(target) }}
	#[inline(always)] fn set_stage(&self, target: u8) {match self { ParticleEnum::Live(p) => p.set_stage(target), ParticleEnum::Inert(p) => p.set_stage(target) }}
	#[inline(always)] fn set_colour(&self, target: u32) {match self { ParticleEnum::Live(p) => p.set_colour(target), ParticleEnum::Inert(p) => p.set_colour(target) }}
	#[inline(always)] fn set_velocity_x(&self, target: f32) {match self { ParticleEnum::Live(p) => p.set_velocity_x(target), ParticleEnum::Inert(p) => p.set_velocity_x(target) }}
	#[inline(always)] fn set_velocity_y(&self, target: f32) {match self { ParticleEnum::Live(p) => p.set_velocity_y(target), ParticleEnum::Inert(p) => p.set_velocity_y(target) }}
	#[inline(always)] fn set_subpixel_x(&self, target: f32) {match self { ParticleEnum::Live(p) => p.set_subpixel_x(target), ParticleEnum::Inert(p) => p.set_subpixel_x(target) }}
	#[inline(always)] fn set_subpixel_y(&self, target: f32) {match self { ParticleEnum::Live(p) => p.set_subpixel_y(target), ParticleEnum::Inert(p) => p.set_subpixel_y(target) }}
	#[inline(always)] fn set_temperature(&self, target: f32) {match self { ParticleEnum::Live(p) => p.set_temperature(target), ParticleEnum::Inert(p) => p.set_temperature(target) }}
	#[inline(always)] fn set_scratch_a(&self, target: u64) {match self { ParticleEnum::Live(p) => p.set_scratch_a(target), ParticleEnum::Inert(p) => p.set_scratch_a(target) }}
	#[inline(always)] fn set_scratch_b(&self, target: u64) {match self { ParticleEnum::Live(p) => p.set_scratch_b(target), ParticleEnum::Inert(p) => p.set_scratch_b(target) }}
	
	fn swap(&self, target: impl ParticleTrait) {
		match self {
			ParticleEnum::Live(s) => s.swap(target),
			ParticleEnum::Inert(s) => s.swap(target),
		}
	}
}
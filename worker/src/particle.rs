use core::sync::atomic::Ordering;

use crate::world::World;

const NULL_ID: i32 = 0;

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
	
	// Define some getters, because doing this in the "business logic" would be insane.
	#[inline(always)] pub fn r#type(&self) -> u8 { self.world.types[self.index].load(Ordering::Relaxed) }
	#[inline(always)] pub fn tick(&self) -> u8 { self.world.ticks[self.index].load(Ordering::Relaxed) }
	#[inline(always)] pub fn stage(&self) -> u8 { self.world.stages[self.index].load(Ordering::Relaxed) }
	#[inline(always)] pub fn colour(&self) -> u32 { self.world.colours[self.index].load(Ordering::Relaxed) }
	#[inline(always)] pub fn velocity_x(&self) -> f32 { f32::from_bits(self.world.velocity_xs[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] pub fn velocity_y(&self) -> f32 { f32::from_bits(self.world.velocity_ys[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] pub fn subpixel_x(&self) -> f32 { f32::from_bits(self.world.subpixel_xs[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] pub fn subpixel_y(&self) -> f32 { f32::from_bits(self.world.subpixel_ys[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] pub fn temperature(&self) -> f32 { f32::from_bits(self.world.temperatures[self.index].load(Ordering::Relaxed)) }
	#[inline(always)] pub fn scratch_a(&self) -> u64 { self.world.scratch_a[self.index].load(Ordering::Relaxed) }
	#[inline(always)] pub fn scratch_b(&self) -> u64 { self.world.scratch_b[self.index].load(Ordering::Relaxed) }
	
	// Also define some setters.
	#[inline(always)] pub fn set_type(&self, target: u8) { self.world.types[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] pub fn set_tick(&self, target: u8) { self.world.ticks[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] pub fn set_stage(&self, target: u8) { self.world.stages[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] pub fn set_colour(&self, target: u32) { self.world.colours[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] pub fn set_velocity_x(&self, target: f32) { self.world.velocity_xs[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] pub fn set_velocity_y(&self, target: f32) { self.world.velocity_ys[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] pub fn set_subpixel_x(&self, target: f32) { self.world.subpixel_xs[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] pub fn set_subpixel_y(&self, target: f32) { self.world.subpixel_ys[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] pub fn set_temperature(&self, target: f32) { self.world.temperatures[self.index].store(f32::to_bits(target), Ordering::Relaxed); }
	#[inline(always)] pub fn set_scratch_a(&self, target: u64) { self.world.scratch_a[self.index].store(target, Ordering::Relaxed); }
	#[inline(always)] pub fn set_scratch_b(&self, target: u64) { self.world.scratch_b[self.index].store(target, Ordering::Relaxed); }
}

impl<'world> Drop for Particle<'world> {
	#[inline(always)]
	fn drop(&mut self) {
		self.world.locks[self.index].store(NULL_ID, Ordering::Release);
	}
}
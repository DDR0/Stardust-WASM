use core::sync::atomic::Ordering;

use crate::world::World;

const NULL_ID: i32 = 0;

pub struct ParticleLock<'world> {
	world: &'world World,
	pub index: usize,
}
pub struct Particle<'world> {
	world: &'world World,
	index: usize,
}

impl<'world> ParticleLock<'world> {
	/// Obtain a particle for reading and writing.
	#[inline(always)]
	pub fn try_acquire(world: &'world World, worker_id: i32, index: usize) -> Option<Self> {
		match world.locks[index].compare_exchange(
			NULL_ID, 
			worker_id, 
			Ordering::SeqCst, 
			Ordering::SeqCst
		) {
			Ok(_) => Some(Self { world, index }),
			Err(_) => None,
		}
	}
	
	#[inline(always)]
	pub fn particle(&self) -> Particle<'_> {
		Particle { world: self.world, index: self.index }
	}
}

impl<'world> Drop for ParticleLock<'world> {
	#[inline(always)]
	fn drop(&mut self) {
		self.world.locks[self.index].store(NULL_ID, Ordering::SeqCst);
	}
}

impl <'world> Particle<'world> {
	pub fn is(&self) -> u8 { self.world.types[self.index] }
	pub fn tick(&self) -> u8 { self.world.ticks[self.index] }
	pub fn stage(&self) -> u8 { self.world.stages[self.index] }
	pub fn colour(&self) -> u32 { self.world.colours[self.index] }
	pub fn velocity_x(&self) -> f32 { self.world.velocity_xs[self.index] }
	pub fn velocity_y(&self) -> f32 { self.world.velocity_ys[self.index] }
	pub fn subpixel_x(&self) -> f32 { self.world.subpixel_xs[self.index] }
	pub fn subpixel_y(&self) -> f32 { self.world.subpixel_ys[self.index] }
	pub fn temperature(&self) -> f32 { self.world.temperatures[self.index] }
	pub fn scratch_a(&self) -> u64 { self.world.scratch_a[self.index] }
	pub fn scratch_b(&self) -> u64 { self.world.scratch_b[self.index] }
}
#![no_main]
#![no_std]

mod js;
mod prng;
mod world;
mod particle;
use js::*;

use core::panic::PanicInfo;
use core::sync::atomic::Ordering;
use core::cmp;

use world::World;
use particle::{Particle, InertParticle, ParticleTrait, ParticleEnum};
use prng::prng;
 

#[repr(i32)]
enum WorkerStates {
	Idle = 0,
	//Queued = 1, only set in js
	Running = 2,
	//Crashed = 3, only set in js
}

#[inline]
const fn get_world() -> &'static World {
	const WASM_MEMORY_STARTING_BYTE: usize = 150000000;
	unsafe {
		&*(WASM_MEMORY_STARTING_BYTE as *const World)
	}
}

#[unsafe(no_mangle)]
pub extern "C" fn run(worker_id: i32) {
	debug_assert!(worker_id >= 1, "Bad worker_id passed in, too small.");
	let worker_index = worker_id as u32 - 1;
	let world = get_world();
	//_log_num(world as *const World as usize);
	
	//We're not using global_lock any more, and for recoverability we're also not doing the main loop in Rust because it keeps crashing on Chrome.
	//_log_num(&world.global_lock as *const AtomicI32 as usize);
	//wait_for((&world.global_lock as *const AtomicI32 as usize).try_into().unwrap(), 0); //WASM is at the moment guaranteed to only have u32 pointers, so this unwrap should always succeed as per the spec.
	
	world.worker_statuses[worker_index as usize]
		.store(WorkerStates::Running as i32, Ordering::Release);
	
	let world_width = world.simulation_window[2] - world.simulation_window[0];
	let world_height = world.simulation_window[3] - world.simulation_window[1];
	let total_pixels = world_width * world_height;
	
	let mut chunk_size = total_pixels / world.total_workers;
	if chunk_size * world.total_workers < total_pixels {
		chunk_size += 1
	}
	let chunk_size = chunk_size;
	
	let chunk_start = chunk_size*(worker_index);
	let chunk_end = cmp::min(chunk_start + chunk_size, total_pixels); //Total pixels may not divide evenly into number of worker cores.
		
	let try_acquire = |x: i32, y: i32| {
		// First, if we're out of bounds, return a dummy particle. Currently expected to be air or wall.
		if y < 0 {
			return Some(ParticleEnum::Inert(InertParticle::new(&world, world.wrapping_behaviour[0])))
		}
		if x < 0 {
			return Some(ParticleEnum::Inert(InertParticle::new(&world, world.wrapping_behaviour[3])))
		}
		if x as u32 > world_width {
			return Some(ParticleEnum::Inert(InertParticle::new(&world, world.wrapping_behaviour[1])))
		}
		if y as u32 > world_height {
			return Some(ParticleEnum::Inert(InertParticle::new(&world, world.wrapping_behaviour[2])))
		}
		
		if let Some(particle) = Particle::try_acquire(
			&world, 
			worker_id, 
			(world.simulation_window[0] + x as u32 + ((world.simulation_window[1] + y as u32) * world_width)) as usize
		) {
			Some(ParticleEnum::Live(particle))
		} else {
			None
		}
	};
	
	let global_tick = world.global_tick.load(Ordering::Relaxed);
	let particle_indices = chunk_start..chunk_end;
	if global_tick % 2 == 0 {
		for index in particle_indices {
			let (x, y) = i_to_xy(index as usize);
			process_particle(x, y, try_acquire)
		}
	} else {
		for index in particle_indices.rev() {
			let (x, y) = i_to_xy(index as usize);
			process_particle(x, y, try_acquire)
		}
	}
	
	world.worker_statuses[worker_index as usize]
		.store(WorkerStates::Idle as i32, Ordering::Release);
}

fn process_particle<ParticleGetter: Fn(i32, i32) -> Option<ParticleEnum<'static>>>(mut x: i32, mut y: i32, try_acquire: ParticleGetter) {
	let world = get_world();
	let global_tick = world.global_tick.load(Ordering::Relaxed);
	let local_tick = global_tick as u8;
	
	if let Some(mut primary) = try_acquire(x,y) {
		if primary.tick() == local_tick { return; } //Already processed but moved.
		match primary.r#type() {
			0 | 1 => { return; }, //void, wall
			2 => { //dust
				// Choose a sequence of X directions to try moving in before staying still.
				let directions: [i32; 3] = match prng(x, y, global_tick as u32) {
					0..3333 =>     [-1,  1,  0],
					3333..5000 =>  [ 0, -1,  1],
					5000..6666 =>  [ 0,  1, -1],
					6666..10000 => [ 1, -1,  0],
					_ => unreachable!("Bad PRNG return value."),
				};
				for directions in directions {
					if let Some(target) = try_acquire(x+directions, y+1) {
						if target.r#type() == 0 || target.r#type() == 3 { //TODO: Maybe something more general than type? Weight?
							primary.swap(&target);
							//js::log(format_args!("local tick: {} → {}", primary.tick(), local_tick));
							target.set_tick(local_tick);
							break;
						}
					}
				}
			},
			3 => {
				for iteration in 0..prng(x, y, global_tick as u32)/3334 {
					let directions: [i32; 3] = match prng(x, y, global_tick as u32) {
						0..3333 =>     [-1,  1,  0],
						3333..5000 =>  [ 0, -1,  1],
						5000..6666 =>  [ 0,  1, -1],
						6666..10000 => [ 1, -1,  0],
						_ => unreachable!("Bad PRNG return value."),
					};
					for directions in directions {
						let next_x = x + directions;
						let next_y = y - if iteration == 0 && prng(x, y, global_tick as u32) < 2000 { 1 } else { 0 };
						if let Some(target) = try_acquire(next_x, next_y) {
							if target.r#type() == 0 { //TODO: Maybe something more general than type? Weight?
								primary.swap(&primary);
								//js::log(format_args!("local tick: {} → {}", primary.tick(), local_tick));
								target.set_tick(local_tick);
								primary = target;
								x = next_x;
								y = next_y;
								break;
							}
						}
					}
				}
			}
			_ => panic!("unknown particle type")
		}	
	}
}

/// x/y coordinates to world index
fn _xy_to_i(x: i32, y: i32) -> usize {
	let x = u32::try_from(x).expect("x is negative, which is unsupported in xy_to_i.");
	let y = u32::try_from(y).expect("y is negative, which is unsupported in xy_to_i.");
	let world = get_world();
	let world_width = world.simulation_window[2] - world.simulation_window[0];
	(world.simulation_window[0] + x + ((world.simulation_window[1] + y) * world_width)) as usize
}

/// world index to x/y coordinates
fn i_to_xy(i: usize) -> (i32, i32) {
	let world = get_world();
	let world_width = world.simulation_window[2] - world.simulation_window[0];
	(
		(((i - world.simulation_window[0] as usize) % world_width as usize) as i32),
		(((i - world.simulation_window[1] as usize) / world_width as usize) - world.simulation_window[1] as usize) as i32,
	)
}

#[panic_handler]
unsafe fn panic(info: &PanicInfo) -> ! {
	unsafe {
		if let Some(location) = info.location() {
			// Does not support formatted panics right now.
			let message = info.message().as_str().unwrap_or("«unknown panic»");
			let file = location.file();
			abort(
				message.as_ptr() as usize,
				message.len(),
				file.as_ptr() as usize,
				file.len(),
				location.line(),
				location.column()
			);
		} else {
			abort(0, 0, 0, 0, 0, 0)
		}
	}
}
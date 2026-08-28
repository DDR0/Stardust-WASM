#![no_main]
#![no_std]

mod world;
mod particle;

use core::panic::PanicInfo;
use core::sync::atomic::Ordering;
use core::cmp;

use world::World;

use particle::Particle;
 
mod js {
	#[link(wasm_import_module = "imports")]
	unsafe extern "C" {
		pub fn abort(msgPtr: usize, msgLen: usize, filePtr: usize, fileLen: usize, line: u32, column: u32) -> !;
		pub fn _log_num(number: usize);
		pub fn _log_info(ptr: usize, len: usize);
		pub fn _log_str(ptr: usize, len: usize);
		pub fn _log_err(ptr: usize, len: usize);
		pub fn _wait_for(addr: u32, toHaveVal: i32);
	}
}

use js::*;

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
pub unsafe extern "C" fn run(worker_id: i32) {
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
		
	let try_acquire = |x: u32, y: u32| Particle::try_acquire(
		&world, 
		worker_id, 
		(world.simulation_window[0] + x + ((world.simulation_window[1] + y) * world_width)) as usize
	);
	
	for index in chunk_start .. chunk_end {
		let (x, y) = i_to_xy(index as usize);
		process_particle(x, y, try_acquire)
	}
	
	world.worker_statuses[worker_index as usize]
		.store(WorkerStates::Idle as i32, Ordering::Release);
}

fn process_particle<ParticleGetter: Fn(u32, u32) -> Option<Particle<'static>>>(x: u32, y: u32, try_acquire: ParticleGetter) {
	let world = get_world();
}

/// x/y coordinates to world index
fn xy_to_i(x: u32, y: u32) -> usize {
	let world = get_world();
	let world_width = world.simulation_window[2] - world.simulation_window[0];
	(world.simulation_window[0] + x + ((world.simulation_window[1] + y) * world_width)) as usize
}

/// world index to x/y coordinates
fn i_to_xy(i: usize) -> (u32, u32) {
	let world = get_world();
	let world_width = world.simulation_window[2] - world.simulation_window[0];
	(
		(((i - world.simulation_window[0] as usize) % world_width as usize) as u32),
		(((i - world.simulation_window[1] as usize) / world_width as usize) - world.simulation_window[1] as usize) as u32,
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
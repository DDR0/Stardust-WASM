#![no_main]
#![no_std]

mod world;
mod particle;

use core::panic::PanicInfo;
use core::ptr;
use core::sync::atomic::Ordering;
use core::cmp;

use world::World;

use particle::Particle;
 
mod js {
	#[link(wasm_import_module = "imports")]
	extern "C" {
		pub fn abort(msgPtr: usize, filePtr: usize, line: u32, column: u32) -> !;
		pub fn _log_num(number: usize);
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
fn get_world() -> &'static mut World {
	const WASM_MEMORY_STARTING_BYTE: usize = 1200000;
	const WORLD_POINTER: *mut World = WASM_MEMORY_STARTING_BYTE as *mut World;
	unsafe {
		&mut *WORLD_POINTER //Too short? Is this fine?
		//WORLD_POINTER.as_mut().expect("Failed to create pointer. (This should never happen.)") also works.
		//ptr::read(WASM_MEMORY_STARTING_BYTE as *const &mut World) doesn't work, returns *0.
	}
}

#[no_mangle]
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
	
	let total_pixels = (world.simulation_window[2] - world.simulation_window[0]) * (world.simulation_window[3] - world.simulation_window[0]);
	
	let mut chunk_size = total_pixels / world.total_workers;
	if chunk_size * world.total_workers < total_pixels {
		chunk_size += 1
	}
	let chunk_size = chunk_size;
	
	let chunk_start = chunk_size*(worker_index);
	let chunk_end = cmp::min(chunk_start + chunk_size, total_pixels); //Total pixels may not divide evenly into number of worker cores.
	//_log_num(chunk_start as usize);
	//_log_num(chunk_end as usize);
	
	let try_acquire = |index| Particle::try_acquire(world, worker_id, index);
	
	for index in chunk_start as usize .. chunk_end as usize {
		if let Some(_particle) = try_acquire(index) {
			// some stuff with the particle involving other particles
		}
	}
	
	world.worker_statuses[worker_index as usize]
		.store(WorkerStates::Idle as i32, Ordering::Release);
}

#[panic_handler]
unsafe fn panic(info: &PanicInfo) -> ! {
	if let Some(location) = info.location() { //`info.location` is always None.
		abort(
			info.message().as_str().unwrap_or("unknown panic") as *const str as *const () as usize,
			ptr::addr_of!(*location.file()) as *const() as usize,
			location.line(),
			location.column()
		);
	} else {
		abort(0, 0, 0, 0)
	}
}
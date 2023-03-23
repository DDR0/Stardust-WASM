#![no_main]
#![no_std]

use core::panic::PanicInfo;
use core::ptr;
use core::sync::atomic::{AtomicI32, Ordering};
use core::cmp;
 
mod js {
	#[link(wasm_import_module = "imports")]
	extern "C" {
		pub fn abort(msgPtr: usize, filePtr: usize, line: u32, column: u32) -> !;
		pub fn _log_num(number: usize);
		pub fn wait_for(addr: u32, toHaveVal: i32);
	}
}

use js::*;

const NULL_ID: i32 = 0;

//Define the shared world structure.
const WORLD_MAX_WIDTH: usize = 3840;
const WORLD_MAX_HEIGHT: usize = 2160;
const TOTAL_PIXELS: usize = WORLD_MAX_WIDTH * WORLD_MAX_HEIGHT; //max screen resolution
#[repr(C)] //C structs are padded by default, which is taken care of back in JS-land by rounding to the next BYTES_PER_ELEMENT.
struct World {
	//Some global configuration.
	global_lock:         AtomicI32, //Global lock for all world data, so we can resize the world. Also acts as a "pause" button. Bool, but atomic operations like i32.
	global_tick:         AtomicI32, //Current global tick.
	worker_statuses:    [AtomicI32; 256], //Used by workers, last one to finish increments tick.
	total_workers:       u32, //constant
	simulation_size:    [u32; 2], //width/height - protected by global_lock
	wrapping_behaviour: [u8 ; 4], //top, left, bottom, right: Set to particle type 0 or 1.
	
	//Particle attribute arrays.
	locks:        [AtomicI32; TOTAL_PIXELS], //Is this particle locked for processing? 0=no, >0 = logic worker, -1 = main thread, -2 = render worker. Under the WASM shared memory model, atomic reads/writes use I believe "AcqRel" semantics, that is, acting as an MFENCE for all previous writes. We use this to lock all particles we're processing, muck around with faster reads/writes, then release and have everything synced. Both reading and writing will take a lock, so uncached writes *should* never be observed by another worker.
	types:        [u8       ; TOTAL_PIXELS],
	ticks:        [u8       ; TOTAL_PIXELS], //Used for is_new_tick. Stores whether last tick processed was even or odd. If this doesn't match the current tick, we know to advance the particle simulation one step.
	stages:       [u8       ; TOTAL_PIXELS], //Particle processing step. Usually 0 = hasn't moved yet, 1 = can't move, >2 = done.
	colours:      [u32      ; TOTAL_PIXELS], //This is copied directly to canvas.
	velocity_xs:  [f32      ; TOTAL_PIXELS],
	velocity_ys:  [f32      ; TOTAL_PIXELS],
	subpixel_xs:  [f32      ; TOTAL_PIXELS], //Position comes in through x/y coordinate on screen, but this does not capture subpixel position for slow-moving particles.
	subpixel_ys:  [f32      ; TOTAL_PIXELS],
	masses:       [f32      ; TOTAL_PIXELS],
	temperatures: [f32      ; TOTAL_PIXELS], //°C
	scratch_a:    [u64      ; TOTAL_PIXELS], //internal state for the particle
	scratch_b:    [u64      ; TOTAL_PIXELS],
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
pub unsafe extern fn run(worker_id: i32) {
	debug_assert!(worker_id >= 1, "Bad worker_id passed in, too small.");
	let world = get_world();
	_log_num(world as *const World as usize);
	_log_num(&world.global_lock as *const AtomicI32 as usize);
	wait_for((&world.global_lock as *const AtomicI32 as usize).try_into().unwrap(), 0); //WASM is at the moment guaranteed to only have u32 pointers, so this unwrap should always succeed as per the spec.
	
	world.worker_statuses[worker_id as usize].store(1, Ordering::Release);
	
	let total_pixels = world.simulation_size[0] * world.simulation_size[1];
	
	let mut chunk_size = total_pixels / world.total_workers;
	if chunk_size * world.total_workers < total_pixels {
		chunk_size += 1
	}
	let chunk_size = chunk_size;
	
	let chunk_start = chunk_size*(worker_id as u32 - 1);
	let chunk_end = cmp::min(chunk_start + chunk_size, total_pixels); //Total pixels may not divide evenly into number of worker cores.
	
	for n in chunk_start as usize .. chunk_end as usize {
		if let Ok(_) = world.locks[n].compare_exchange(
			NULL_ID, 
			worker_id, 
			Ordering::SeqCst, 
			Ordering::SeqCst
		) {
			world.scratch_a[n] += 1;
			world.locks[n].store(NULL_ID, Ordering::SeqCst);
		}
	}
	
	world.worker_statuses[worker_id as usize].store(0, Ordering::Release);
}

#[panic_handler]
unsafe fn panic(info: &PanicInfo) -> ! {
	if let Some(location) = info.location() { //`info.location` is always None.
			abort(
				ptr::addr_of!(**info.payload().downcast_ref::<&str>().unwrap_or(&"unknown panic")) as *const() as usize,
				ptr::addr_of!(*location.file()) as *const() as usize,
				location.line(),
				location.column()
			);
	} else {
		abort(0, 0, 0, 0)
	}
}
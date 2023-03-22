#![no_main]
#![no_std]

use core::panic::PanicInfo;
use core::ptr;
use core::sync::atomic::{AtomicI32, Ordering};
 
mod js {
	#[link(wasm_import_module = "imports")]
	extern "C" {
		pub fn _log_num(number: usize);
		pub fn abort(msgPtr: usize, filePtr: usize, line: u32, column: u32) -> !;
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
	global_lock:       AtomicI32, //Global lock for all world data, so we can resize the world. Also acts as a "pause" button. Bool, but atomic operations like i32.
	global_tick:       AtomicI32, //Current global tick.
	workers_running:   AtomicI32, //Used by workers, last one to finish increments tick.
	simulation_size:    [u32; 2], //width/height
	wrapping_behaviour: [u8 ; 4], //top, left, bottom, right: Set to particle type 0 or 1.
	
	//Particle attribute arrays.
	locks:        [AtomicI32; TOTAL_PIXELS], //Is this particle locked for processing? 0=no, >0 = logic worker, -1 = main thread, -2 = render worker. Under the WASM shared memory model, atomic reads/writes use I believe "AcqRel" semantics, that is, acting as an MFENCE for all previous writes. We use this to lock all particles we're processing, muck around with faster reads/writes, then release and have everything synced. Both reading and writing will take a lock, so uncached writes *should* never be observed by another worker.
	types:        [u8      ; TOTAL_PIXELS],
	ticks:        [u8      ; TOTAL_PIXELS], //Used for is_new_tick. Stores whether last tick processed was even or odd. If this doesn't match the current tick, we know to advance the particle simulation one step.
	stages:       [u8      ; TOTAL_PIXELS], //Particle processing step. Usually 0 = hasn't moved yet, 1 = can't move, >2 = done.
	colours:      [u32     ; TOTAL_PIXELS], //This is copied directly to canvas.
	velocity_xs:  [f32     ; TOTAL_PIXELS],
	velocity_ys:  [f32     ; TOTAL_PIXELS],
	subpixel_xs:  [f32     ; TOTAL_PIXELS], //Position comes in through x/y coordinate on screen, but this does not capture subpixel position for slow-moving particles.
	subpixel_ys:  [f32     ; TOTAL_PIXELS],
	masses:       [f32     ; TOTAL_PIXELS],
	temperatures: [f32     ; TOTAL_PIXELS], //°C
	scratch_a:    [u64     ; TOTAL_PIXELS], //internal state for the particle
	scratch_b:    [u64     ; TOTAL_PIXELS],
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
	let mut world = get_world();
	//_log_num(world as *const World as usize);
	for n in 0..3 {
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
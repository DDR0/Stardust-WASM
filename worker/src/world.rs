use core::sync::atomic::{AtomicI32, AtomicU8, AtomicU32, AtomicU64};

//Define the shared world structure. Make sure JS defines this the same way! [1CLsom]
const WORLD_MAX_WIDTH: usize = 3840;
const WORLD_MAX_HEIGHT: usize = 2160;
const TOTAL_PIXELS: usize = WORLD_MAX_WIDTH * WORLD_MAX_HEIGHT; //max screen resolution

#[repr(C)] //C structs are padded by default, which is taken care of back in JS-land by rounding to the next BYTES_PER_ELEMENT.
pub struct World {
	//Some global configuration.
	pub global_lock: AtomicI32, //Global lock for all world data, so we can resize the world. Also acts as a "pause" button. Bool, but atomic operations like i32.
	pub global_tick: AtomicI32, //Current global tick.
	pub worker_statuses: [AtomicI32; 248], //Used by workers, last one to finish increments tick.
	pub total_workers: u32, //constant
	pub simulation_window: [u32; 4], //x/y/width/height - protected by global_lock
	pub wrapping_behaviour: [u8 ; 4], //top, left, bottom, right: Set to particle type 0 or 1.
	
	//Particle attribute arrays.
	pub locks:        [AtomicI32; TOTAL_PIXELS], //Is this particle locked for processing? 0=no, >0 = logic worker, -1 = main thread, -2 = render worker. Under the WASM shared memory model, atomic reads/writes use I believe "AcqRel" semantics, that is, acting as an MFENCE for all previous writes. We use this to lock all particles we're processing, muck around with faster reads/writes, then release and have everything synced. Both reading and writing will take a lock, so uncached writes *should* never be observed by another worker.
	pub types:        [AtomicU8 ; TOTAL_PIXELS],
	pub ticks:        [AtomicU8 ; TOTAL_PIXELS], //Used for is_new_tick. Stores whether last tick processed was even or odd. If this doesn't match the current tick, we know to advance the particle simulation one step.
	pub stages:       [AtomicU8 ; TOTAL_PIXELS], //Particle processing step. Usually 0 = hasn't moved yet, 1 = can't move, >2 = done.
	pub colours:      [AtomicU32; TOTAL_PIXELS], //This is copied directly to canvas.
	pub velocity_xs:  [AtomicU32; TOTAL_PIXELS], //Used as f32.
	pub velocity_ys:  [AtomicU32; TOTAL_PIXELS], //Used as f32.
	pub subpixel_xs:  [AtomicU32; TOTAL_PIXELS], //Used as f32. Position comes in through x/y coordinate on screen, but this does not capture subpixel position for slow-moving particles.
	pub subpixel_ys:  [AtomicU32; TOTAL_PIXELS], //Used as f32.
	pub temperatures: [AtomicU32; TOTAL_PIXELS], //Used as f32. °C
	pub scratch_a:    [AtomicU64; TOTAL_PIXELS], //internal state for the particle
	pub scratch_b:    [AtomicU64; TOTAL_PIXELS],
}
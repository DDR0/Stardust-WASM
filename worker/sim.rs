#![no_main]
#![no_std]

use core::cmp;
use core::panic::PanicInfo;
use core::ptr;
use core::sync::atomic::{AtomicI32, Ordering};

mod js {
    #[link(wasm_import_module = "imports")]
    extern "C" {
        pub fn abort(msgPtr: usize, filePtr: usize, line: u32, column: u32) -> !;
        pub fn _log_num(number: usize);
    }
}

use js::*;

#[repr(C)] //C structs are padded by default, which is taken care of back in JS-land by rounding to the next BYTES_PER_ELEMENT.
struct World {
    global_tick: AtomicI32,          //Current global tick.
    worker_statuses: [AtomicI32; 3], //Used by workers, last one to finish increments tick.
    scratch_a: [u64; 300],           //internal state for the particle
}

#[inline]
fn get_world() -> &'static mut World {
    const WASM_MEMORY_STARTING_BYTE: usize = 1200000;
    const WORLD_POINTER: *mut World = WASM_MEMORY_STARTING_BYTE as *mut World;
    unsafe {
        &mut *WORLD_POINTER //Too short? Is this fine? WORLD_POINTER.as_mut().expect("Failed to create pointer. (This should never happen.)") also works.
    }
}

#[no_mangle]
pub unsafe extern "C" fn run(worker_id: i32) {
    let worker_index = worker_id as u32 - 1;
    let world = get_world();
    //_log_num(world as *const World as usize);

    //Mark this worker as started.
    world.worker_statuses[worker_index as usize].store(1, Ordering::Release);

    const TOTAL_PIXELS: u32 = 300;
    const TOTAL_WORKERS: u32 = 3;
    const CHUNK_SIZE: u32 = TOTAL_PIXELS / TOTAL_WORKERS;

    let chunk_start = CHUNK_SIZE * (worker_index);
    let chunk_end = cmp::min(chunk_start + CHUNK_SIZE, TOTAL_PIXELS); //Total pixels may not divide evenly into number of worker cores.
   
    //_log_num(chunk_start as usize); //Uncomment to see what ranges are being iterated by whom.
    //_log_num(chunk_end as usize);   //Prints as a pair like `sim 1: number 0` and `sim 1: number 100` in the console.

    //For each value we're responsible for, increment it by 1.
    for n in chunk_start as usize..chunk_end as usize {
        world.scratch_a[n] += 1;
    }

    //Mark this worker as finished. Should sync all previously written data in this memory model, as I understand it.
    world.worker_statuses[worker_index as usize].store(0, Ordering::Release);
}

#[panic_handler]
unsafe fn panic(info: &PanicInfo) -> ! {
    if let Some(location) = info.location() {
        //`info.location` is always None.
        abort(
            ptr::addr_of!(**info
                .payload()
                .downcast_ref::<&str>()
                .unwrap_or(&"unknown panic")) as *const () as usize,
            ptr::addr_of!(*location.file()) as *const () as usize,
            location.line(),
            location.column(),
        );
    } else {
        abort(0, 0, 0, 0)
    }
}

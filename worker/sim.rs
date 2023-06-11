#![no_main]
#![no_std]

use core::panic::PanicInfo;
use js::*;

mod js {
    #[link(wasm_import_module = "imports")]
    extern "C" {
        pub fn abort(msgPtr: usize, filePtr: usize, line: u32, column: u32) -> !;
        pub fn _log_num(number: usize);
    }
}

#[no_mangle]
pub unsafe extern "C" fn run(worker_id: i32) {
    let worker_index = worker_id as u32 - 1;
    let chunk_start = 100 * worker_index;
    let chunk_end = chunk_start + 100; //Total pixels may not divide evenly into number of worker cores.
    for n in chunk_start as usize..chunk_end as usize {
        _log_num(n);
    }
}

#[panic_handler]
unsafe fn panic(_: &PanicInfo) -> ! { abort(0, 0, 0, 0) }

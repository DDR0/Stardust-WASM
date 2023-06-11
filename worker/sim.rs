#![no_main]
#![no_std]

use core::panic::PanicInfo;
use core::ptr;

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
   
    //_log_num(chunk_start as usize); //Uncomment to see what ranges are being iterated by whom.
    //_log_num(chunk_end as usize);   //Prints as a pair like `sim 1: number 0` and `sim 1: number 100` in the console.

    //For each value we're responsible for, increment it by 1.
    for n in chunk_start as usize..chunk_end as usize {
        _log_num(n);
    }
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

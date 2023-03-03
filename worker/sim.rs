#![no_main]
#![no_std]

use core::panic::PanicInfo;
use core::ptr::addr_of;
 
mod js {
	#[link(wasm_import_module = "imports")]
	extern "C" {
		pub fn _logNum(_: usize);
		pub fn abort(msgPtr: usize, filePtr: usize, line: u32, column: u32) -> !;
		
		pub fn wScratchA(index: usize, value: u64);
		pub fn waScratchA(index: u32, value: u64);
	}
}

use js::*;

//#![wasm_import_memory] only in wasm-bindgen

#[no_mangle]
pub extern fn sum(x: i32, y: i32) -> i32 {
	x + y
}

#[no_mangle]
pub unsafe extern fn run() {
	for n in 100000..200000 {
		waScratchA(n, u64::MAX-(n as u64))
	}
}

#[panic_handler]
unsafe fn panic(info: &PanicInfo) -> ! {
	if let Some(location) = info.location() {
			js::abort(
				addr_of!(**info.payload().downcast_ref::<&str>().unwrap_or(&"unknown panic")) as *const() as usize,
				addr_of!(*location.file()) as *const() as usize,
				location.line(),
				location.column()
			);
	} else {
		js::abort(0, 0, 0, 0)
	}
}
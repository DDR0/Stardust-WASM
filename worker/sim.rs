#![no_main]
#![no_std]

use core::panic::PanicInfo;
use core::ptr::addr_of;
use core::mem::forget;
 
mod js {
	#[link(wasm_import_module = "imports")]
	extern "C" {
		pub fn _logNum(_: usize);
		pub fn abort(msgPtr: usize, filePtr: usize, line: u32, column: u32) -> !;
		
		pub fn wScratchA(index: u32, value: u64);
		pub fn waScratchA(index: u32, value: u64);
	}
}

use js::*;

#[no_mangle]
pub extern fn fwaScratchA(index: u32, value: u64) {
	let _ = value + (index as u64);
}

#[no_mangle]
pub unsafe extern fn runW() {
	for n in 10000..20000 {
		waScratchA(n, u64::MAX-(n as u64))
	}
}

#[no_mangle]
pub unsafe extern fn runWA() {
	for n in 10000..20000 {
		wScratchA(n, u64::MAX-(n as u64))
	}
}

#[no_mangle]
pub unsafe extern fn runFWA() {
	for n in 10000..20000 {
		fwaScratchA(n, u64::MAX-(n as u64))
	}
}

#[no_mangle]
pub unsafe extern fn leakMem(n_mb: u32) { //could also be in pages? But I don't think we're aligned anyhow?
	for _ in 0..n_mb {
		let array: [u64; 16384] = [0; 16384];
		forget(array);
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
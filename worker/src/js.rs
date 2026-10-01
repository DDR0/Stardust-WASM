#[link(wasm_import_module = "imports")]
unsafe extern "C" {
	pub fn abort(msgPtr: usize, msgLen: usize, filePtr: usize, fileLen: usize, line: u32, column: u32) -> !;
	#[allow(dead_code)]
	pub fn log_num(number: usize);
	pub fn log_info(ptr: usize, len: usize);
	pub fn log_str(ptr: usize, len: usize);
	pub fn log_err(ptr: usize, len: usize);
	#[allow(dead_code)]
	pub fn wait_for(addr: u32, toHaveVal: i32);
}

use core::fmt::{Write, write, Result, Arguments};

struct Info;
struct Log;
struct Error;

impl Write for Info {
	fn write_str(&mut self, s: &str) -> Result {
		unsafe { log_info(s.as_ptr() as usize, s.len()); }
		Ok(())
	}
}
impl Write for Log {
	fn write_str(&mut self, s: &str) -> Result {
		unsafe { log_str(s.as_ptr() as usize, s.len()); }
		Ok(())
	}
}
impl Write for Error {
	fn write_str(&mut self, s: &str) -> Result {
		unsafe { log_err(s.as_ptr() as usize, s.len()); }
		Ok(())
	}
}

const NEWLINE: char = '\n';
#[allow(dead_code)]
pub fn info(args: Arguments) {
	let mut i = Info;
	write(&mut i, args).ok();
	unsafe { log_info(&NEWLINE as *const char as usize, 1); }
}
#[allow(dead_code)]
pub fn log(args: Arguments) {
	let mut l = Log;
	write(&mut l, args).ok();
	unsafe { log_info(&NEWLINE as *const char as usize, 1); }
}
#[allow(dead_code)]
pub fn error(args: Arguments) {
	let mut e = Error;
	write(&mut e, args).ok();
	unsafe { log_info(&NEWLINE as *const char as usize, 1); }
}
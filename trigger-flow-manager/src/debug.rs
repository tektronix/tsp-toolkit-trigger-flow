// Flip to true to re-enable hot-path println!s that format with `{:?}` or
// print full serialized payloads. Kept off by default so release builds do
// not pay the formatting cost on every request.
pub const DEBUG: bool = false;

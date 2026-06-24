// Gate for hot-path console logs. Off by default to avoid GC stalls from
// large objects retained by console when DevTools is closed.
export const DEBUG = false;

export function throws(f: () => void, message?: string): void {
  let thrown = false;
  try {
    f();
  } catch (e) {
    thrown = true;
  }
  if (!thrown) {
    throw new Error(
      message || `Expected \`${funcToString(f)}\` to throw, but it did not.`
    );
  }
}
function funcToString(f: Function) {
  // index_ts_1.funcname()
  return f
    .toString()
    .replace(/[a-zA-Z0-9]+_(ts|js)_[0-9]+\./g, "")
    .replace(/\s+/g, " ");
}

// Windows runners in GitHub Actions are run as Administrators with developer mode enabled.
// This file makes it possible to emulate non-administrators running in non-developer mode even in GitHub Actions.

const fs = require("fs")

const isPlatformWindows = process.platform === "win32"

/**
 * @param {Parameters<typeof fs.symlinkSync>[2]} type
 */
function isSymlinkAllowed(type) {
  return !isPlatformWindows || type === "junction"
}

const origSymlinkSync = fs.symlinkSync
const origSymlink = fs.promises.symlink

function symlinkBlockedError(path) {
  /** @type {NodeJS.ErrnoException} */
  const err = new Error("Non-junction symlinks are blocked in this test to emulate Windows non-developer mode. Catch this error and fall back to junctions to allow Windows users who have not enabled developer mode to create symlinks.")
  err.code = "EPERM"
  err.path = path
  return err
}

fs.symlinkSync = /** @type {typeof fs.symlinkSync} */ (target, path, type) => {
  if (isSymlinkAllowed(type)) return origSymlinkSync(target, path, type)
  throw symlinkBlockedError(path)
};

fs.symlinkSync.original = origSymlinkSync
fs.symlinkSync.tookOver = true

fs.promises.symlink = /** @type {typeof fs.promises.symlink} */ (target, path, type) => {
  if (isSymlinkAllowed(type)) return origSymlink(target, path, type)
  return Promise.reject(symlinkBlockedError(path))
};

fs.promises.symlink.original = origSymlink
fs.promises.symlink.tookOver = true

globalThis.symlinkBlockedInWindows = true

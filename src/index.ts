import { betterPathResolve } from 'better-path-resolve'
import { promises as fs, symlinkSync, mkdirSync, readlinkSync, unlinkSync } from 'fs'
import { types } from 'util'
import pathLib from 'path'
import { renameOverwrite, renameOverwriteSync } from 'rename-overwrite'

interface SymlinkDirOptions {
  overwrite?: boolean
  noJunction?: boolean
}

const IS_WINDOWS = process.platform === 'win32' || /^(msys|cygwin)$/.test(process.env.OSTYPE as string)

function resolveSrcOnWinJunction (src: string) {
  return `${src}\\`
}

function resolveSrcOnTrueSymlink (src: string, dest: string) {
  return pathLib.relative(pathLib.dirname(dest), src)
}

export function symlinkDir (target: string, path: string, opts?: SymlinkDirOptions): Promise<{ reused: boolean, warn?: string }> {
  path = betterPathResolve(path)
  target = betterPathResolve(target)

  if (target === path) throw new Error(`Symlink path is the same as the target path (${target})`)

  return forceSymlink(target, path, opts)
}

export function symlinkDirSync (target: string, path: string, opts?: SymlinkDirOptions): { reused: boolean, warn?: string } {
  path = betterPathResolve(path)
  target = betterPathResolve(target)

  if (target === path) throw new Error(`Symlink path is the same as the target path (${target})`)

  return forceSymlinkSync(target, path, opts)
}

function isExistingSymlinkUpToDate (wantedTarget: string, path: string, linkString: string): boolean {
  // path is going to be that of the symlink, so never be a (drive) root, therefore dirname(path) is different from path
  const existingTarget = pathLib.isAbsolute(linkString) ? linkString : pathLib.join(pathLib.dirname(path), linkString)
  return pathLib.relative(wantedTarget, existingTarget) === ''
}

let createSymlinkAsync!: (target: string, path: string) => Promise<void>
let createSymlinkSync!: (target: string, path: string) => void

if (IS_WINDOWS) {
  // Falls back to "junctions" on Windows if "symbolic links" is disallowed. Even though support for "symbolic links" was added in Vista+, users by default
  // lack permission to create them
  createSymlinkAsync = async (target: string, path: string) => {
    try {
      await createTrueSymlinkAsync(target, path)
      createSymlinkSync = createTrueSymlinkSync
      createSymlinkAsync = createTrueSymlinkAsync
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EPERM') {
        await createJunctionAsync(target, path)
        createSymlinkSync = createJunctionSync
        createSymlinkAsync = createJunctionAsync
      } else {
        throw err
      }
    }
  }
  createSymlinkSync = (target: string, path: string) => {
    try {
      createTrueSymlinkSync(target, path)
      createSymlinkSync = createTrueSymlinkSync
      createSymlinkAsync = createTrueSymlinkAsync
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EPERM') {
        createJunctionSync(target, path)
        createSymlinkSync = createJunctionSync
        createSymlinkAsync = createJunctionAsync
      } else {
        throw err
      }
    }
  }
} else {
  createSymlinkAsync = createTrueSymlinkAsync
  createSymlinkSync = createTrueSymlinkSync
}

function createTrueSymlinkAsync (target: string, path: string) {
  return fs.symlink(resolveSrcOnTrueSymlink(target, path), path, 'dir')
}
function createTrueSymlinkSync (target: string, path: string) {
  symlinkSync(resolveSrcOnTrueSymlink(target, path), path, 'dir')
}

function createJunctionAsync (target: string, path: string) {
  return fs.symlink(resolveSrcOnWinJunction(target), path, 'junction')
}
function createJunctionSync (target: string, path: string) {
  symlinkSync(resolveSrcOnWinJunction(target), path, 'junction')
}

// Windows leaves a path another process has just created or unlinked
// unavailable for a moment, answering EPERM, EACCES or EBUSY where a
// definitive answer is due elsewhere. `rename-overwrite` already waits these
// out on a rename, and a read of the same path needs it for the same reason:
// without it a link a concurrent writer is still holding is taken for
// something that is not a link at all.
//
// EPERM and EACCES also carry the permanent case, a path the user may not read
// at all, which no amount of waiting will change. They get a second rather
// than a minute so a real denial still surfaces promptly. EBUSY only ever
// means a handle is open, so it keeps the full budget.
const TRANSIENT_REFUSAL_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
const PERMISSION_REFUSAL_CODES = new Set(['EPERM', 'EACCES'])
const REFUSAL_BUDGET_MS = 60000
const PERMISSION_REFUSAL_BUDGET_MS = 1000
const MAX_BACKOFF_MS = 100

function refusalCode (err: unknown): string | undefined {
  if (!IS_WINDOWS || !types.isNativeError(err) || !('code' in err)) return undefined
  const code = (err as NodeJS.ErrnoException).code as string
  return TRANSIENT_REFUSAL_CODES.has(code) ? code : undefined
}

// The deadline shrinks to whichever of the refusals seen so far allows the
// least, so one EPERM caps the wait even if an EBUSY came first.
function budgetFor (code: string): number {
  return PERMISSION_REFUSAL_CODES.has(code) ? PERMISSION_REFUSAL_BUDGET_MS : REFUSAL_BUDGET_MS
}

async function readlinkWaitingOutARefusal (path: string): Promise<string> {
  const started = Date.now()
  let deadline = Number.POSITIVE_INFINITY
  let backoff = 0
  while (true) {
    try {
      return await fs.readlink(path)
    } catch (err) {
      const code = refusalCode(err)
      if (code == null) throw err
      deadline = Math.min(deadline, started + budgetFor(code))
      if (Date.now() >= deadline) throw err
      await new Promise<void>((resolve) => setTimeout(resolve, backoff))
      backoff = Math.min(backoff + 10, MAX_BACKOFF_MS)
    }
  }
}

function readlinkSyncWaitingOutARefusal (path: string): string {
  const started = Date.now()
  let deadline = Number.POSITIVE_INFINITY
  let backoff = 0
  while (true) {
    try {
      return readlinkSync(path)
    } catch (err) {
      const code = refusalCode(err)
      if (code == null) throw err
      deadline = Math.min(deadline, started + budgetFor(code))
      if (Date.now() >= deadline) throw err
      sleepSync(backoff)
      backoff = Math.min(backoff + 10, MAX_BACKOFF_MS)
    }
  }
}

// `Atomics.wait` parks the thread. Polling `Date.now()` in a loop would hold a
// core for as long as the refusal lasts.
function sleepSync (ms: number): void {
  if (ms === 0) return
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Creates a symlink. Re-link if a symlink already exists at the supplied
 * srcPath. API compatible with [`fs#symlink`](https://nodejs.org/api/fs.html#fs_fs_symlink_srcpath_dstpath_type_callback).
 */
interface ForceSymlinkOptions extends SymlinkDirOptions {
  renameTried?: boolean
  vanishedRetried?: boolean
}

async function forceSymlink (
  target: string,
  path: string,
  opts?: ForceSymlinkOptions
): Promise<{ reused: boolean, warn?: string }> {
  let initialErr: Error
  try {
    if (opts?.noJunction === true) {
      await createTrueSymlinkAsync(target, path)
    } else {
      await createSymlinkAsync(target, path)
    }
    return { reused: false }
  } catch (err) {
    switch ((err as NodeJS.ErrnoException).code) {
      case 'ENOENT':
        try {
          await fs.mkdir(pathLib.dirname(path), { recursive: true })
        } catch (mkdirError) {
          mkdirError.message = `Error while trying to symlink "${target}" to "${path}". ` +
            `The error happened while trying to create the parent directory for the symlink target. ` +
            `Details: ${mkdirError}`
          throw mkdirError
        }
        await forceSymlink(target, path, opts)
        return { reused: false }
      case 'EEXIST':
      case 'EISDIR':
        initialErr = err
        // If the target file already exists then we proceed.
        // Additional checks are done below.
        break
      default:
        throw err
    }
  }

  let linkString: string
  try {
    linkString = await readlinkWaitingOutARefusal(path)
  } catch (err) {
    if (opts?.overwrite === false) {
      throw initialErr
    }
    // path is not a link
    const parentDir = pathLib.dirname(path)
    let warn!: string
    if (opts?.renameTried) {
      // This is needed in order to fix a mysterious bug that sometimes happens on macOS.
      // It is hard to reproduce and is described here: https://github.com/pnpm/pnpm/issues/5909#issuecomment-1400066890
      await fs.unlink(path)
      warn = `Symlink wanted name was occupied by directory or file. Old entity removed: "${parentDir}${pathLib.sep}{${pathLib.basename(path)}".`
    } else {
      const ignore = `.ignored_${pathLib.basename(path)}`
      try {
        await renameOverwrite(path, pathLib.join(parentDir, ignore))
      } catch (error) {
        if (!types.isNativeError(error) || !('code' in error) || error.code !== 'ENOENT') {
          throw error
        }
        // `renameOverwrite` reports ENOENT only when `path` itself is gone, so
        // the conflict `initialErr` describes has already been cleared by
        // whoever won the race for it. Reissue the create instead of reporting
        // a conflict with something that is no longer there. Once only: a path
        // this can neither create at nor find anything at surfaces its error.
        if (opts?.vanishedRetried) throw initialErr
        return await forceSymlink(target, path, { ...opts, vanishedRetried: true })
      }

      warn = `Symlink wanted name was occupied by directory or file. Old entity moved: "${parentDir}${pathLib.sep}{${pathLib.basename(path)} => ${ignore}".`
    }

    return {
      ...await forceSymlink(target, path, { ...opts, renameTried: true }),
      warn,
    }
  }

  if (isExistingSymlinkUpToDate(target, path, linkString)) {
    return { reused: true }
  }
  if (opts?.overwrite === false) {
    throw initialErr
  }
  try {
    await fs.unlink(path)
  } catch (error) {
    if (!types.isNativeError(error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
  }
  return await forceSymlink(target, path, opts)
}

function forceSymlinkSync (
  target: string,
  path: string,
  opts?: ForceSymlinkOptions
): { reused: boolean, warn?: string } {
  let initialErr: Error
  try {
    if (opts?.noJunction === true) {
      createTrueSymlinkSync(target, path)
    } else {
      createSymlinkSync(target, path)
    }
    return { reused: false }
  } catch (err) {
    initialErr = err
    switch ((err as NodeJS.ErrnoException).code) {
      case 'ENOENT':
        try {
          mkdirSync(pathLib.dirname(path), { recursive: true })
        } catch (mkdirError) {
          mkdirError.message = `Error while trying to symlink "${target}" to "${path}". ` +
            `The error happened while trying to create the parent directory for the symlink target. ` +
            `Details: ${mkdirError}`
          throw mkdirError
        }
        forceSymlinkSync(target, path, opts)
        return { reused: false }
      case 'EEXIST':
      case 'EISDIR':
        // If the target file already exists then we proceed.
        // Additional checks are done below.
        break
      default:
        throw err
    }
  }

  let linkString: string
  try {
    linkString = readlinkSyncWaitingOutARefusal(path)
  } catch (err) {
    if (opts?.overwrite === false) {
      throw initialErr
    }
    // path is not a link
    const parentDir = pathLib.dirname(path)
    let warn!: string
    if (opts?.renameTried) {
      // This is needed in order to fix a mysterious bug that sometimes happens on macOS.
      // It is hard to reproduce and is described here: https://github.com/pnpm/pnpm/issues/5909#issuecomment-1400066890
      unlinkSync(path)
      warn = `Symlink wanted name was occupied by directory or file. Old entity removed: "${parentDir}${pathLib.sep}{${pathLib.basename(path)}".`
    } else {
      const ignore = `.ignored_${pathLib.basename(path)}`
      try {
        renameOverwriteSync(path, pathLib.join(parentDir, ignore))
      } catch (error) {
        if (!types.isNativeError(error) || !('code' in error) || error.code !== 'ENOENT') {
          throw error
        }
        // See the matching branch in `forceSymlink`.
        if (opts?.vanishedRetried) throw initialErr
        return forceSymlinkSync(target, path, { ...opts, vanishedRetried: true })
      }
      warn = `Symlink wanted name was occupied by directory or file. Old entity moved: "${parentDir}${pathLib.sep}{${pathLib.basename(path)} => ${ignore}".`
    }

    return {
      ...forceSymlinkSync(target, path, { ...opts, renameTried: true }),
      warn,
    }
  }

  if (isExistingSymlinkUpToDate(target, path, linkString)) {
    return { reused: true }
  }
  if (opts?.overwrite === false) {
    throw initialErr
  }
  try {
    unlinkSync(path)
  } catch (error) {
    if (!types.isNativeError(error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
  }
  return forceSymlinkSync(target, path, opts)
}

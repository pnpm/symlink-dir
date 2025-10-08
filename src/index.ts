import betterPathResolve = require('better-path-resolve')
import { promises as fs, symlinkSync, mkdirSync, readlinkSync, unlinkSync } from 'fs'
import util = require('util')
import pathLib = require('path')
import renameOverwrite = require('rename-overwrite')

interface SymlinkDirOptions {
  overwrite?: boolean
  noJunction?: boolean
}

const IS_WINDOWS = process.platform === 'win32' || /^(msys|cygwin)$/.test(<string>process.env.OSTYPE)

function resolveSrcOnWinJunction (target: string, path: string) {
  return `${pathLib.isAbsolute(target) ? target : pathLib.join(pathLib.dirname(path), target)}\\`
}

function symlinkDir (target: string, path: string, opts?: SymlinkDirOptions): Promise<{ reused: boolean, warn?: string }> {
  path = betterPathResolve(path)

  if (betterPathResolve(target) === path) throw new Error(`Symlink path is the same as the target path (${target})`)

  return forceSymlink(target, path, opts)
}

function isExistingSymlinkUpToDate (wantedTarget: string, path: string, linkString: string): boolean {
  if (wantedTarget === linkString) return true
  // path is going to be that of the symlink, so never be a (drive) root, therefore dirname(path) is different from path
  const existingTarget = pathLib.isAbsolute(linkString) ? linkString : pathLib.join(pathLib.dirname(path), linkString)
  const wantedTargetAbsolute = pathLib.isAbsolute(wantedTarget) ? wantedTarget : pathLib.join(pathLib.dirname(path), wantedTarget)
  return pathLib.relative(wantedTargetAbsolute, existingTarget) === ''
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
      if ((<NodeJS.ErrnoException>err).code === 'EPERM') {
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
      if ((<NodeJS.ErrnoException>err).code === 'EPERM') {
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
  return fs.symlink(target, path, 'dir')
}
function createTrueSymlinkSync (target: string, path: string) {
  symlinkSync(target, path, 'dir')
}

function createJunctionAsync (target: string, path: string) {
  return fs.symlink(resolveSrcOnWinJunction(target, path), path, 'junction')
}
function createJunctionSync (target: string, path: string) {
  symlinkSync(resolveSrcOnWinJunction(target, path), path, 'junction')
}

/**
 * Creates a symlink. Re-link if a symlink already exists at the supplied
 * srcPath. API compatible with [`fs#symlink`](https://nodejs.org/api/fs.html#fs_fs_symlink_srcpath_dstpath_type_callback).
 */
interface ForceSymlinkOptions extends SymlinkDirOptions {
  renameTried?: boolean
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
    switch ((<NodeJS.ErrnoException>err).code) {
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
    linkString = await fs.readlink(path)
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
        if (util.types.isNativeError(error) && 'code' in error && error.code === 'ENOENT') {
          throw initialErr
        }
        throw error
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
    if (!util.types.isNativeError(error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
  }
  return await forceSymlink(target, path, opts)
}

// for backward compatibility
symlinkDir['default'] = symlinkDir

export = symlinkDir

namespace symlinkDir {
  export function sync (target: string, path: string, opts?: SymlinkDirOptions): { reused: boolean, warn?: string } {
    path = betterPathResolve(path)

    if (betterPathResolve(target) === path) throw new Error(`Symlink path is the same as the target path (${target})`)

    return forceSymlinkSync(target, path, opts)
  }
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
    switch ((<NodeJS.ErrnoException>err).code) {
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
    linkString = readlinkSync(path)
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
        renameOverwrite.sync(path, pathLib.join(parentDir, ignore))
      } catch (error) {
        if (util.types.isNativeError(error) && 'code' in error && error.code === 'ENOENT') {
          throw initialErr
        }
        throw error
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
    if (!util.types.isNativeError(error) || !('code' in error) || error.code !== 'ENOENT') {
      throw error
    }
  }
  return forceSymlinkSync(target, path, opts)
}

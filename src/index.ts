import betterPathResolve = require('better-path-resolve')
import { promises as fs, symlinkSync, mkdirSync, readlinkSync, unlinkSync } from 'fs'
import pathLib = require('path')
import renameOverwrite = require('rename-overwrite')

const IS_WINDOWS = process.platform === 'win32' || /^(msys|cygwin)$/.test(<string>process.env.OSTYPE)

// Always use "junctions" on Windows. Even though support for "symbolic links" was added in Vista+, users by default
// lack permission to create them
const symlinkType = IS_WINDOWS ? 'junction' : 'dir'

const resolveSrc = IS_WINDOWS ? resolveSrcOnWin: resolveSrcOnNonWin

function resolveSrcOnWin (src: string, dest: string) {
  return `${src}\\`
}

function resolveSrcOnNonWin (src: string, dest: string) {
  return pathLib.relative(pathLib.dirname(dest), src)
}

function symlinkDir (target: string, path: string, opts?: { overwrite?: boolean }): Promise<{ reused: boolean, warn?: string }> {
  path = betterPathResolve(path)
  target = betterPathResolve(target)

  if (target === path) throw new Error(`Symlink path is the same as the target path (${target})`)

  target = resolveSrc(target, path)

  return forceSymlink(target, path, opts)
}

/**
 * Creates a symlink. Re-link if a symlink already exists at the supplied
 * srcPath. API compatible with [`fs#symlink`](https://nodejs.org/api/fs.html#fs_fs_symlink_srcpath_dstpath_type_callback).
 */
async function forceSymlink (
  target: string,
  path: string,
  opts?: {
    overwrite?: boolean
    renameTried?: boolean
  }
): Promise<{ reused: boolean, warn?: string }> {
  let initialErr: Error
  try {
    await fs.symlink(target, path, symlinkType)
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
      await renameOverwrite(path, pathLib.join(parentDir, ignore))
      warn = `Symlink wanted name was occupied by directory or file. Old entity moved: "${parentDir}${pathLib.sep}{${pathLib.basename(path)} => ${ignore}".`
    }

    return {
      ...await forceSymlink(target, path, { ...opts, renameTried: true }),
      warn,
    }
  }

  if (target === linkString) {
    return { reused: true }
  }
  if (opts?.overwrite === false) {
    throw initialErr
  }
  await fs.unlink(path)
  return await forceSymlink(target, path, opts)
}

// for backward compatibility
symlinkDir['default'] = symlinkDir

export = symlinkDir

namespace symlinkDir {
  export function sync (target: string, path: string, opts?: { overwrite?: boolean }): { reused: boolean, warn?: string } {
    path = betterPathResolve(path)
    target = betterPathResolve(target)

    if (target === path) throw new Error(`Symlink path is the same as the target path (${target})`)

    target = resolveSrc(target, path)

    return forceSymlinkSync(target, path, opts)
  }
}

function forceSymlinkSync (
  target: string,
  path: string,
  opts?: {
    overwrite?: boolean
    renameTried?: boolean
  }
): { reused: boolean, warn?: string } {
  let initialErr: Error
  try {
    symlinkSync(target, path, symlinkType)
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
      renameOverwrite.sync(path, pathLib.join(parentDir, ignore))
      warn = `Symlink wanted name was occupied by directory or file. Old entity moved: "${parentDir}${pathLib.sep}{${pathLib.basename(path)} => ${ignore}".`
    }

    return {
      ...forceSymlinkSync(target, path, { ...opts, renameTried: true }),
      warn,
    }
  }

  if (target === linkString) {
    return { reused: true }
  }
  if (opts?.overwrite === false) {
    throw initialErr
  }
  unlinkSync(path)
  return forceSymlinkSync(target, path, opts)
}

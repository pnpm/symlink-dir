import betterPathResolve = require('better-path-resolve')
import { promises as fs, symlinkSync, mkdirSync, readlinkSync, unlinkSync } from 'fs'
import util = require('util')
import pathLib = require('path')
import renameOverwrite = require('rename-overwrite')

const IS_WINDOWS = process.platform === 'win32' || /^(msys|cygwin)$/.test(<string>process.env.OSTYPE)

// Falls back to "junctions" on Windows if "symbolic links" is disallowed. Even though support for "symbolic links" was added in Vista+, users by default
// lack permission to create them
let symlinkType: 'dir' | 'junction' | undefined = IS_WINDOWS ? undefined : 'dir'

function resolveSrc(src: string, dest: string, type: 'dir' | 'junction') {
  if (type === 'junction') {
    return resolveSrcOnWinJunction(src, dest)
  }
  return resolveSrcOnTrueSymlink(src, dest)
}

function resolveSrcOnWinJunction (src: string, dest: string) {
  return `${src}\\`
}

function resolveSrcOnTrueSymlink (src: string, dest: string) {
  return pathLib.relative(pathLib.dirname(dest), src)
}

function resolveExistingLinkTarget (linkTarget: string, linkPath: string) {
  if (!IS_WINDOWS) return linkTarget
  // Can be absolute (junction or symlink) or relative (symlink) in Windows, so we need to unify to absolute path
  return betterPathResolve(pathLib.isAbsolute(linkTarget) ? linkTarget : pathLib.resolve(pathLib.dirname(linkPath), linkTarget))
}

function symlinkDir (target: string, path: string, opts?: { overwrite?: boolean }): Promise<{ reused: boolean, warn?: string }> {
  path = betterPathResolve(path)
  target = betterPathResolve(target)

  if (target === path) throw new Error(`Symlink path is the same as the target path (${target})`)

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
    if (symlinkType !== undefined) {
      // avoid extra try block for second and subsequent calls for better performance
      await fs.symlink(resolveSrc(target, path, symlinkType), path, symlinkType)
    } else {
      try {
        await fs.symlink(resolveSrcOnTrueSymlink(target, path), path, 'dir')
        symlinkType = 'dir'
      } catch (err) {
        if ((<NodeJS.ErrnoException>err).code === 'EPERM') {
          await fs.symlink(resolveSrcOnWinJunction(target, path), path, 'junction')
          symlinkType = 'junction'
        } else {
          throw err
        }
      }
    }
    return { reused: false }
  } catch (err) {
    switch ((<NodeJS.ErrnoException>err).code) {
      case 'ENOENT':
        try {
          await fs.mkdir(pathLib.dirname(path), { recursive: true })
        } catch (mkdirError) {
          mkdirError.message = `Error while trying to symlink "${resolveSrc(target, path, symlinkType ?? 'dir')}" to "${path}". ` +
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

  if (pathLib.relative(target, resolveExistingLinkTarget(linkString, path)) === '') {
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
  export function sync (target: string, path: string, opts?: { overwrite?: boolean }): { reused: boolean, warn?: string } {
    path = betterPathResolve(path)
    target = betterPathResolve(target)

    if (target === path) throw new Error(`Symlink path is the same as the target path (${target})`)

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
    if (symlinkType !== undefined) {
      symlinkSync(resolveSrc(target, path, symlinkType), path, symlinkType)
    } else {
      try {
        symlinkSync(resolveSrcOnTrueSymlink(target, path), path, 'dir')
        symlinkType = 'dir'
      } catch (err) {
        if ((<NodeJS.ErrnoException>err).code === 'EPERM') {
          symlinkSync(resolveSrcOnWinJunction(target, path), path, 'junction')
          symlinkType = 'junction'
        } else {
          throw err
        }
      }
    }
    return { reused: false }
  } catch (err) {
    initialErr = err
    switch ((<NodeJS.ErrnoException>err).code) {
      case 'ENOENT':
        try {
          mkdirSync(pathLib.dirname(path), { recursive: true })
        } catch (mkdirError) {
          mkdirError.message = `Error while trying to symlink "${resolveSrc(target, path, symlinkType ?? 'dir')}" to "${path}". ` +
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

  if (pathLib.relative(target, resolveExistingLinkTarget(linkString, path)) === '') {
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

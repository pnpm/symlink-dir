import fs = require('mz/fs')
import path = require('path')
import mkdirp = require('mkdirp-promise')
import isWindows = require('is-windows')

const IS_WINDOWS = isWindows()

// Always use "junctions" on Windows. Even though support for "symbolic links" was added in Vista+, users by default
// lack permission to create them
const symlinkType = IS_WINDOWS ? 'junction' : 'dir'

const resolveSrc = IS_WINDOWS ? resolveSrcOnWin: resolveSrcOnNonWin

function resolveSrcOnWin (src: string, dest: string) {
  return `${path.resolve(src)}\\`
}

function resolveSrcOnNonWin (src: string, dest: string) {
  return path.relative(path.dirname(dest), path.resolve(src))
}

async function symlinkDir (src: string, dest: string): Promise<{reused: Boolean}> {
  dest = path.resolve(dest)
  src = resolveSrc(src, dest)

  try {
    return await forceSymlink(src, dest)
  } catch (err) {
    if ((<NodeJS.ErrnoException>err).code === 'ENOENT') {
      await mkdirp(path.dirname(dest))
      return await forceSymlink(src, dest)
    }
    throw err
  }
}

/**
 * Creates a symlink. Re-link if a symlink already exists at the supplied
 * srcPath. API compatible with [`fs#symlink`](https://nodejs.org/api/fs.html#fs_fs_symlink_srcpath_dstpath_type_callback).
 */
async function forceSymlink (src: string, dest: string): Promise<{reused: Boolean}> {
  try {
    await fs.symlink(src, dest, symlinkType)
    return { reused: false }
  } catch (err) {
    if ((<NodeJS.ErrnoException>err).code !== 'EEXIST') throw err

    const linkString = await fs.readlink(dest)
    if (src === linkString) {
      return { reused: true }
    }
    await fs.unlink(dest)
    return await forceSymlink(src, dest)
  }
}

// for backward compatibility
symlinkDir['default'] = symlinkDir

export = symlinkDir

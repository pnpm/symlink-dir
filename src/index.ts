import fs = require('mz/fs')
import path = require('path')
import os = require('os')
import mkdirp = require('mkdirp-promise')
import isWindows = require('is-windows')

// Always use "junctions" on Windows. Even though support for "symbolic links" was added in Vista+, users by default
// lack permission to create them
const symlinkType = isWindows() ? 'junction' : 'dir'

async function symlinkDir (src: string, dest: string) {
  src = path.resolve(src)
  dest = path.resolve(dest)

  // Junction points can't be relative
  const rel = symlinkType !== 'junction' ? path.relative(path.dirname(dest), src) : src

  try {
    await forceSymlink(rel, dest)
  } catch (err) {
    if ((<NodeJS.ErrnoException>err).code === 'ENOENT') {
      await mkdirp(path.dirname(dest))
      await forceSymlink(rel, dest)
      return
    }
    throw err
  }
}

/**
 * Creates a symlink. Re-link if a symlink already exists at the supplied
 * srcPath. API compatible with [`fs#symlink`](https://nodejs.org/api/fs.html#fs_fs_symlink_srcpath_dstpath_type_callback).
 */
async function forceSymlink (src: string, dest: string) {
  try {
    await fs.symlink(src, dest, symlinkType)
  } catch (err) {
    if ((<NodeJS.ErrnoException>err).code !== 'EEXIST') throw err

    const linkString = await fs.readlink(dest)
    if (src === linkString) {
      return
    }
    await fs.unlink(dest)
    await forceSymlink(src, dest)
  }
}

// for backward compatibility
symlinkDir['default'] = symlinkDir

export = symlinkDir

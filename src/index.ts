import betterPathResolve = require('better-path-resolve')
import fs = require('fs')
import path = require('path')
import makeDir = require('make-dir')
import renameOverwrite = require('rename-overwrite')
import { promisify } from 'util'

const symlink = promisify(fs.symlink)
const readlink = promisify(fs.readlink)
const unlink = promisify(fs.unlink)

const IS_WINDOWS = process.platform === 'win32' || /^(msys|cygwin)$/.test(<string>process.env.OSTYPE)

// Always use "junctions" on Windows. Even though support for "symbolic links" was added in Vista+, users by default
// lack permission to create them
const symlinkType = IS_WINDOWS ? 'junction' : 'dir'

const resolveSrc = IS_WINDOWS ? resolveSrcOnWin: resolveSrcOnNonWin

function resolveSrcOnWin (src: string, dest: string) {
  return `${src}\\`
}

function resolveSrcOnNonWin (src: string, dest: string) {
  return path.relative(path.dirname(dest), src)
}

async function symlinkDir (src: string, dest: string): Promise<{ reused: Boolean, warn?: string }> {
  dest = betterPathResolve(dest)
  src = betterPathResolve(src)

  if (src === dest) throw new Error(`Symlink path is the same as the target path (${src})`)

  src = resolveSrc(src, dest)

  try {
    return await forceSymlink(src, dest)
  } catch (err) {
    if ((<NodeJS.ErrnoException>err).code === 'ENOENT') {
      await makeDir(path.dirname(dest))
      return await forceSymlink(src, dest)
    }
    throw err
  }
}

/**
 * Creates a symlink. Re-link if a symlink already exists at the supplied
 * srcPath. API compatible with [`fs#symlink`](https://nodejs.org/api/fs.html#fs_fs_symlink_srcpath_dstpath_type_callback).
 */
async function forceSymlink (src: string, dest: string): Promise<{ reused: Boolean, warn?: string }> {
  try {
    await symlink(src, dest, symlinkType)
    return { reused: false }
  } catch (err) {
    if ((<NodeJS.ErrnoException>err).code !== 'EEXIST' && (<NodeJS.ErrnoException>err).code !== 'EISDIR') throw err
  }

  let linkString
  try {
    linkString = await readlink(dest)
  } catch (err) {
    // Dest is not a link
    const parentDir = path.dirname(dest)
    const ignore = `.ignored_${path.basename(dest)}`
    await renameOverwrite(dest, path.join(parentDir, ignore))

    return {
      ...await forceSymlink(src, dest),
      warn: `Symlink wanted name was occupied by directory or file. Old entity moved: "${parentDir}${path.sep}{${path.basename(dest)} => ${ignore}}".`,
    }
  }

  if (src === linkString) {
    return { reused: true }
  }
  await unlink(dest)
  return await forceSymlink(src, dest)
}

// for backward compatibility
symlinkDir['default'] = symlinkDir

export = symlinkDir

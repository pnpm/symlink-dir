import betterPathResolve = require('better-path-resolve')
import fs = require('graceful-fs')
import path = require('path')
import renameOverwrite = require('rename-overwrite')
import { promisify } from 'util'

const symlink = promisify(fs.symlink)
const readlink = promisify(fs.readlink)
const unlink = promisify(fs.unlink)
const mkdir = promisify(fs.mkdir)

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

function symlinkDir (src: string, dest: string): Promise<{ reused: Boolean, warn?: string }> {
  dest = betterPathResolve(dest)
  src = betterPathResolve(src)

  if (src === dest) throw new Error(`Symlink path is the same as the target path (${src})`)

  src = resolveSrc(src, dest)

  return forceSymlink(src, dest)
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
    switch ((<NodeJS.ErrnoException>err).code) {
      case 'ENOENT':
        try {
          await mkdir(path.dirname(dest), { recursive: true })
        } catch (mkdirError) {
          mkdirError.message = `Error while trying to symlink "${src}" to "${dest}". ` +
            `The error happened while trying to create the parent directory for the symlink target. ` +
            `Details: ${mkdirError}`
          throw mkdirError
        }
        await symlink(src, dest, symlinkType)
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

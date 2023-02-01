import betterPathResolve = require('better-path-resolve')
import { promises as fs } from 'fs'
import path = require('path')
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
  return path.relative(path.dirname(dest), src)
}

function symlinkDir (src: string, dest: string, opts?: { overwrite?: boolean }): Promise<{ reused: Boolean, warn?: string }> {
  dest = betterPathResolve(dest)
  src = betterPathResolve(src)

  if (src === dest) throw new Error(`Symlink path is the same as the target path (${src})`)

  src = resolveSrc(src, dest)

  return forceSymlink(src, dest, opts)
}

/**
 * Creates a symlink. Re-link if a symlink already exists at the supplied
 * srcPath. API compatible with [`fs#symlink`](https://nodejs.org/api/fs.html#fs_fs_symlink_srcpath_dstpath_type_callback).
 */
async function forceSymlink (
  src: string,
  dest: string,
  opts?: {
    overwrite?: boolean
    renameTried?: boolean
  }
): Promise<{ reused: Boolean, warn?: string }> {
  try {
    await fs.symlink(src, dest, symlinkType)
    return { reused: false }
  } catch (err) {
    switch ((<NodeJS.ErrnoException>err).code) {
      case 'ENOENT':
        try {
          await fs.mkdir(path.dirname(dest), { recursive: true })
        } catch (mkdirError) {
          mkdirError.message = `Error while trying to symlink "${src}" to "${dest}". ` +
            `The error happened while trying to create the parent directory for the symlink target. ` +
            `Details: ${mkdirError}`
          throw mkdirError
        }
        await forceSymlink(src, dest, opts)
        return { reused: false }
      case 'EEXIST':
      case 'EISDIR':
        if (opts?.overwrite === false) {
          throw err
        }
        // If the target file already exists then we proceed.
        // Additional checks are done below.
        break
      default:
        throw err
    }
  }

  let linkString: string
  try {
    linkString = await fs.readlink(dest)
  } catch (err) {
    // Dest is not a link
    const parentDir = path.dirname(dest)
    let warn!: string
    if (opts?.renameTried) {
      // This is needed in order to fix a mysterious bug that sometimes happens on macOS.
      // It is hard to reproduce and is described here: https://github.com/pnpm/pnpm/issues/5909#issuecomment-1400066890
      await fs.unlink(dest)
      warn = `Symlink wanted name was occupied by directory or file. Old entity removed: "${parentDir}${path.sep}{${path.basename(dest)}".`
    } else {
      const ignore = `.ignored_${path.basename(dest)}`
      await renameOverwrite(dest, path.join(parentDir, ignore))
      warn = `Symlink wanted name was occupied by directory or file. Old entity moved: "${parentDir}${path.sep}{${path.basename(dest)} => ${ignore}".`
    }

    return {
      ...await forceSymlink(src, dest, { ...opts, renameTried: true }),
      warn,
    }
  }

  if (src === linkString) {
    return { reused: true }
  }
  await fs.unlink(dest)
  return await forceSymlink(src, dest, opts)
}

// for backward compatibility
symlinkDir['default'] = symlinkDir

export = symlinkDir

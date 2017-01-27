import fs = require('mz/fs')

export type SymlinkType = 'junction' | 'dir'

/**
 * Creates a symlink. Re-link if a symlink already exists at the supplied
 * srcPath. API compatible with [`fs#symlink`](https://nodejs.org/api/fs.html#fs_fs_symlink_srcpath_dstpath_type_callback).
 */
export default async function forceSymlink (srcPath: string, dstPath: string, type: SymlinkType) {
  try {
    await fs.symlink(srcPath, dstPath, type)
  } catch (err) {
    if ((<NodeJS.ErrnoException>err).code !== 'EEXIST') throw err

    const linkString = await fs.readlink(dstPath)
    if (srcPath === linkString) {
      return
    }
    await fs.unlink(dstPath)
    await forceSymlink(srcPath, dstPath, type)
  }
}

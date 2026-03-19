import { promises as fs } from 'fs'
import { describe, it } from 'node:test'
import assert from 'node:assert'
import tempy from 'tempy'
import writeJsonFile from 'write-json-file'
import { symlinkDir, symlinkDirSync } from '../src/index.ts'

if (globalThis.symlinkBlockedInWindows && process.platform === 'win32') {
  console.log('Emulating Windows non-developer mode')
  if (!(fs.symlink as {tookOver?: boolean}).tookOver) {
      console.error('ERROR: Non-developer mode emulation failed')
      process.exit(1)
  }
}

it('rename target folder if it exists', async () => {
  const temp = tempy.directory()
  process.chdir(temp)

  await fs.mkdir('src')
  await fs.mkdir('dest')

  const { warn } = symlinkDirSync('src', 'dest')

  assert.ok(warn && warn.indexOf('Symlink wanted name was occupied by directory or file') === 0)
})

it('do not rename target folder if overwrite is set to false', async () => {
  const temp = tempy.directory()
  process.chdir(temp)

  await fs.mkdir('src')
  await fs.mkdir('dest')

  assert.throws(
    () => symlinkDirSync('src', 'dest', { overwrite: false }),
    (err: NodeJS.ErrnoException) => {
      assert.strictEqual(err.code, 'EEXIST')
      return true
    }
  )
})

it('do not fail if correct target folder already exists', async () => {
  const temp = tempy.directory()
  process.chdir(temp)

  await fs.mkdir('src')
  symlinkDirSync('src', 'dest', { overwrite: false })

  assert.strictEqual(symlinkDirSync('src', 'dest', { overwrite: false }).reused, true)
})

it('rename target file if it exists', async () => {
  const temp = tempy.directory()
  process.chdir(temp)

  await fs.writeFile('dest', '', 'utf8')
  await fs.mkdir('src')

  const { warn } = symlinkDirSync('src', 'dest')

  assert.ok(warn && warn.indexOf('Symlink wanted name was occupied by directory or file') === 0)
})

it('throw error when symlink path equals the target path', async () => {
  const temp = tempy.directory()
  process.chdir(temp)

  assert.throws(
    () => symlinkDirSync('src', 'src'),
    (err: Error) => {
      assert.ok(err.message.startsWith('Symlink path is the same as the target path ('))
      return true
    }
  )
})

it('create parent directory of symlink', async () => {
  const temp = tempy.directory()
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  const { warn } = symlinkDirSync('src', 'dest/subdir')

  assert.ok(!warn)
  assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
})

it('concurrently creating the same symlink twice', async () => {
  const temp = tempy.directory()
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  await Promise.all([
    symlinkDir('src', 'dest/subdir'),
    symlinkDir('src', 'dest/subdir'),
  ])

  assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
})

it('reusing the existing symlink if it already points to the needed location', async () => {
  const temp = tempy.directory()
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  symlinkDirSync('src', 'dest/subdir')
  const { reused } = symlinkDirSync('src', 'dest/subdir')

  assert.strictEqual(reused, true)
  assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
})

if (!globalThis.symlinkBlockedInWindows || process.platform !== 'win32') {
  it('force real symlink creation with noJunction: true (sync)', async () => {
    const temp = tempy.directory()
    process.chdir(temp)

    await writeJsonFile('src/file.json', { ok: true })

    symlinkDirSync('src', 'dest/subdir', { noJunction: true })
    const { reused } = symlinkDirSync('src', 'dest/subdir', { noJunction: true })

    assert.strictEqual(reused, true)
    assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
  })
}

if (globalThis.symlinkBlockedInWindows && process.platform === 'win32') {
  it('noJunction: true should throw EPERM (no junction fallback) when symlinks are blocked (sync)', async () => {
    const temp = tempy.directory()
    process.chdir(temp)

    await fs.mkdir('src')

    assert.throws(
      () => symlinkDirSync('src', 'dest', { noJunction: true }),
      (err: NodeJS.ErrnoException) => {
        assert.strictEqual(err.code, 'EPERM')
        return true
      }
    )

    await assert.rejects(
      () => fs.lstat('dest'),
      (err: NodeJS.ErrnoException) => {
        assert.strictEqual(err.code, 'ENOENT')
        return true
      }
    )
  })
}

if (globalThis.symlinkBlockedInWindows && process.platform === 'win32') {
  it('do not fail if correct target folder already exists (Developer Mode: off -> on)', async () => {
    const temp = tempy.directory()
    process.chdir(temp)

    await fs.mkdir('src')
    symlinkDirSync('src', 'dest', { overwrite: false })

    try {
      globalThis.symlinkBlockedInWindows = false
      assert.strictEqual(symlinkDirSync('src', 'dest', { overwrite: false }).reused, true)
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }
  })

  it('do not fail if correct target folder already exists (Developer Mode: on -> off)', async () => {
    const temp = tempy.directory()
    process.chdir(temp)

    await fs.mkdir('src')
    try {
      globalThis.symlinkBlockedInWindows = false
      symlinkDirSync('src', 'dest', { overwrite: false })
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }

    assert.strictEqual(symlinkDirSync('src', 'dest', { overwrite: false }).reused, true)
  })

  it('reusing the existing symlink if it already points to the needed location (Developer Mode: off -> on)', async () => {
    const temp = tempy.directory()
    process.chdir(temp)

    await writeJsonFile('src/file.json', { ok: true })

    symlinkDirSync('src', 'dest/subdir')
    try {
      globalThis.symlinkBlockedInWindows = false
      const { reused } = symlinkDirSync('src', 'dest/subdir')
      assert.strictEqual(reused, true)
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }

    assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
  })

  it('reusing the existing symlink if it already points to the needed location (Developer Mode: on -> off)', async () => {
    const temp = tempy.directory()
    process.chdir(temp)

    await writeJsonFile('src/file.json', { ok: true })

    try {
      globalThis.symlinkBlockedInWindows = false
      symlinkDirSync('src', 'dest/subdir')
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }
    const { reused } = symlinkDirSync('src', 'dest/subdir')

    assert.strictEqual(reused, true)
    assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
  })
}

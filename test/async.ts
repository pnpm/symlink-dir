import { promises as fs } from 'fs'
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { temporaryDirectory } from 'tempy'
import { writeJsonFile } from 'write-json-file'
import { symlinkDir } from '../src/index.ts'

if (globalThis.symlinkBlockedInWindows && process.platform === 'win32') {
  console.log('Emulating Windows non-developer mode')
  if (!(fs.symlink as {tookOver?: boolean}).tookOver) {
      console.error('ERROR: Non-developer mode emulation failed')
      process.exit(1)
  }
}

it('rename target folder if it exists', async () => {
  const temp = temporaryDirectory()
  process.chdir(temp)

  await fs.mkdir('src')
  await fs.mkdir('dest')

  const { warn } = await symlinkDir('src', 'dest')

  assert.ok(warn && warn.indexOf('Symlink wanted name was occupied by directory or file') === 0)
})

it('do not rename target folder if overwrite is set to false', async () => {
  const temp = temporaryDirectory()
  process.chdir(temp)

  await fs.mkdir('src')
  await fs.mkdir('dest')

  await assert.rejects(
    () => symlinkDir('src', 'dest', { overwrite: false }),
    (err: NodeJS.ErrnoException) => {
      assert.strictEqual(err.code, 'EEXIST')
      return true
    }
  )
})

it('do not fail if correct target folder already exists', async () => {
  const temp = temporaryDirectory()
  process.chdir(temp)

  await fs.mkdir('src')
  await symlinkDir('src', 'dest', { overwrite: false })

  assert.strictEqual((await symlinkDir('src', 'dest', { overwrite: false })).reused, true)
})

it('rename target file if it exists', async () => {
  const temp = temporaryDirectory()
  process.chdir(temp)

  await fs.writeFile('dest', '', 'utf8')
  await fs.mkdir('src')

  const { warn } = await symlinkDir('src', 'dest')

  assert.ok(warn && warn.indexOf('Symlink wanted name was occupied by directory or file') === 0)
})

it('throw error when symlink path equals the target path', async () => {
  const temp = temporaryDirectory()
  process.chdir(temp)

  assert.throws(
    () => symlinkDir('src', 'src'),
    (err: Error) => {
      assert.ok(err.message.startsWith('Symlink path is the same as the target path ('))
      return true
    }
  )
})

it('create parent directory of symlink', async () => {
  const temp = temporaryDirectory()
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  const { warn } = await symlinkDir('src', 'dest/subdir')

  assert.ok(!warn)
  assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
})

it('concurrently creating the same symlink twice', async () => {
  const temp = temporaryDirectory()
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  await Promise.all([
    symlinkDir('src', 'dest/subdir'),
    symlinkDir('src', 'dest/subdir'),
  ])

  assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
})

it('reusing the existing symlink if it already points to the needed location', async () => {
  const temp = temporaryDirectory()
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  await symlinkDir('src', 'dest/subdir')
  const { reused } = await symlinkDir('src', 'dest/subdir')

  assert.strictEqual(reused, true)
  assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
})

if (!globalThis.symlinkBlockedInWindows || process.platform !== 'win32') {
  it('force real symlink creation with noJunction: true (async)', async () => {
    const temp = temporaryDirectory()
    process.chdir(temp)

    await writeJsonFile('src/file.json', { ok: true })

    await symlinkDir('src', 'dest/subdir', { noJunction: true })
    const { reused } = await symlinkDir('src', 'dest/subdir', { noJunction: true })

    assert.strictEqual(reused, true)
    assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
  })
}

if (globalThis.symlinkBlockedInWindows && process.platform === 'win32') {
  it('noJunction: true should throw EPERM (no junction fallback) when symlinks are blocked (async)', async () => {
    const temp = temporaryDirectory()
    process.chdir(temp)

    await fs.mkdir('src')

    await assert.rejects(
      () => symlinkDir('src', 'dest', { noJunction: true }),
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
    const temp = temporaryDirectory()
    process.chdir(temp)

    await fs.mkdir('src')
    await symlinkDir('src', 'dest', { overwrite: false })

    try {
      globalThis.symlinkBlockedInWindows = false
      assert.strictEqual((await symlinkDir('src', 'dest', { overwrite: false })).reused, true)
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }
  })

  it('do not fail if correct target folder already exists (Developer Mode: on -> off)', async () => {
    const temp = temporaryDirectory()
    process.chdir(temp)

    await fs.mkdir('src')
    try {
      globalThis.symlinkBlockedInWindows = false
      await symlinkDir('src', 'dest', { overwrite: false })
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }

    assert.strictEqual((await symlinkDir('src', 'dest', { overwrite: false })).reused, true)
  })

  it('reusing the existing symlink if it already points to the needed location (Developer Mode: off -> on)', async () => {
    const temp = temporaryDirectory()
    process.chdir(temp)

    await writeJsonFile('src/file.json', { ok: true })

    await symlinkDir('src', 'dest/subdir')
    try {
      globalThis.symlinkBlockedInWindows = false
      const { reused } = await symlinkDir('src', 'dest/subdir')
      assert.strictEqual(reused, true)
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }

    assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
  })

  it('reusing the existing symlink if it already points to the needed location (Developer Mode: on -> off)', async () => {
    const temp = temporaryDirectory()
    process.chdir(temp)

    await writeJsonFile('src/file.json', { ok: true })

    try {
      globalThis.symlinkBlockedInWindows = false
      await symlinkDir('src', 'dest/subdir')
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }
    const { reused } = await symlinkDir('src', 'dest/subdir')

    assert.strictEqual(reused, true)
    assert.deepStrictEqual(JSON.parse(await fs.readFile('dest/subdir/file.json', 'utf8')), { ok: true })
  })
}

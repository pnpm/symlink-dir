///<reference path="../typings/index.d.ts" />
import { promises as fs } from 'fs'
import path = require('path')
import test = require('tape')
import tempy = require('tempy')
import writeJsonFile = require('write-json-file')
import symlink = require('../src')

if (globalThis.symlinkBlockedInWindows && process.platform === 'win32') {
  console.log('Emulating Windows non-developer mode')
  if (!(fs.symlink as {tookOver?: boolean}).tookOver) {
      console.error('ERROR: Non-developer mode emulation failed')
      process.exit(1)
  }
}

test('rename target folder if it exists', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await fs.mkdir('src')
  await fs.mkdir('dest')

  const { warn } = await symlink('src', 'dest')

  t.ok(warn && warn.indexOf('Symlink wanted name was occupied by directory or file') === 0, 'dest folder ignored')

  t.end()
})

test('do not rename target folder if overwrite is set to false', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await fs.mkdir('src')
  await fs.mkdir('dest')

  let err!: Error
  try {
    await symlink('src', 'dest', { overwrite: false })
  } catch (_err) {
    err = _err
  }

  t.equals(err['code'], 'EEXIST', 'dest folder not ignored')
  t.end()
})

test('do not fail if correct target folder already exists', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await fs.mkdir('src')
  await symlink('src', 'dest', { overwrite: false })

  t.equal((await symlink('src', 'dest', { overwrite: false })).reused, true)
  t.end()
})

test('rename target file if it exists', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await fs.writeFile('dest', '', 'utf8')
  await fs.mkdir('src')

  const { warn } = await symlink('src', 'dest')

  t.ok(warn && warn.indexOf('Symlink wanted name was occupied by directory or file') === 0, 'dest folder ignored')

  t.end()
})

test('throw error when symlink path equals the target path', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  let err!: Error

  try {
    await symlink('src', 'src')
  } catch (_err) {
    err = _err
  }

  t.ok(err)
  t.ok(err.message.startsWith('Symlink path is the same as the target path ('))

  t.end()
})

test('create parent directory of symlink', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  const { warn } = await symlink('src', 'dest/subdir')

  t.notOk(warn)
  t.deepEqual(await import(path.resolve('dest/subdir/file.json')), { ok: true })

  t.end()
})

test('concurrently creating the same symlink twice', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  await Promise.all([
    symlink('src', 'dest/subdir'),
    symlink('src', 'dest/subdir'),
  ])

  t.deepEqual(await import(path.resolve('dest/subdir/file.json')), { ok: true })

  t.end()
})

test('reusing the existing symlink if it already points to the needed location', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  await symlink('src', 'dest/subdir')
  const { reused } = await symlink('src', 'dest/subdir')

  t.equal(reused, true)
  t.deepEqual(await import(path.resolve('dest/subdir/file.json')), { ok: true })

  t.end()
})

if (!globalThis.symlinkBlockedInWindows || process.platform !== 'win32') {
  test('force real symlink creation with symlinkOnly: true (async)', async (t) => {
    const temp = tempy.directory()
    t.comment(`testing in ${temp}`)
    process.chdir(temp)

    await writeJsonFile('src/file.json', { ok: true })

    await symlink('src', 'dest/subdir', { symlinkOnly: true })
    const { reused } = await symlink('src', 'dest/subdir', { symlinkOnly: true })

    t.equal(reused, true)
    t.deepEqual(await import(path.resolve('dest/subdir/file.json')), { ok: true })

    t.end()
  })
}

if (globalThis.symlinkBlockedInWindows && process.platform === 'win32') {
  test('symlinkOnly: true should throw EPERM (no junction fallback) when symlinks are blocked (async)', async (t) => {
    const temp = tempy.directory()
    t.comment(`testing in ${temp}`)
    process.chdir(temp)

    await fs.mkdir('src')

    let err!: Error
    try {
      await symlink('src', 'dest', { symlinkOnly: true })
    } catch (_err) {
      err = _err
    }

    t.ok(err, 'error is thrown')
    t.equals((err as any)['code'], 'EPERM', 'EPERM thrown without junction fallback')

    let statErr!: Error
    try {
      await fs.lstat('dest')
    } catch (_err) {
      statErr = _err
    }
    t.ok(statErr && (statErr as any)['code'] === 'ENOENT', 'dest not created')

    t.end()
  })
}

if (globalThis.symlinkBlockedInWindows && process.platform === 'win32') {
  // simulate the situation where the user enabled or disabled Windows Developer Mode between the first and second symlink creation
  // including the scenario where upgrading from a true-symlink-unsupported version to a supported one
  // each test should be run serially to avoid race conditions where the value of symlinkBlockedInWindows is updated concurrently by multiple tests,
  // potentially causing tests to fail or pass unexpectedly.

  test('do not fail if correct target folder already exists (Developer Mode: off -> on)', async (t) => {
    const temp = tempy.directory()
    t.comment(`testing in ${temp}`)
    process.chdir(temp)

    await fs.mkdir('src')
    await symlink('src', 'dest', { overwrite: false })

    try {
      // Developer Mode is turned on
      globalThis.symlinkBlockedInWindows = false
      t.equal((await symlink('src', 'dest', { overwrite: false })).reused, true)
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }
    t.end()
  })

  test('do not fail if correct target folder already exists (Developer Mode: on -> off)', async (t) => {
    const temp = tempy.directory()
    t.comment(`testing in ${temp}`)
    process.chdir(temp)

    await fs.mkdir('src')
    try {
      globalThis.symlinkBlockedInWindows = false
      await symlink('src', 'dest', { overwrite: false })
    } finally {
      // Developer Mode is turned off
      globalThis.symlinkBlockedInWindows = true
    }

    t.equal((await symlink('src', 'dest', { overwrite: false })).reused, true)
    t.end()
  })

  test('reusing the existing symlink if it already points to the needed location (Developer Mode: off -> on)', async (t) => {
    const temp = tempy.directory()
    t.comment(`testing in ${temp}`)
    process.chdir(temp)

    await writeJsonFile('src/file.json', { ok: true })

    await symlink('src', 'dest/subdir')
    try {
      // Developer Mode is turned on
      globalThis.symlinkBlockedInWindows = false
      const { reused } = await symlink('src', 'dest/subdir')

      t.equal(reused, true)
    } finally {
      globalThis.symlinkBlockedInWindows = true
    }

    t.deepEqual(await import(path.resolve('dest/subdir/file.json')), { ok: true })

    t.end()
  })

  test('reusing the existing symlink if it already points to the needed location (Developer Mode: on -> off)', async (t) => {
    const temp = tempy.directory()
    t.comment(`testing in ${temp}`)
    process.chdir(temp)

    await writeJsonFile('src/file.json', { ok: true })

    try {
      globalThis.symlinkBlockedInWindows = false
      await symlink('src', 'dest/subdir')
    } finally {
      // Developer Mode is turned off
      globalThis.symlinkBlockedInWindows = true
    }
    const { reused } = await symlink('src', 'dest/subdir')

    t.equal(reused, true)
    t.deepEqual(await import(path.resolve('dest/subdir/file.json')), { ok: true })

    t.end()
  })
}

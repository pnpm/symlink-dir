///<reference path="../typings/index.d.ts" />
import { promises as fs } from 'fs'
import path = require('path')
import test = require('tape')
import tempy = require('tempy')
import writeJsonFile = require('write-json-file')
import symlink = require('../src')

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

test('symlink file', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await writeJsonFile('src/file.json', { ok: true })

  await symlink('src/file.json', 'dest/subdir/file.json')

  t.deepEqual(await import(path.resolve('dest/subdir/file.json')), { ok: true })

  t.end()
})

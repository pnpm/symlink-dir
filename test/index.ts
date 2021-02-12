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

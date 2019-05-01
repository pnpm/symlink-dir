///<reference path="../typings/index.d.ts" />
import fs = require('fs')
import test = require('tape')
import tempy = require('tempy')
import mkdirp = require('mkdirp-promise')
import { promisify } from 'util'
import symlink = require('../src')

const writeFile = promisify(fs.writeFile)

test('rename target folder if it exists', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await mkdirp('src')
  await mkdirp('dest')

  const { warn } = await symlink('src', 'dest')

  t.ok(warn && warn.indexOf('Symlink wanted name was occupied by directory or file') === 0, 'dest folder ignored')

  t.end()
})

test('rename target file if it exists', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await writeFile('dest', '', 'utf8')
  await mkdirp('src')

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

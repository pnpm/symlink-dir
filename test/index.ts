///<reference path="../typings/index.d.ts" />
import fs = require('mz/fs')
import test = require('tape')
import tempy = require('tempy')
import mkdirp = require('mkdirp-promise')
import symlink = require('../src')

test('rename target folder if it exists', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await mkdirp('src')
  await mkdirp('dest')

  const { warn } = await symlink('src', 'dest')

  t.ok(warn && warn.indexOf('Link destination was a directory.') === 0, 'dest folder ignored')

  t.end()
})

test('rename target file if it exists', async (t) => {
  const temp = tempy.directory()
  t.comment(`testing in ${temp}`)
  process.chdir(temp)

  await fs.writeFile('dest', '', 'utf8')
  await mkdirp('src')

  const { warn } = await symlink('src', 'dest')

  t.ok(warn && warn.indexOf('Link destination was a directory.') === 0, 'dest folder ignored')

  t.end()
})

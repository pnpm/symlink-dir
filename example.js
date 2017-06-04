'use strict'
const symlinkDir = require('./dist')
const path = require('path')
const cwd = process.cwd()

symlinkDir(path.join(cwd, 'src'), path.join(cwd, 'node_modules/src'))

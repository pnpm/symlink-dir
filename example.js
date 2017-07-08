'use strict'
const symlinkDir = require('./dist')
const path = require('path')

symlinkDir('src', 'node_modules/src')
  .then(result => {
    console.log(result)

    return symlinkDir('src', 'node_modules/src')
  })
  .then(result => {
    console.log(result)
  })
  .catch(err => console.error(err))

#!/usr/bin/env node
import linkDir from './index.js'

const args = process.argv.slice(2)

linkDir(args[0], args[1])

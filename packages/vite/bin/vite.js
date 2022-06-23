#!/usr/bin/env node

const debugIndex = process.argv.findIndex(arg => /^(?:-d|--debug)$/.test(arg))

if (debugIndex > -1) {
  const debugValue = 'vite:*'

  process.env.DEBUG = debugValue
}

function start() {
  require('../dist/node/cli')
}

start()

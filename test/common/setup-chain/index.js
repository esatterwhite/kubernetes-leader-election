'use strict'

const Chain = require('@logdna/setup-chain')
const actions = require('./actions/index.js')

module.exports = class SetupChain extends Chain {
  constructor(state) {
    super(state, actions)
  }

  $pid() {
    return process.pid
  }
}


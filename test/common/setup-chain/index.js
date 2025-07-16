'use strict'

const Chain = require('@logdna/setup-chain')
const actions = require('./actions/index.js')

module.exports = class SetupChain extends Chain {
  constructor(state) {
    super(state, actions)
    this.count = 0
  }

  $incr() {
    return ++this.count
  }

  $pid() {
    return process.pid
  }
}


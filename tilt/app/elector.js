'use strict'

const pino = require('pino')

const log = pino({
  messageKey: 'message'
, level: 'debug'
, formatters: {
    bindings(values) {
      return {
        name: values.name
      , pod: process.env.POD_NAME
      , identity: `election-test-${process.pid}`
      }
    }
  , level(level) {
      return {level}
    }
  }
})

const Elector = require('../../lib/elector.js')

var elector = new Elector({
  auto_close: true
, log: log
, lease_name: 'k8s-election-test'
, identity: `election-test-${process.pid}`
})

module.exports = elector

if (module === require.main) {
  elector.start()
}


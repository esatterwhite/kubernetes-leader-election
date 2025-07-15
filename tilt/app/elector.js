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
      }
    }
  , level(level) {
      return {level}
    }
  }
})

const Elector = require('../../lib/elector.js')

if (module === require.main) {
  var elector = new Elector({
    auto_close: true
  , log: log
  , leader_identity: process.env.POD_NAME
  })
  elector.bootstrap()
}

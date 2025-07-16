'use strict'

const pino = require('pino')

module.exports = log

const DEFAULTS = {
  level: 'debug'
, messageKey: 'message'
}

async function log(opts = {}) {
  const config = this.lookup({
    ...DEFAULTS
  , opts
  })

  return pino({
    ...config
  , formatters: {
      bindings(values) {
        return {
          name: values.name
        , identity: config.identity
        }
      }
    , level(level) {
        return {level}
      }
    }
  })

}


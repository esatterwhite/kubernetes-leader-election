'use strict'

const Elector = require('../../../../lib/elector.js')

const DEFAULTS = {}

module.exports = async function elector(opts = {}) {
  const config = this.lookup({
    ...DEFAULTS
  , ...opts
  })

  return new Elector(config)
}

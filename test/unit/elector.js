'use strict'

const {test, threw} = require('tap')

const main = require('../../index.js')
const Elector = require('../../lib/elector.js')

test('package exports', async (t) => {
  t.same(main, Elector, 'Elector class as main export')
}).catch(threw)

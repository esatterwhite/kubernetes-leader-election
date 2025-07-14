'use strict'

const {test, threw} = require('tap')
const main = require('../../index.js')

test('codedependantkubernetes-leader-election', async (t) => {
  t.same(main, {}, 'this will pass')
}).catch(threw)

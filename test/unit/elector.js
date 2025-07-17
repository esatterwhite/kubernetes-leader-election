'use strict'

const {test, threw} = require('tap')

const main = require('../../index.js')
const {EVENTS} = require('../../lib/constants.js')
const Elector = require('../../lib/elector.js')

test('package exports', async (t) => {
  t.same(main, {Elector, EVENTS}, 'Elector class as main export')
  t.test('elector instance', async (t) => {

    t.same(Elector.EVENTS, {
      LEADERSHIP_LOST: 'leadership_lost'
    , LEADERSHIP_ACQUIRED: 'leadership_acquired'
    , LEASE_RENEWED: 'lease_renewed'
    }, 'Class static property EVENTS shape')

    const elector = new Elector({
      namespace: 'foobar'
    , lease_name: 'whizbang'
    , identity: 'iamweasel'
    , wait_for_leadership: true
    , renew_interval_ms: 1000
    })

    t.same(elector.EVENTS, {
      LEADERSHIP_LOST: 'leadership_lost'
    , LEADERSHIP_ACQUIRED: 'leadership_acquired'
    , LEASE_RENEWED: 'lease_renewed'
    }, 'instance static property EVENTS shape')

    t.same(elector.current_leader, false, 'current_leader=false')
    t.same(elector.identity, 'iamweasel', 'identity=iamweasel')
    t.same(elector.namespace, 'foobar', 'namespace=foobar')
    t.throws(() => {
      elector.current_leader = true
    }, new TypeError('Cannot set property current_leader'), 'current_leader is readonly')

    t.throws(() => {
      elector.namespace = true
    }, new TypeError('Cannot set property namespace'), 'namespace is readonly')

    t.throws(() => {
      elector.lease_name = true
    }, new TypeError('Cannot set property lease_name'), 'lease_name is readonly')

  })
}).catch(threw)

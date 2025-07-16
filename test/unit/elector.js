'use strict'

const {test, threw} = require('tap')

const main = require('../../index.js')
const Elector = require('../../lib/elector.js')

test('package exports', async (t) => {
  t.same(main, Elector, 'Elector class as main export')
  t.test('elector instance', async (t) => {

    t.same(Elector.EVENTS, {
      LEADERSHIP_LOST: 'leadership_lost'
    , LEADERSHIP_ACQUIRED: 'leadership_acquired'
    }, 'Class static property EVENTS shape')

    const elector = new Elector({
      namespace: 'foobar'
    , lease_name: 'whizbang'
    , leader_identity: 'iamweasel'
    , wait_for_leadership: true
    , renew_interval_ms: 1000
    })

    t.same(elector.EVENTS, {
      LEADERSHIP_LOST: 'leadership_lost'
    , LEADERSHIP_ACQUIRED: 'leadership_acquired'
    }, 'instance static property EVENTS shape')

    t.same(elector.current_leader, false, 'current_leader=false')
    t.same(elector.leader_identity, 'iamweasel', 'leader_identity=iamweasel')
    t.same(elector.namespace, 'foobar', 'namespace=foobar')
    t.throws(() => {
      elector.current_leader = true
    }, 'current_leader is readonly')

    t.throws(() => {
      elector.namespace = true
    }, 'namespace is readonly')

    t.throws(() => {
      elector.lease_name = true
    }, 'lease_name is readonly')

  })
}).catch(threw)

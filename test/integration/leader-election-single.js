'use strict'

const util = require('node:util')
const {once} = require('node:events')
const {mock} = require('node:test')
const {test} = require('tap')
const {Chain, Elector} = require('../common/bootstrap.js')

test('elector', async (t) => {
  t.test('non-kubernetes: single instance', (t) => {
    t.plan(1)
    const elector = new Elector({
      auto_close: false
    , lease_name: '!template:"election-test-single-{{!random}}"'
    , identity: '!template:"election-test-single-{{!pid}}"'
    })

    t.teardown(() => {
      return elector.stop()
    })

    const evt = once(elector, elector.EVENTS.LEADERSHIP_ACQUIRED)

    t.resolves(evt, {
      lease: elector.lease_name
    }, 'single instance elected leader on start')

    elector.start()
  })

  t.test('kubernetes: single instance', async (t) => {
    const {elector, environment} = await new Chain()
      .environment()
      .elector({
        auto_close: false
      , lease_name: '!template:"election-test-single-{{!random}}"'
      , identity: '!template:"election-test-single-{{!pid}}"'
      , renew_interval_ms: 1000
      , lease_duration_sec: 500
      })
      .execute()

    t.teardown(() => {
      return elector.stop()
    })

    t.comment(util.format('kubernetes host: %s', environment.kubernetes_host))
    t.comment(util.format('kubernetes port: %s', environment.kubernetes_port))

    t.test('clean stop', async (t) => {
      const evt = once(elector, elector.EVENTS.LEADERSHIP_ACQUIRED)
      elector.start()
      await t.resolves(evt)
      t.ok(elector.current_leader, 'elector is current leader')
    })
  })

  t.test('kubernetes: lease renew', async (t) => {

    const {elector} = await new Chain()
      .environment()
      .elector({
        auto_close: false
      , lease_name: '!template:"election-test-single-{{!random}}"'
      , identity: '!template:"election-test-single-{{!pid}}"'
      , renew_interval_ms: 1000
      , lease_duration_sec: 500
      , wait_for_leadership: false
      })
      .execute()

    t.teardown(() => {
      return elector.stop()
    })
    {
      const evt = once(elector, elector.EVENTS.LEADERSHIP_ACQUIRED)
      t.resolves(evt, 'elector elected leader')
      elector.start()
    }

    {
      const evt = once(elector, elector.EVENTS.LEASE_RENEWED)
      t.resolves(evt, 'leader renewed lease')
    }
  })

  t.test('fault tolerence', async (t) => {
    const {elector} = await new Chain()
      .environment()
      .elector({
        auto_close: false
      , lease_name: '!template:"election-test-single-{{!random}}"'
      , identity: '!template:"election-test-single-{{!pid}}"'
      , renew_interval_ms: 1000
      , lease_duration_sec: 500
      , wait_for_leadership: false
      })
      .execute()

    t.teardown(() => {
      return elector.stop()
    })

    const watch = elector.watch.watch
    const mockWatch = mock.fn(() => {
      elector.watch.watch = watch
      throw new Error('broken watch function')
    })

    elector.watch.watch = mockWatch
    await elector.start()
    await once(elector, elector.EVENTS.LEADERSHIP_ACQUIRED)
    t.same(mockWatch.mock.callCount(), 1, 'watch called')
  })
})

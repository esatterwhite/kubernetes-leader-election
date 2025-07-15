'use strict'

const os = require('node:os')
const {EventEmitter} = require('node:events')
const logger = require('abstract-logging')
const {
  CoordinationV1Api
, KubeConfig
, V1MicroTime
, Watch
} = require('@kubernetes/client-node')

const EVENTS = {
  LEADERSHIP_LOST: 'leadership_lost'
, LEADERSHIP_ACQUIRED: 'leadership_acquired'
}

logger.child = function() {
  return this
}

class Elector extends EventEmitter {
  log = logger
  client = null
  watch = null
  current_leader = false
  api_path = null
  #LEADER_IDENTITY = null
  #SERVICE_HOST = null
  constructor({
    auto_close = true
  , leader_identity = `auth-secret-${os.hostname()}`
  , lease_duration_sec = 20 // 2 * (this.renew_interval_ms / 1000)
  , lease_name = 'nodejs-leader-election'
  , log = logger.child({module: 'nodejs-leader-election'})
  , namespace = 'default'
  , renew_interval_ms = 10000
  , wait_for_leadership = false
  } = {}) {
    super()
    this.#SERVICE_HOST = process.env.KUBERNETES_SERVICE_HOST

    this.#LEADER_IDENTITY = leader_identity
    this.lease_name = lease_name
    this.namespace = namespace
    this.renew_interval_ms = renew_interval_ms
    this.lease_duration_sec = lease_duration_sec
    this.wait_for_leadership = wait_for_leadership
    this.log = log

    this.api_path = `/apis/coordination.k8s.io/v1/namespaces/${this.namespace}/leases`
    if (!this.#SERVICE_HOST) return

    const kube_config = new KubeConfig()
    kube_config.loadFromDefault()
    this.client = kube_config.makeApiClient(CoordinationV1Api)
    this.watch = new Watch(kube_config)

    if (auto_close) {
      process.once('SIGINT', this.shutdown.bind(this))
      process.once('SIGTERM', this.shutdown.bind(this))
    }

  }

  static get EVENTS() {
    return EVENTS
  }

  get EVENTS() {
    return EVENTS
  }
  async acquireLease(lease) {
    lease.spec.holderIdentity = this.#LEADER_IDENTITY
    lease.spec.leaseDurationSeconds = this.lease_duration_sec
    lease.spec.acquireTime = new V1MicroTime(new Date())
    lease.spec.renewTime = new V1MicroTime(new Date())

    try {
      const body = await this.client.replaceNamespacedLease({
        name: this.lease_name
      , namespace: this.namespace
      , body: lease
      })

      this.log.debug('successfully acquired lease')
      return body
    } catch (err) {
      this.log.error(err, 'error while acquiring lease: %s', err.message)
      throw err
    }
  }

  async bootstrap() {
    if (!this.#SERVICE_HOST) {
      this.current_leader = true
      this.emit(EVENTS.LEADERSHIP_ACQUIRED, {
        lease: this.lease_name
      })
      return
    }

    this.watchLease()
    if (this.wait_for_leadership) {
      await this.runLeaderElection()
      return
    }

    this.runLeaderElection().catch((err) => {
      this.log.error(err, 'Leader election failed: %s', err.message)
    })
  }
  async runLeaderElection() {
    // attempt to become leader
    await this.tryToBecomeLeader()

    // if not successful try a couple more times
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.current_leader) break

      // wait 1/2 the lease duration
      await new Promise((resolve) => {
        setTimeout(resolve, this.lease_duration_sec * 500)
      })

      // try again
      await this.tryToBecomeLeader()
    }
  }

  async tryToBecomeLeader() {

    try {
      let lease = await this.getLease()
      const lease_expired = this.leaseExpired(lease)
      const holder_identity = lease?.spec?.holderIdentity
      this.log.debug({lease_expired, holder_identity}, 'attempting to become leader')

      if (this.leaseExpired(lease) || !lease?.spec?.holderIdentity) {
        this.log.debug('lease expired or not held. acquiring new lease')
        lease = await this.acquireLease(lease)
      }

      if (this.leaseOwner(lease)) return this.becomeLeader()

    } catch (err) {
      this.log.error(err, 'error trying to become leader: %s', err.message)
    }
  }

  becomeLeader() {
    this.current_leader = true
    this.emit(EVENTS.LEADERSHIP_ACQUIRED, {lease: this.lease_name})
    this.scheduleLeaseRenewal()
    this.log.debug('I am the leader')
  }

  async createLease() {

    try {
      const body = await this.client.createNamespacedLease({
        namespace: this.namespace
      , body: {
          metadata: {
            name: this.lease_name
          , namespace: this.namespace
          }
        , spec: {
            holderIdentity: this.#LEADER_IDENTITY
          , leaseDurationSec: this.lease_duration_sec
          , acquireTime: new V1MicroTime(new Date())
          , renewTime: new V1MicroTime(new Date())
          }
        }
      })
      return body
    } catch (err) {
      this.log.error(err, 'failed to create lease: %s', err.message)
      throw err
    }
  }

  async getLease() {
    try {
      const body = await this.client.readNamespacedLease({
        name: this.lease_name
      , namespace: this.namespace
      })
      return body
    } catch (err) {
      console.dir(err.response)
      if (err?.code === 404) {
        this.log.debug('lease not found, creating one.')
        return this.createLease()
      }

      throw err
    }
  }

  async handleLeaseDeletion() {
    if (this.current_leader) return

    try {
      this.tryToBecomeLeader()
    } catch (err) {
      this.log.error(err, 'error while trying to become leader after lease deleteion')
    }
  }
  handleLeaseUpdate(lease) {
    if (this.leaseOwner(lease)) {
      if (!this.current_leader) {
        setTimeout(() => {
          this.becomeLeader()
        }, 2000)
      }
      this.scheduleLeaseRenewal()
    } else if (this.current_leader) {
      this.loseLeadership()
    }
  }

  leaseExpired(lease) {
    const renew_time_ms = lease.spec.renewTime
      ? new Date(lease.spec.renewTime).getTime()
      : 0

    const lease_dur_sec = (lease.spec.leaseDurationSeconds || this.lease_duration_sec)
    const time_elapsed_ms = lease_dur_sec * 1000
    return Date.now() > renew_time_ms + time_elapsed_ms
  }

  leaseOwner(lease) {
    return lease.spec.holderIdentity === this.#LEADER_IDENTITY
  }

  loseLeadership() {
    if (!this.current_leader) return

    this.current_leader = false
    clearTimeout(this.lease_renewal_timeout)
    this.lease_renewal_timeout = null
    this.emit(EVENTS.LEADERSHIP_LOST, {lease: this.lease_name})
    this.log.debug('I am not the leader')
  }

  async releaseLease() {
    try {
      const lease = await this.getLease()
      if (!this.leaseOwner(lease)) return
      this.log.debug('releasing lease %s', this.lease_name)

      lease.spec.holderIdentity = null
      lease.spec.renewTime = null
      await this.client.replaceNamespacedLease({
        name: this.lease_name
      , namespace: this.namespace
      , body: lease
      })

      this.log.debug(`lease for ${this.lease_name} release`)
    } catch (err) {
      this.log.error(err, 'failed to release lease')
    }
  }

  async renewLease() {
    try {
      const lease = await this.getLease()
      if (!this.leaseOwner(lease)) return this.loseLeadership()
      this.log.debug('renewing lease')

      lease.spec.renewTime = new V1MicroTime(new Date())
      const body = await this.client.replaceNamespacedLease({
        name: this.lease_name
      , namespace: this.namespace
      , body: lease
      })

      this.log.debug('successfully renwered lease')
      return body
    } catch (err) {
      this.log.error(err, 'error while renweing lease: %s', err.message)
      this.loseLeadership()
    }
  }

  scheduleLeaseRenewal() {
    clearTimeout(this.lease_renewal_timeout)

    this.lease_renewal_timeout = setTimeout(async () => {
      if (!this.current_leader) return

      try {
        await this.renewLease()
      } catch (err) {
        this.log.error(err, 'Error while renewing lease %s', err.message)
      }
    }, this.renew_interval_ms)
  }

  async shutdown() {
    if (this.current_leader) await this.releaseLease()
  }

  async watchLease() {

    try {
      this.watch.watch(
        this.api_path
      , {}
      , (type, lease) => {
          if (lease?.metadata?.name !== this.lease_name) return

          this.log.debug('watch event %s for lease: %s', type, this.lease_name)

          switch (type) {
            case 'ADDED':
            case 'MODIFIED':
              setTimeout(this.handleLeaseUpdate.bind(this), 2000, lease)
              break
            case 'DELETED':
              setTimeout(this.handleLeaseDeletion.bind(this), 2000, lease)
              break
          }
        }
      , (err) => {
          if (err) this.log.error(err, 'watch for lease ended with error')
          if (!err) this.log.debug('watch for leased gracefully closed')

          // restart the watch
          setTimeout(this.watchLease.bind(this), 5000)
        }
      )
    } catch (err) {
      this.log.error(err, 'Failed to start watch for lease: %s', err.message)
      this.log.err('trying again in 5 seconds')
      // Retry starting the watch after a delay
      setTimeout(this.watchLeaseObject.bind(this), 5000)
    }
  }

}

module.exports = Elector

'use strict'

/**
 * Well known events emitted by an elector instance
 * @typedef {object} LeadershipEvent
 * @property {string} LEADERSHIP_LOST - Name of the event emittted when leadership is revoked
 * @property {string} LEADERSHIP_ACQUIRED - Name of the event emitted when leadership claimed
 * @property {string} LEASE_RENEWED - Name of the event emitted the lease currently owned is renewed
 **/
module.exports = {
  EVENTS: {
    LEADERSHIP_LOST: 'leadership_lost'
  , LEADERSHIP_ACQUIRED: 'leadership_acquired'
  , LEASE_RENEWED: 'lease_renewed'
  }
}

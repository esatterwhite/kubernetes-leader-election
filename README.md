## Kubernetes Leader Election

Leader election for kubernetes using leases

### Installation

```bash
npm install @codedpendant/kubernetes-leader-election -- save
```


<!-- vim-markdown-toc GFM -->

* [Exports](#exports)
    * [Events](#events)
    * [Elector](#elector)
* [Classes](#classes)
    * [Elector(`options`)](#electoroptions)
        * [Properties](#properties)
        * [Methods](#methods)
            * [`start`(): Promise&lt;void&gt;](#start-promiseltvoidgt)
            * [`stop`(): Promise&lt;void&gt;](#stop-promiseltvoidgt)
* [Usage](#usage)
    * [Kubernetes RBAC](#kubernetes-rbac)
        * [Service Account](#service-account)
        * [Role](#role)
        * [RoleBinding](#rolebinding)
        * [Example Deployment](#example-deployment)
* [Authors](#authors)

<!-- vim-markdown-toc -->

## Exports

### Events
* ([Object][]) - Named events that are emitted from elector instances
    * ([String][]) LEADERSHIP_ACQUIRED Event emitted when an elector claims ownership of a lease
    * ([String][]) LEADERSHIP_LOST - Event emitted when an elector recognizes a different elector has claimed ownership
    * ([String][]) LEASE_RENEWED - Event emitted when the currently leader renews its lease resource

### [Elector](#electoroptions)
* ([Class][]) Elector - Elector instances configured with the same lease name will form a coordination group in which
              one, and only one elector instance can be considered the leader

## Classes

**Extends**: [EventEmitter][]

### Elector(`options`)

**Arguments**

* (optional) `options` ([Object][]): Configuration options for the elector
    * (optional) `auto_close` [Boolean][]: If true, the elector will try to stop itself when the `SIGINT` and `SIGTERM` signals are sent to the process
        * default: **true**
    * (optional) `identity` [String][]: A **unique** name for the elector used to claim leadership. THe name of the kubernetes pod is generally safe.
        * default: **elector-{{hostname}}-{{process-id}}**
    * (optional) `lease_name` [String][]: The name of the kubernetes lease the electors will manage.
        * default: `nodejs-leader-election`
    * (optional) `log` [Object][]: A logger instance that implements the [abstract-logging][] interface. [pino][] is recommended.
    * (optional) `namespace` [String][]: The namespace the elector should be constrained to
        * default: **default**
    * (optional) `renew_interval_ms` [Number][]: The frequency at which the leader will attempt to renew its lease
        * default: **10000**
    * (optional) `lease_duration_sec` [Number][]: The amount of time assigned to the active lease. After which it is considered expired and the election process will start again
        * default: **20** (Calculated as (2 * renew_interval_ms) / 1000)
    * (optional) `wait_for_leadership` [Boolean][]: If `true`, when the start() method is called, the elector will wait for a leader to be elected.
        * default: **false**

#### Properties

* current_leader [Boolean][] - Indicates if the elector instance is currently the leader
* lease_name [String][] - The name of the kubernetes lease resources that is being managed
* identity [String][] - The unique name of the elector instance
* namespace [String][] - the kubernetes namespaces the elector is currently bound to

#### Methods

##### `start`(): [Promise][]&lt;void&gt;
##### `stop`(): [Promise][]&lt;void&gt;

## Usage

The elector instance depends entirely on the kubernetes API. As such, if it cannot determine
that it is running in a kubernetes environment, It will not attempt to interact with the
api and it will assume leadership. Generally useful for development when not running in kubernetes.
When created, the elector will check for the environment variable `KUBERNETES_SERVICE_HOST` to
make this determination

```javascript

const {Elector, EVENTS} = require('@codedependant/kubernetes-leader-election')

const elector = new Elector({
  lease_name: 'my-application-lease'
, auto_close: false
, identity: process.env.POD_NAME || `my-application-${process.pid}`
})

elector.on(EVENTS.LEADERSHIP_ACQUIRED, (evt) => {
  // handle becoming the leader
  importantFunction(evt)
})

elector.on(EVENTS.LEADERSHIP_LOST, () => {
  // Handle not being the leader
  importantFunction(evt)
})

process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)

async importantFunction(...args) {
  if (!elector.current_leader) {
    console.log(`I'm not the leader. Nothing to do`)
    return
  }
  // Do something important that only the leader can do
  console.log('Important work has been done')
}
function onSignal(signal) {
  elector.log.info('received signal %s', signal)
  elector.stop()
}

elector.start()
```

### Kubernetes RBAC

To allow your application to manage leases, set up the appropriate RBAC configuration in Kubernetes.
This involves creating a ServiceAccount, Role, and a RoleBinding or ClusterRoleBinding
to grant the necessary permissions.

Below is an example of the minimal setup required

#### Service Account

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: kubernetes-election
  namespace: default
```

#### Role

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: lease-manager
  namespace: default
rules:
  - apiGroups:
      - coordination.k8s.io
    resources:
      - leases
    verbs:
      - get
      - list
      - watch
      - create
      - update
      - patch
      - delete
```

#### RoleBinding

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: lease-manager-binding
  namespace: default
subjects:
- kind: ServiceAccount
  name: kubernetes-election
  namespace: default
roleRef:
  kind: Role
  name: lease-manager
  apiGroup: rbac.authorization.k8s.io
```

#### Example Deployment

Once this is in place, any deployment or pod that makes use of this package should leverage
the previously defined service account. It is highly recommended to make use of the pod name
as the elector instance's identity

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: elector
  labels:
    app: elector
spec:
  selector:
    matchLabels:
      app: elector
  template:
    metadata:
      labels:
        app: elector
    spec:
      serviceAccountName: kubernetes-election
      containers:
        - name: application
          image: your-node-application:latest
          command:
            - node
          args:
            - 'index.js'
          env:
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  apiVersion: v1
                  fieldPath: metadata.name
```

## Authors

* [**Eric Satterwhite**](mailto:esatterwhite@wi.rr.com) &lt;esatterwhite@wi.rr.com&gt;

[String]: https://mdn.io/string
[Object]: https://mdn.io/object
[Class]: https://mdn.io/classes
[Promise]: https://mdn.io/promise
[Boolean]: https://mdn.io/boolean
[Number]: https://mdn.io/number
[abstract-logging]: https://www.npmjs.com/package/abstract-logging
[pino]: https://www.npmjs.com/package/pino
[EventEmitter]: https://nodejs.org/api/events.html#class-eventemitter

/**
 * Copyright 2013-2015, Facebook, Inc.
 * Copyright 2015-2016, Evgeny Zinoviev
 * All rights reserved.
 */

import MicroEvent from 'microevent-emit'

/**
 * Use invariant() to assert state which your program assumes to be true.
 *
 * Provide sprintf-style format (only %s is supported) and arguments
 * to provide information about what broke and what you were
 * expecting.
 *
 * The invariant message will be stripped in production, but the invariant
 * will remain to ensure logic does not differ in production.
 */
function invariant(condition, format, a, b, c, d, e, f) {
  if (format === undefined) {
    throw new Error('invariant requires an error message argument')
  }

  if (!condition) {
    let error
    if (format === undefined) {
      error = new Error('Minified exception occurred; use the non-minified dev environment ' + 'for the full error message and additional helpful warnings.')
    } else {
      let args = [a, b, c, d, e, f]
      let argIndex = 0
      error = new Error('Invariant Violation: ' + format.replace(/%s/g, function () {
        return args[argIndex++]
      }))
    }

    error.framesToPop = 1 // we don't care about invariant's own frame
    throw error
  }
}

class Payloadable {
  _verbose = false

  defaults() {}

  _onPayload(payload) {
    if (this._verbose) {
      console.log('['+this.constructor.name+' _onPayload]', payload)
    }
  }
}

class BaseDispatcher {
  static Prefix = 'ID_'

  _payloadables = {}
  _isDispatching = false
  _isHandled = {}
  _isPending = {}
  _lastID = 1

  /**
   * Registers a callback to be invoked with every dispatched payload. Returns
   * a token that can be used with `waitFor()`.
   * @param {Payloadable} payloadable
   */
  register(payloadable) {
    let id = BaseDispatcher.Prefix + this._lastID++
    this._payloadables[id] = payloadable
    return id
  }

  /**
   * Removes a callback based on its token.
   */
  unregister(id) {
    !this._payloadables[id] ?  true ? invariant(false, this.constructor.name+'.unregister(...): `%s` does not map to a registered callback.', id) : invariant(false) : undefined
    delete this._payloadables[id]
  }

  /**
   * Waits for the callbacks specified to be invoked before continuing execution
   * of the current callback. This method should only be used by a callback in
   * response to a dispatched payload.
   */
  waitFor(...ids) {
    ids = ids.map(id => id.dispatchToken)
    !this._isDispatching ?  true ? invariant(false, this.constructor.name+'.waitFor(...): Must be invoked while dispatching.') : invariant(false) : undefined
    for (let ii = 0; ii < ids.length; ii++) {
      let id = ids[ii]
      if (this._isPending[id]) {
        !this._isHandled[id] ?  true ? invariant(false, this.constructor.name+'.waitFor(...): Circular dependency detected while ' + 'waiting for `%s`.', id) : invariant(false) : undefined
        continue
      }
      !this._payloadables[id] ?  true ? invariant(false, this.constructor.name+'.waitFor(...): `%s` does not map to a registered callback.', id) : invariant(false) : undefined
      this._invokePayloadable(id)
    }
  }

  /**
   * Dispatches a payload to all registered callbacks.
   */
  dispatch(payload) {
    !!this._isDispatching ?  true ? invariant(false, 'Dispatch.dispatch(...): Cannot dispatch in the middle of a dispatch.') : invariant(false) : undefined
    this._startDispatching(payload)
    try {
      for (let id in this._payloadables) {
        if (this._isPending[id]) {
          continue
        }
        this._invokePayloadable(id)
      }
    } finally {
      this._stopDispatching()
    }
  }

  /**
   * Is this Dispatcher currently dispatching.
   */
  isDispatching() {
    return this._isDispatching
  }

  /**
   * Call the callback stored with the given id. Also do some internal
   * bookkeeping.
   *
   * @internal
   */
  _invokePayloadable(id) {
    this._isPending[id] = true
    let payloadable = this._payloadables[id]
    payloadable._onPayload.call(payloadable, this._pendingPayload)
    this._isHandled[id] = true
  }

  /**
   * Set up bookkeeping needed when dispatching.
   *
   * @internal
   */
  _startDispatching(payload) {
    for (let id in this._payloadables) {
      this._isPending[id] = false
      this._isHandled[id] = false
    }
    this._pendingPayload = payload
    this._isDispatching = true
  }

  /**
   * Clear bookkeeping used for dispatching.
   *
   * @internal
   */
  _stopDispatching() {
    delete this._pendingPayload
    this._isDispatching = false
  }
}

/**
 * Dispatcher
 */
class Dispatcher extends BaseDispatcher {
  dispatch(name, data) {
    super.dispatch({ name, data })
  }
}

const dispatcher = new Dispatcher()
const dispatch = dispatcher.dispatch.bind(dispatcher)

/**
 * Router
 */
const history = window.history
const location = window.location

class Router extends BaseDispatcher {
  constructor() {
    super()
    window.addEventListener('popstate', this.update)
  }

  update = () => {
    let route = this.getCurrentUrl()
    this.dispatch(route)
  }

  /**
   * @param {String} url
   */
  go(url) {
    history.pushState({}, '', url)
    this.update()
  }
  
  /**
   * @return {String}
   */
  getCurrentUrl() {
    let l = document.createElement("a")
    l.href = location.href
    return {
      path: l.pathname,
      host: l.host,
      hash: l.hash,
      query: l.search
    }
  }
}
const router = new Router()

/**
 * Base Controller class
 */
class Controller extends Payloadable {
  constructor() {
    super()
    this.dispatchToken = router.register(this)
    this.defaults()
  }

  _onPayload(payload) {
    super._onPayload(payload)
    this.onRoute(payload)
  }

  onRoute() {}
}

/**
 * Base Store class
 */
class Store extends Payloadable {
  constructor() {
    super()
    this.callbacks = {}
    this.dispatchToken = dispatcher.register(this)
    this.defaults()
  }

  onPayload(name, callback) {
    if (this.callbacks[name] === undefined) {
      this.callbacks[name] = []
    }
    this.callbacks[name].push(callback)
    return this
  }

  _onPayload(payload) {
    super._onPayload(payload)
    let { name, data } = payload
    if (this.callbacks[name] !== undefined) {
      for (let callback of this.callbacks[name]) {
        callback(data)
      }
    }
    return true
  }
}
MicroEvent.mixin(Controller)
MicroEvent.mixin(Store)

export {
  Controller,
  Store,

  dispatcher,
  dispatch,

  router
}

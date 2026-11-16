/* Runtime additions for webOS 5 / Chromium 68. Also prepended to workers.
 * Feature-detected, non-enumerable, and independent of application state. */
(function (root) {
  'use strict';
  function define(object, name, value) {
    if (!(name in object)) Object.defineProperty(object, name, { value: value, configurable: true, writable: true });
  }
  define(root, 'globalThis', root);
  define(root, 'queueMicrotask', function (fn) { Promise.resolve().then(fn).catch(function (error) { setTimeout(function () { throw error; }); }); });
  define(Object, 'fromEntries', function (entries) {
    var output = {};
    Array.from(entries).forEach(function (pair) { Object.defineProperty(output, pair[0], { value: pair[1], enumerable: true, writable: true, configurable: true }); });
    return output;
  });
  define(Object, 'hasOwn', function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); });
  define(String.prototype, 'replaceAll', function (search, replacement) {
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('replaceAll requires a global RegExp');
      return String(this).replace(search, replacement);
    }
    var escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(this).replace(new RegExp(escaped, 'g'), replacement);
  });
  define(Array.prototype, 'flat', function (depth) {
    var output = [];
    function append(array, level) { Array.prototype.forEach.call(array, function (value) { if (Array.isArray(value) && level > 0) append(value, level - 1); else output.push(value); }); }
    append(this, depth === undefined ? 1 : Math.max(0, Math.floor(Number(depth)))); return output;
  });
  define(Array.prototype, 'flatMap', function (fn, context) { return Array.prototype.map.call(this, fn, context).flat(); });
  define(Array.prototype, 'at', function (index) { var i = Math.trunc(Number(index)) || 0; return this[i < 0 ? this.length + i : i]; });
  define(Array.prototype, 'findLast', function (fn, context) { for (var i = this.length - 1; i >= 0; i--) if (fn.call(context, this[i], i, this)) return this[i]; });
  define(Array.prototype, 'findLastIndex', function (fn, context) { for (var i = this.length - 1; i >= 0; i--) if (fn.call(context, this[i], i, this)) return i; return -1; });
  define(Array.prototype, 'toSorted', function (compare) { return Array.from(this).sort(compare); });
  define(Array.prototype, 'toReversed', function () { return Array.from(this).reverse(); });
  define(Promise, 'allSettled', function (values) { return Promise.all(Array.from(values).map(function (value) { return Promise.resolve(value).then(function (v) { return { status: 'fulfilled', value: v }; }, function (e) { return { status: 'rejected', reason: e }; }); })); });
  define(Promise, 'withResolvers', function () { var resolve, reject; var promise = new Promise(function (res, rej) { resolve = res; reject = rej; }); return { promise: promise, resolve: resolve, reject: reject }; });
  if (root.AbortSignal) {
    define(AbortSignal, 'timeout', function (delay) { var c = new AbortController(); setTimeout(function () { c.abort(); }, delay); return c.signal; });
    define(AbortSignal.prototype, 'throwIfAborted', function () { if (this.aborted) throw this.reason || new DOMException('Aborted', 'AbortError'); });
  }
  if (root.Element) {
    define(Element.prototype, 'replaceChildren', function () { while (this.firstChild) this.removeChild(this.firstChild); this.append.apply(this, arguments); });
    define(Element.prototype, 'toggleAttribute', function (name, force) { var add = force === undefined ? !this.hasAttribute(name) : Boolean(force); if (add) this.setAttribute(name, ''); else this.removeAttribute(name); return add; });
  }
  if (root.matchMedia) {
    var prototype = Object.getPrototypeOf(root.matchMedia('all'));
    define(prototype, 'addEventListener', function (type, listener) { if (type === 'change') this.addListener(listener); });
    define(prototype, 'removeEventListener', function (type, listener) { if (type === 'change') this.removeListener(listener); });
  }
})(typeof self !== 'undefined' ? self : this);


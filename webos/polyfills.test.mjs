import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('./polyfills.js', import.meta.url), 'utf8');
test('legacy page and worker runtime: sparse arrays, iterable entries, safe keys', () => {
  const context = vm.createContext({});
  vm.runInContext('delete Object.fromEntries; delete Array.prototype.flat; delete Array.prototype.flatMap; delete Object.hasOwn; delete String.prototype.replaceAll; delete globalThis.globalThis;', context);
  vm.runInContext(source, context);
  assert.equal(vm.runInContext('JSON.stringify([1,,2].flatMap(x => [x,x]))', context), '[1,1,2,2]');
  assert.equal(vm.runInContext('Object.fromEntries(new Map([["a", 7]])).a', context), 7);
  assert.equal(vm.runInContext('Object.hasOwn(Object.fromEntries([["__proto__", 7]]), "__proto__")', context), true);
  assert.equal(vm.runInContext('Object.keys(Array.prototype).includes("flat")', context), false);
  assert.equal(vm.runInContext('globalThis === this', context), true);
  assert.equal(vm.runInContext('"a_b_c".replaceAll("_", "-")', context), 'a-b-c');
  assert.equal(vm.runInContext('"a.b.c".replaceAll(".", "$&!")', context), 'a.!b.!c');
});
test('modern runtime implementations are preserved', () => {
  const context = vm.createContext({});
  vm.runInContext('var original = Object.fromEntries;', context);
  vm.runInContext(source, context);
  assert.equal(vm.runInContext('Object.fromEntries === original', context), true);
});
test('legacy worker messages preserve the original transferable list', () => {
  const context = vm.createContext({});
  vm.runInContext(`
    var received;
    function MessagePort() {}
    MessagePort.prototype.close = function () {};
    MessagePort.prototype.postMessage = function(data, transfer) {
      if (transfer && !Array.isArray(transfer)) throw new TypeError('legacy signature');
      received = transfer;
    };
    function MessageChannel() { this.port1 = new MessagePort(); this.port2 = new MessagePort(); }
    function Worker() {}
    Worker.prototype.postMessage = MessagePort.prototype.postMessage;
  `, context);
  vm.runInContext(source, context);
  assert.equal(vm.runInContext('var list = [new ArrayBuffer(8)]; new Worker().postMessage({}, {transfer:list}); received === list', context), true);
  assert.equal(vm.runInContext('new Worker().postMessage({}, list); received === list', context), true);
});


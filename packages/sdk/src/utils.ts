export function isFunction(value: any): value is Function {
  return value && (Object.prototype.toString.call(value) === '[object Function]' || typeof value === 'function' || value instanceof Function)
}

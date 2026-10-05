export function encodeAuthoredValue(value: unknown): unknown;
export function decodeAuthoredValue(value: unknown): unknown;
export function pack(value: unknown, ancestors: Set<object>): unknown;
export function unpack(value: unknown): unknown;
export function check(ok: unknown, message: string): asserts ok;
export function own(object: object, key: string): boolean;

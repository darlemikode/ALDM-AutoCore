const m = new Map();
export async function getItemAsync(k) { return m.get(k) ?? null; }
export async function setItemAsync(k, v) { m.set(k, v); }
export async function deleteItemAsync(k) { m.delete(k); }

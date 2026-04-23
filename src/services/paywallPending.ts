let _pending = false;

export function setPaywallPending() {
  _pending = true;
}

export function consumePaywallPending(): boolean {
  const was = _pending;
  _pending = false;
  return was;
}

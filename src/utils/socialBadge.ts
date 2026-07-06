type Listener = (count: number) => void;

let _total = 0;
let _msgs = 0;
const totalListeners = new Set<Listener>();
const msgsListeners = new Set<Listener>();

export function setSocialBadge(total: number, msgs: number) {
  _total = total;
  _msgs = msgs;
  totalListeners.forEach((l) => l(total));
  msgsListeners.forEach((l) => l(msgs));
}

export function subscribeSocialBadge(fn: Listener) {
  totalListeners.add(fn);
  fn(_total);
  return () => { totalListeners.delete(fn); };
}

export function subscribeMessagesBadge(fn: Listener) {
  msgsListeners.add(fn);
  fn(_msgs);
  return () => { msgsListeners.delete(fn); };
}

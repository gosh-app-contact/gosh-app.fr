let _uid: string | null = null;

export function setCurrentUid(uid: string | null) { _uid = uid; }
export function getCurrentUid(): string | null { return _uid; }

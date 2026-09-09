export function safeReturnPath(state: unknown): string {
  if (
    typeof state !== 'object' ||
    state === null ||
    !('from' in state) ||
    typeof state.from !== 'string'
  )
    return '/';
  const path = state.from;
  return path.startsWith('/') &&
    !path.startsWith('//') &&
    !/[\\?#\s%]/.test(path) &&
    path !== '/login'
    ? path
    : '/';
}

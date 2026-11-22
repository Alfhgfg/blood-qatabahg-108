const MAX_HISTORY_LENGTH = 30;

let entrySequence = 0;

function generateEntryKey(page) {
  entrySequence += 1;
  return `nav-${page}-${Date.now()}-${entrySequence}`;
}

export function createNavEntry(page, options = {}) {
  return {
    key: options.key || generateEntryKey(page),
    page,
    hospitalAdId: options.hospitalAdId ?? null
  };
}

export function isSameNavTarget(entry, targetPage, options = {}) {
  if (!entry || entry.page !== targetPage) return false;
  if (targetPage === 'hospital-ad') {
    return (entry.hospitalAdId ?? null) === (options.hospitalAdId ?? null);
  }
  return true;
}

export function pushNavEntry(stack, targetPage, options = {}) {
  const safeStack =
    Array.isArray(stack) && stack.length > 0 ? stack : [createNavEntry('home')];
  const current = safeStack[safeStack.length - 1];

  if (isSameNavTarget(current, targetPage, options)) {
    return {
      stack: safeStack,
      changed: false,
      current,
      previous: safeStack.length > 1 ? safeStack[safeStack.length - 2] : null
    };
  }

  const nextEntry = createNavEntry(targetPage, options);
  const combined = [...safeStack, nextEntry];
  const trimmed =
    combined.length > MAX_HISTORY_LENGTH
      ? combined.slice(combined.length - MAX_HISTORY_LENGTH)
      : combined;

  return {
    stack: trimmed,
    changed: true,
    current: nextEntry,
    previous: current
  };
}

export function popNavEntry(stack) {
  if (!Array.isArray(stack) || stack.length <= 1) {
    const current = Array.isArray(stack) && stack.length === 1 ? stack[0] : null;
    return {
      stack: current ? [current] : [createNavEntry('home')],
      popped: null,
      current,
      canGoBack: false
    };
  }

  const popped = stack[stack.length - 1];
  const nextStack = stack.slice(0, stack.length - 1);
  return {
    stack: nextStack,
    popped,
    current: nextStack[nextStack.length - 1],
    canGoBack: true
  };
}

export function resetNavStack(initialPage = 'home', options = {}) {
  return [createNavEntry(initialPage, options)];
}

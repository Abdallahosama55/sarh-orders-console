import type { ReactNode } from 'react';
import { useCurrentUser } from './session';

/**
 * Hides admin-only controls from agents. This is UX, not security: the inherited code relied on
 * a component like this to protect DELETE, which any agent could bypass with curl. The server
 * enforces the rule with requireRole('admin').
 */
export function AdminOnly({ children }: { children: ReactNode }) {
  return useCurrentUser().role === 'admin' ? children : null;
}

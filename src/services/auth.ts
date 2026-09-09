import { DEMO_PASSWORD } from '@/data/demo';
import { localStore } from '@/providers/database/LocalDatabase';
import { apiRequest, isLocalGymApi } from '@/services/api';
import type { AuthSession, User } from '@shared/types';

export async function loginWithPassword(email: string, password: string): Promise<AuthSession> {
  try {
    return await apiRequest<AuthSession>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch (err) {
    if (!isLocalGymApi()) throw err;
  }

  const users = await localStore.allUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user || password !== DEMO_PASSWORD) {
    throw new Error('Invalid email or password.');
  }
  return {
    token: `local.${user.id}.${Date.now()}`,
    user,
  };
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest('/auth/forgot', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim() }),
  });
}

export async function confirmPasswordReset(email: string, code: string, password: string): Promise<void> {
  await apiRequest('/auth/confirm-forgot', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), code: code.trim(), password }),
  });
}

export async function currentUserByToken(token: string): Promise<User | null> {
  const users = await localStore.allUsers();
  const id = token.split('.')[1];
  return users.find((u) => u.id === id) ?? null;
}

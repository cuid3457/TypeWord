/**
 * Friend system — privacy-conscious by design.
 *
 *   - Anonymous users have no friend_code (sign-up gated server-side).
 *   - Adding a friend requires the 6-char code (no email/name search).
 *   - Stats shared are aggregates only (no individual words/sentences).
 *   - Each user can hide their stats via stats_public toggle.
 *   - Block/report are first-class operations.
 *
 * All RPCs run with security_definer on the server and validate the caller's
 * identity + anonymity status.
 */
import { supabase } from '@src/api/supabase';

export interface FriendRow {
  friendId: string;
  displayName: string;
  statsPublic: boolean;
  totalWords: number | null;
  masteredWords: number | null;
  languageCount: number | null;
}

export class FriendsError extends Error {
  code: 'unauthenticated' | 'must_sign_up' | 'not_found' | 'self' | 'unknown';
  constructor(message: string, code: FriendsError['code']) {
    super(message);
    this.code = code;
  }
}

function mapPgError(err: { message?: string; code?: string } | null): FriendsError {
  const msg = err?.message ?? 'unknown';
  const c = err?.code;
  if (c === '28000') return new FriendsError(msg, 'unauthenticated');
  if (c === 'P0001') return new FriendsError(msg, 'must_sign_up');
  if (c === 'P0002') return new FriendsError(msg, 'not_found');
  if (c === 'P0003') return new FriendsError(msg, 'self');
  if (msg.includes('not_found') || msg.includes('not found')) return new FriendsError(msg, 'not_found');
  if (msg.includes('Sign up')) return new FriendsError(msg, 'must_sign_up');
  return new FriendsError(msg, 'unknown');
}

export async function ensureFriendCode(): Promise<string | null> {
  const { data, error } = await supabase.rpc('ensure_friend_code');
  if (error) {
    if (error.code === 'P0001' || /sign up/i.test(error.message)) return null;
    throw mapPgError(error);
  }
  return (data as string) ?? null;
}

export async function addFriendByCode(code: string): Promise<string> {
  const trimmed = code.trim().toUpperCase();
  const { data, error } = await supabase.rpc('add_friend_by_code', { p_code: trimmed });
  if (error) throw mapPgError(error);
  return data as string;
}

export async function removeFriend(friendId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', { p_friend_id: friendId });
  if (error) throw mapPgError(error);
}

export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_user_id: userId });
  if (error) throw mapPgError(error);
}

export async function reportUser(userId: string, reason: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const reporterId = session.session?.user?.id;
  if (!reporterId) throw new FriendsError('Not authenticated', 'unauthenticated');
  const { error } = await supabase.from('friend_reports').insert({
    reporter_id: reporterId,
    reported_id: userId,
    reason,
  });
  if (error) throw mapPgError(error);
}

export async function listFriends(): Promise<FriendRow[]> {
  const { data, error } = await supabase.rpc('get_my_friends');
  if (error) throw mapPgError(error);
  return ((data ?? []) as Array<{
    friend_id: string;
    display_name: string;
    stats_public: boolean;
    total_words: number | null;
    mastered_words: number | null;
    language_count: number | null;
  }>).map((r) => ({
    friendId: r.friend_id,
    displayName: r.display_name,
    statsPublic: r.stats_public,
    totalWords: r.total_words,
    masteredWords: r.mastered_words,
    languageCount: r.language_count,
  }));
}

export async function setDisplayName(name: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) throw new FriendsError('Not authenticated', 'unauthenticated');
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name.trim() })
    .eq('user_id', uid);
  if (error) throw mapPgError(error);
}

export async function setStatsPublic(visible: boolean): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) throw new FriendsError('Not authenticated', 'unauthenticated');
  const { error } = await supabase
    .from('profiles')
    .update({ stats_public: visible })
    .eq('user_id', uid);
  if (error) throw mapPgError(error);
}

export interface MyProfile {
  displayName: string | null;
  friendCode: string | null;
  statsPublic: boolean;
  isAnonymous: boolean;
}

export interface ReferralResult {
  granted: boolean;
  bonusPremiumUntil?: string;
  bonusDays?: number;
  reason?: string;
}

/**
 * Apply a referral bonus. Called by the invitee after they sign up. Grants
 * 7 days of bonus premium to both the inviter and the invitee. One-time
 * per invitee — re-calls return granted=false with reason='already_claimed'.
 */
export async function applyReferral(inviterCode: string): Promise<ReferralResult> {
  const trimmed = inviterCode.trim().toUpperCase();
  const { data, error } = await supabase.rpc('apply_referral', { p_inviter_code: trimmed });
  if (error) throw mapPgError(error);
  const r = (data ?? {}) as { granted?: boolean; bonus_premium_until?: string; bonus_days?: number; reason?: string };
  return {
    granted: r.granted ?? false,
    bonusPremiumUntil: r.bonus_premium_until,
    bonusDays: r.bonus_days,
    reason: r.reason,
  };
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, friend_code, stats_public')
    .eq('user_id', user.id)
    .maybeSingle();
  return {
    displayName: (profile?.display_name as string | null) ?? null,
    friendCode: (profile?.friend_code as string | null) ?? null,
    statsPublic: (profile?.stats_public as boolean | null) ?? true,
    isAnonymous: user.is_anonymous ?? true,
  };
}

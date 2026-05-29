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
  username: string | null;
  statsPublic: boolean;
  streakCurrent: number | null;
  xpTotal: number | null;
}

export class FriendsError extends Error {
  code: 'unauthenticated' | 'must_sign_up' | 'not_found' | 'self' | 'already_friends' | 'not_friends' | 'cooldown' | 'username_taken' | 'username_invalid' | 'unknown';
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
  if (c === 'P0004') return new FriendsError(msg, 'already_friends');
  if (c === 'P0005') return new FriendsError(msg, 'not_friends');
  if (c === 'P0006') return new FriendsError(msg, 'cooldown');
  if (c === 'P0011') return new FriendsError(msg, 'username_invalid');
  if (c === 'P0012') return new FriendsError(msg, 'username_taken');
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

export type UserReportReason =
  | 'inappropriate_profile'
  | 'harassment'
  | 'spam'
  | 'impersonation'
  | 'other';

export async function reportUser(
  userId: string,
  reason: UserReportReason,
  description?: string,
): Promise<void> {
  const { error } = await supabase.rpc('report_user', {
    p_user_id: userId,
    p_reason: reason,
    p_description: description ?? null,
  });
  if (error) throw mapPgError(error);
}

export type WordlistReportReason =
  | 'inappropriate_content'
  | 'spam'
  | 'copyright'
  | 'low_quality'
  | 'other';

export async function reportWordlist(
  wordlistId: string,
  reason: WordlistReportReason,
  description?: string,
): Promise<void> {
  const { error } = await supabase.rpc('report_wordlist', {
    p_wordlist_id: wordlistId,
    p_reason: reason,
    p_description: description ?? null,
  });
  if (error) throw mapPgError(error);
}

export async function listFriends(): Promise<FriendRow[]> {
  const { data, error } = await supabase.rpc('get_my_friends');
  if (error) throw mapPgError(error);
  return ((data ?? []) as Array<{
    friend_id: string;
    display_name: string;
    username: string | null;
    stats_public: boolean;
    streak_current: number | null;
    xp_total: number | null;
  }>).map((r) => ({
    friendId: r.friend_id,
    displayName: r.display_name,
    username: r.username,
    statsPublic: r.stats_public,
    streakCurrent: r.streak_current,
    xpTotal: r.xp_total,
  }));
}

export async function sendPoke(recipientId: string): Promise<void> {
  const { data, error } = await supabase.rpc('send_poke', { p_recipient_id: recipientId });
  if (error) throw mapPgError(error);
  const row = Array.isArray(data) ? data[0] : data;
  // Push only when the server says we're outside the 1-hour push throttle
  // window — otherwise the in-app inbox still records the poke but the
  // recipient's phone doesn't get blasted with notifications.
  if (row?.should_push) {
    supabase.functions.invoke('poke-notify', { body: { recipientId } }).catch(() => {});
  }
}

export interface PokeRecord {
  /** Surrogate row id — each poke event is its own row, keyed by this. */
  id: number;
  userId: string;
  username: string;
  displayName: string;
  createdAt: string;
  /** Timestamp the recipient first opened the inbox after this poke. Null = unread. */
  seenAt: string | null;
}

export async function listRecentPokes(): Promise<PokeRecord[]> {
  const { data, error } = await supabase.rpc('list_recent_pokes');
  if (error) throw mapPgError(error);
  return ((data ?? []) as Array<{
    id: number;
    sender_id: string;
    username: string;
    display_name: string;
    created_at: string;
    seen_at: string | null;
  }>).map((r) => ({
    id: r.id,
    userId: r.sender_id,
    username: r.username,
    displayName: r.display_name,
    createdAt: r.created_at,
    seenAt: r.seen_at,
  }));
}

export async function countUnseenPokes(): Promise<number> {
  const { data, error } = await supabase.rpc('count_unseen_pokes');
  if (error) throw mapPgError(error);
  return typeof data === 'number' ? data : 0;
}

export async function markPokesSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_pokes_seen');
  if (error) throw mapPgError(error);
}

export async function deletePoke(pokeId: number): Promise<void> {
  const { error } = await supabase.rpc('delete_poke', { p_poke_id: pokeId });
  if (error) throw mapPgError(error);
}

export async function syncXpToCloud(xp: number): Promise<void> {
  const { error } = await supabase.rpc('set_xp_total', { p_xp: xp });
  if (error) throw mapPgError(error);
}

export async function fetchCloudXp(): Promise<number> {
  const { data, error } = await supabase.rpc('get_my_xp_total');
  if (error) throw mapPgError(error);
  return Number(data ?? 0);
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
  username: string | null;
  statsPublic: boolean;
  isAnonymous: boolean;
}

export interface UsernameValidation {
  ok: boolean;
  code?: 'too_short' | 'too_long' | 'invalid_format' | 'mixed_script' | 'reserved'
       | 'blocklist_match' | 'moderation_flagged' | 'taken' | 'unauthorized'
       | 'anonymous_blocked' | 'write_failed' | 'server_error';
  normalized?: string;
}

export async function validateUsername(username: string): Promise<UsernameValidation> {
  const { data, error } = await supabase.functions.invoke<UsernameValidation>('username-set', {
    body: { mode: 'validate', username },
  });
  if (error) return { ok: false, code: 'server_error' };
  return data ?? { ok: false, code: 'server_error' };
}

export async function setUsername(username: string): Promise<UsernameValidation> {
  const { data, error } = await supabase.functions.invoke<UsernameValidation>('username-set', {
    body: { mode: 'set', username },
  });
  if (error) return { ok: false, code: 'server_error' };
  return data ?? { ok: false, code: 'server_error' };
}

export interface UserSearchResult {
  userId: string;
  username: string;
  displayName: string;
  hasPendingRequest: boolean;
}

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const { data, error } = await supabase.rpc('search_users_by_username', { p_query: query });
  if (error) throw mapPgError(error);
  return ((data ?? []) as Array<{
    user_id: string;
    username: string;
    display_name: string;
    has_pending_request: boolean;
  }>).map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    hasPendingRequest: r.has_pending_request,
  }));
}

export interface FriendRequest {
  userId: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export async function sendFriendRequest(username: string): Promise<{ recipientId: string; autoAccepted: boolean }> {
  const { data, error } = await supabase.rpc('send_friend_request', { p_username: username });
  if (error) throw mapPgError(error);
  const row = Array.isArray(data) ? data[0] : data;
  const recipientId = row?.recipient_id as string;
  const autoAccepted = !!row?.auto_accepted;
  // Best-effort push notification — fire-and-forget, ignore failures so a
  // missing token / network blip doesn't prevent the request from being saved.
  if (recipientId && !autoAccepted) {
    supabase.functions.invoke('friend-request-notify', { body: { recipientId } }).catch(() => {});
  }
  return { recipientId, autoAccepted };
}

/**
 * Persist the device's raw push token + platform to the current user's
 * profile so friend-request-notify and poke-notify can deliver pushes
 * directly via FCM (Android) or APNs (iOS). Idempotent: skips writes
 * when neither field would change.
 */
export async function syncPushTokenToProfile(
  token: string,
  platform: 'android' | 'ios-sandbox' | 'ios-production',
): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid || !token) return;
  const { data: existing } = await supabase
    .from('profiles')
    .select('push_token, push_platform')
    .eq('user_id', uid)
    .maybeSingle();
  if (existing?.push_token === token && existing?.push_platform === platform) return;
  await supabase
    .from('profiles')
    .update({ push_token: token, push_platform: platform })
    .eq('user_id', uid);
}

export async function acceptFriendRequest(senderId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_friend_request', { p_sender_id: senderId });
  if (error) throw mapPgError(error);
  // Best-effort push to the original requester so their friends list
  // refreshes in real time instead of waiting for tab refocus.
  supabase.functions.invoke('friend-accept-notify', { body: { requesterId: senderId } })
    .catch(() => { /* silent — push is best-effort */ });
}

export async function rejectFriendRequest(senderId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_friend_request', { p_sender_id: senderId });
  if (error) throw mapPgError(error);
}

/**
 * Subscribe to new friendships inserted for the current user. Fires when
 * either side of the relationship is added — Postgres publication on the
 * friendships table delivers INSERT events; we filter on user_id so each
 * client only sees their own additions. Returns an unsubscribe fn.
 *
 * Drives real-time UI refresh on the original requester's side when the
 * recipient accepts, since iOS foreground push delivery proved unreliable.
 */
export function subscribeFriendshipsForUser(
  userId: string,
  onInsert: () => void,
): () => void {
  // Per-call unique name suffix — Supabase's channel-by-name registry
  // hands back the previous channel if the topic matches, and on a
  // remount that channel's already-subscribed state rejects new
  // `.on()` callbacks ("cannot add postgres_changes callbacks after
  // subscribe()"). Random suffix sidesteps the cache hit entirely.
  const suffix = Math.random().toString(36).slice(2, 10);
  const channel = supabase
    .channel(`friendships:${userId}:${suffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'friendships', filter: `user_id=eq.${userId}` },
      () => { onInsert(); },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * Subscribe to pokes addressed to `userId`. Each poke is its own row, so
 * INSERT events alone cover the "new poke arrived" signal — UPDATE only
 * fires for our own seen_at / last_pushed_at writes and would cause a
 * reload loop.
 */
export function subscribePokesForUser(
  userId: string,
  onChange: () => void,
): () => void {
  const suffix = Math.random().toString(36).slice(2, 10);
  const channel = supabase
    .channel(`pokes:${userId}:${suffix}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pokes', filter: `recipient_id=eq.${userId}` },
      () => { onChange(); },
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function cancelFriendRequest(recipientId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_friend_request', { p_recipient_id: recipientId });
  if (error) throw mapPgError(error);
}

export async function listIncomingRequests(): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('list_incoming_friend_requests');
  if (error) throw mapPgError(error);
  return ((data ?? []) as Array<{
    sender_id: string;
    username: string;
    display_name: string;
    created_at: string;
  }>).map((r) => ({
    userId: r.sender_id,
    username: r.username,
    displayName: r.display_name,
    createdAt: r.created_at,
  }));
}

export async function listOutgoingRequests(): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('list_outgoing_friend_requests');
  if (error) throw mapPgError(error);
  return ((data ?? []) as Array<{
    recipient_id: string;
    username: string;
    display_name: string;
    created_at: string;
  }>).map((r) => ({
    userId: r.recipient_id,
    username: r.username,
    displayName: r.display_name,
    createdAt: r.created_at,
  }));
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
    .select('display_name, friend_code, username, stats_public')
    .eq('user_id', user.id)
    .maybeSingle();
  return {
    displayName: (profile?.display_name as string | null) ?? null,
    friendCode: (profile?.friend_code as string | null) ?? null,
    username: (profile?.username as string | null) ?? null,
    statsPublic: (profile?.stats_public as boolean | null) ?? true,
    isAnonymous: user.is_anonymous ?? true,
  };
}

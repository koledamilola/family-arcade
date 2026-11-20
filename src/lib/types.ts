export type MemberRole = "parent" | "adult" | "kid";

export type Profile = {
  id: string;
  family_id: string | null;
  member_role: MemberRole | null;
  is_platform_admin: boolean;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  avatar_emoji: string;
  email: string | null;
  created_at: string;
};

export type Family = {
  id: string;
  name: string;
  status: "active" | "suspended";
  created_by: string | null;
  created_at: string;
};

export type Invite = {
  code: string;
  family_id: string;
  role: "parent" | "adult";
  created_at: string;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
};

export type GameKind = "html" | "zip" | "url";

/**
 * draft: being made · pending: a kid asked to publish, waiting for a parent ·
 * published: on the family arcade · hidden: taken down by a parent · rejected: sent back
 */
export type GameStatus = "draft" | "pending" | "published" | "hidden" | "rejected";

export type Game = {
  id: string;
  family_id: string;
  slug: string;
  title: string;
  description: string;
  creator_name: string;
  category: string;
  controls: string;
  thumbnail_url: string | null;
  cover_emoji: string;
  cover_color: string;
  kind: GameKind;
  storage_prefix: string | null;
  entry_path: string | null;
  external_url: string | null;
  has_scores: boolean;
  score_label: string;
  lower_is_better: boolean;
  supports_touch: boolean;
  supports_gamepad: boolean;
  status: GameStatus;
  review_note: string | null;
  share_token: string;
  share_enabled: boolean;
  play_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type GameCard = Game & { like_count: number };

export type LeaderboardRow = {
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  avatar_url: string | null;
  best: number;
  achieved_at: string;
};

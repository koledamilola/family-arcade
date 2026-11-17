export type Role = "pending" | "player" | "admin";

export type Profile = {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  avatar_emoji: string;
  role: Role;
  is_kid: boolean;
  email: string | null;
  created_at: string;
};

export type GameKind = "html" | "zip" | "url";

export type Game = {
  id: string;
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
  published: boolean;
  play_count: number;
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

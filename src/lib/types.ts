export type Phase = 'lobby' | 'briefing' | 'mission' | 'review' | 'confirm' | 'finished' | 'closed';

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: 'lobby' | 'playing' | 'closed';
  started_at: string | null;
  ended_at: string | null;
  support_used: boolean;
  support_active: boolean;
  support_activated_at: string | null;
  verdict: 'confirmed' | 'pending_verification' | null;
  created_at: string;
}

export interface Player {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  task_no: number;
  joined_at: string;
}

export interface PlayerResult {
  player_id: string;
  room_id: string;
  attempts: number;
  first_score: number | null;
  first_submitted_at: string | null;
  best_score: number;
  is_complete: boolean;
  completed_at: string | null;
  before_support_complete: boolean | null;
  before_support_score: number | null;
  updated_at: string;
}

export interface TaskDef {
  no: number;
  title: string;
  prompt: string;
  kind: 'numeric' | 'choice' | 'symbol';
  fields: { key: string; label: string }[] | null;
  options: { id: string; text: string }[] | null;
}

export interface Solution {
  task_no: number;
  answer_text: string | null;
  explanation: string | null;
  hint: string | null;
  own: boolean;
}

export type Response = Record<string, string>;

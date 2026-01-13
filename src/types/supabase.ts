/**
 * Supabase Database Types
 *
 * This file contains TypeScript types for the Supabase database schema.
 * In production, these types should be generated using the Supabase CLI:
 *
 *   npx supabase gen types typescript --project-id <project-id> > src/types/supabase.ts
 *
 * For now, this is a placeholder with the Database type structure that matches
 * our schema defined in docs/02-technical/database/supabase-schema.md
 *
 * @module types/supabase
 */

/**
 * Database type for Supabase client typing.
 *
 * When Supabase project is set up, regenerate with:
 * npx supabase gen types typescript --project-id <project-id> --schema public
 *
 * These placeholder types match supabase-schema.md v15 (2026-01-12).
 */
export type Database = {
  public: {
    Tables: {
      players: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          nickname: string | null;
          jersey_number: string | null;
          is_goalie: boolean;
          color: string | null;
          notes: string | null;
          received_fair_play_card: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          nickname?: string | null;
          jersey_number?: string | null;
          is_goalie?: boolean;
          color?: string | null;
          notes?: string | null;
          received_fair_play_card?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          nickname?: string | null;
          jersey_number?: string | null;
          is_goalie?: boolean;
          color?: string | null;
          notes?: string | null;
          received_fair_play_card?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      teams: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          color: string | null;
          notes: string | null;
          age_group: string | null;
          game_type: string | null;
          archived: boolean;
          bound_season_id: string | null;
          bound_tournament_id: string | null;
          bound_tournament_series_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          color?: string | null;
          notes?: string | null;
          age_group?: string | null;
          game_type?: string | null;
          archived?: boolean;
          bound_season_id?: string | null;
          bound_tournament_id?: string | null;
          bound_tournament_series_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          color?: string | null;
          notes?: string | null;
          age_group?: string | null;
          game_type?: string | null;
          archived?: boolean;
          bound_season_id?: string | null;
          bound_tournament_id?: string | null;
          bound_tournament_series_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      team_players: {
        Row: {
          id: string;
          team_id: string;
          player_id: string;
          user_id: string;
          name: string;
          nickname: string | null;
          jersey_number: string | null;
          is_goalie: boolean;
          color: string | null;
          notes: string | null;
          received_fair_play_card: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          team_id: string;
          player_id: string;
          user_id: string;
          name: string;
          nickname?: string | null;
          jersey_number?: string | null;
          is_goalie?: boolean;
          color?: string | null;
          notes?: string | null;
          received_fair_play_card?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          team_id?: string;
          player_id?: string;
          user_id?: string;
          name?: string;
          nickname?: string | null;
          jersey_number?: string | null;
          is_goalie?: boolean;
          color?: string | null;
          notes?: string | null;
          received_fair_play_card?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      seasons: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          location: string | null;
          period_count: number | null;
          period_duration: number | null;
          start_date: string | null;
          end_date: string | null;
          game_dates: string[] | null;
          archived: boolean;
          notes: string | null;
          color: string | null;
          badge: string | null;
          age_group: string | null;
          game_type: string | null;
          gender: string | null;
          league_id: string | null;
          custom_league_name: string | null;
          club_season: string | null;
          team_placements: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          location?: string | null;
          period_count?: number | null;
          period_duration?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          game_dates?: string[] | null;
          archived?: boolean;
          notes?: string | null;
          color?: string | null;
          badge?: string | null;
          age_group?: string | null;
          game_type?: string | null;
          gender?: string | null;
          league_id?: string | null;
          custom_league_name?: string | null;
          club_season?: string | null;
          team_placements?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          location?: string | null;
          period_count?: number | null;
          period_duration?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          game_dates?: string[] | null;
          archived?: boolean;
          notes?: string | null;
          color?: string | null;
          badge?: string | null;
          age_group?: string | null;
          game_type?: string | null;
          gender?: string | null;
          league_id?: string | null;
          custom_league_name?: string | null;
          club_season?: string | null;
          team_placements?: unknown;
          created_at?: string;
          updated_at?: string;
        };
      };
      tournaments: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          location: string | null;
          period_count: number | null;
          period_duration: number | null;
          start_date: string | null;
          end_date: string | null;
          game_dates: string[] | null;
          archived: boolean;
          notes: string | null;
          color: string | null;
          badge: string | null;
          level: string | null;
          age_group: string | null;
          awarded_player_id: string | null;
          game_type: string | null;
          gender: string | null;
          club_season: string | null;
          team_placements: unknown;
          series: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          location?: string | null;
          period_count?: number | null;
          period_duration?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          game_dates?: string[] | null;
          archived?: boolean;
          notes?: string | null;
          color?: string | null;
          badge?: string | null;
          level?: string | null;
          age_group?: string | null;
          awarded_player_id?: string | null;
          game_type?: string | null;
          gender?: string | null;
          club_season?: string | null;
          team_placements?: unknown;
          series?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          location?: string | null;
          period_count?: number | null;
          period_duration?: number | null;
          start_date?: string | null;
          end_date?: string | null;
          game_dates?: string[] | null;
          archived?: boolean;
          notes?: string | null;
          color?: string | null;
          badge?: string | null;
          level?: string | null;
          age_group?: string | null;
          awarded_player_id?: string | null;
          game_type?: string | null;
          gender?: string | null;
          club_season?: string | null;
          team_placements?: unknown;
          series?: unknown;
          created_at?: string;
          updated_at?: string;
        };
      };
      personnel: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          role: string;
          email: string | null;
          phone: string | null;
          certifications: string[];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          role?: string;
          email?: string | null;
          phone?: string | null;
          certifications?: string[];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          role?: string;
          email?: string | null;
          phone?: string | null;
          certifications?: string[];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      games: {
        Row: {
          id: string;
          user_id: string;
          team_id: string | null;
          season_id: string | null;
          tournament_id: string | null;
          tournament_series_id: string | null;
          tournament_level: string | null;
          team_name: string;
          opponent_name: string;
          game_date: string;
          game_time: string | null;
          game_location: string | null;
          home_or_away: string;
          age_group: string | null;
          number_of_periods: number;
          period_duration_minutes: number;
          sub_interval_minutes: number | null;
          demand_factor: number | null;
          game_status: string;
          current_period: number;
          is_played: boolean;
          time_elapsed_in_seconds: number | null;
          home_score: number;
          away_score: number;
          show_player_names: boolean;
          game_notes: string;
          game_type: string | null;
          gender: string | null;
          league_id: string | null;
          custom_league_name: string | null;
          game_personnel: string[];
          formation_snap_points: unknown | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          team_id?: string | null;
          season_id?: string | null;
          tournament_id?: string | null;
          tournament_series_id?: string | null;
          tournament_level?: string | null;
          team_name: string;
          opponent_name: string;
          game_date: string;
          game_time?: string | null;
          game_location?: string | null;
          home_or_away?: string;
          age_group?: string | null;
          number_of_periods?: number;
          period_duration_minutes: number;
          sub_interval_minutes?: number | null;
          demand_factor?: number | null;
          game_status?: string;
          current_period?: number;
          is_played?: boolean;
          time_elapsed_in_seconds?: number | null;
          home_score?: number;
          away_score?: number;
          show_player_names?: boolean;
          game_notes?: string;
          game_type?: string | null;
          gender?: string | null;
          league_id?: string | null;
          custom_league_name?: string | null;
          game_personnel?: string[];
          formation_snap_points?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          team_id?: string | null;
          season_id?: string | null;
          tournament_id?: string | null;
          tournament_series_id?: string | null;
          tournament_level?: string | null;
          team_name?: string;
          opponent_name?: string;
          game_date?: string;
          game_time?: string | null;
          game_location?: string | null;
          home_or_away?: string;
          age_group?: string | null;
          number_of_periods?: number;
          period_duration_minutes?: number;
          sub_interval_minutes?: number | null;
          demand_factor?: number | null;
          game_status?: string;
          current_period?: number;
          is_played?: boolean;
          time_elapsed_in_seconds?: number | null;
          home_score?: number;
          away_score?: number;
          show_player_names?: boolean;
          game_notes?: string;
          game_type?: string | null;
          gender?: string | null;
          league_id?: string | null;
          custom_league_name?: string | null;
          game_personnel?: string[];
          formation_snap_points?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      game_players: {
        Row: {
          id: string;
          game_id: string;
          player_id: string;
          user_id: string;
          player_name: string;
          nickname: string | null;
          jersey_number: string | null;
          is_goalie: boolean;
          color: string | null;
          notes: string | null;
          received_fair_play_card: boolean;
          is_selected: boolean;
          on_field: boolean;
          rel_x: number | null;
          rel_y: number | null;
          created_at: string;
        };
        Insert: {
          id: string;
          game_id: string;
          player_id: string;
          user_id: string;
          player_name: string;
          nickname?: string | null;
          jersey_number?: string | null;
          is_goalie?: boolean;
          color?: string | null;
          notes?: string | null;
          received_fair_play_card?: boolean;
          is_selected?: boolean;
          on_field?: boolean;
          rel_x?: number | null;
          rel_y?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          player_id?: string;
          user_id?: string;
          player_name?: string;
          nickname?: string | null;
          jersey_number?: string | null;
          is_goalie?: boolean;
          color?: string | null;
          notes?: string | null;
          received_fair_play_card?: boolean;
          is_selected?: boolean;
          on_field?: boolean;
          rel_x?: number | null;
          rel_y?: number | null;
          created_at?: string;
        };
      };
      game_events: {
        Row: {
          id: string;
          game_id: string;
          user_id: string;
          event_type: string;
          time_seconds: number;
          order_index: number;
          scorer_id: string | null;
          assister_id: string | null;
          entity_id: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          game_id: string;
          user_id: string;
          event_type: string;
          time_seconds: number;
          order_index: number;
          scorer_id?: string | null;
          assister_id?: string | null;
          entity_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          user_id?: string;
          event_type?: string;
          time_seconds?: number;
          order_index?: number;
          scorer_id?: string | null;
          assister_id?: string | null;
          entity_id?: string | null;
          created_at?: string;
        };
      };
      game_tactical_data: {
        Row: {
          id: string;
          game_id: string;
          user_id: string;
          opponents: unknown;
          drawings: unknown;
          tactical_discs: unknown;
          tactical_drawings: unknown;
          tactical_ball_position: unknown | null;
          completed_interval_durations: unknown;
          last_sub_confirmation_time_seconds: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          game_id: string;
          user_id: string;
          opponents?: unknown;
          drawings?: unknown;
          tactical_discs?: unknown;
          tactical_drawings?: unknown;
          tactical_ball_position?: unknown | null;
          completed_interval_durations?: unknown;
          last_sub_confirmation_time_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          game_id?: string;
          user_id?: string;
          opponents?: unknown;
          drawings?: unknown;
          tactical_discs?: unknown;
          tactical_drawings?: unknown;
          tactical_ball_position?: unknown | null;
          completed_interval_durations?: unknown;
          last_sub_confirmation_time_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      player_assessments: {
        Row: {
          id: string;
          game_id: string;
          player_id: string;
          user_id: string;
          overall_rating: number | null;
          intensity: number | null;
          courage: number | null;
          duels: number | null;
          technique: number | null;
          creativity: number | null;
          decisions: number | null;
          awareness: number | null;
          teamwork: number | null;
          fair_play: number | null;
          impact: number | null;
          notes: string | null;
          minutes_played: number | null;
          created_by: string | null;
          created_at: number; // Unix timestamp milliseconds
        };
        Insert: {
          id: string;
          game_id: string;
          player_id: string;
          user_id: string;
          overall_rating?: number | null;
          intensity?: number | null;
          courage?: number | null;
          duels?: number | null;
          technique?: number | null;
          creativity?: number | null;
          decisions?: number | null;
          awareness?: number | null;
          teamwork?: number | null;
          fair_play?: number | null;
          impact?: number | null;
          notes?: string | null;
          minutes_played?: number | null;
          created_by?: string | null;
          created_at: number;
        };
        Update: {
          id?: string;
          game_id?: string;
          player_id?: string;
          user_id?: string;
          overall_rating?: number | null;
          intensity?: number | null;
          courage?: number | null;
          duels?: number | null;
          technique?: number | null;
          creativity?: number | null;
          decisions?: number | null;
          awareness?: number | null;
          teamwork?: number | null;
          fair_play?: number | null;
          impact?: number | null;
          notes?: string | null;
          minutes_played?: number | null;
          created_by?: string | null;
          created_at?: number;
        };
      };
      player_adjustments: {
        Row: {
          id: string;
          user_id: string;
          player_id: string;
          season_id: string | null;
          team_id: string | null;
          tournament_id: string | null;
          external_team_name: string | null;
          opponent_name: string | null;
          score_for: number | null;
          score_against: number | null;
          game_date: string | null;
          home_or_away: string | null;
          include_in_season_tournament: boolean;
          games_played_delta: number;
          goals_delta: number;
          assists_delta: number;
          fair_play_cards_delta: number;
          note: string | null;
          created_by: string | null;
          applied_at: string;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          player_id: string;
          season_id?: string | null;
          team_id?: string | null;
          tournament_id?: string | null;
          external_team_name?: string | null;
          opponent_name?: string | null;
          score_for?: number | null;
          score_against?: number | null;
          game_date?: string | null;
          home_or_away?: string | null;
          include_in_season_tournament?: boolean;
          games_played_delta?: number;
          goals_delta?: number;
          assists_delta?: number;
          fair_play_cards_delta?: number;
          note?: string | null;
          created_by?: string | null;
          applied_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          player_id?: string;
          season_id?: string | null;
          team_id?: string | null;
          tournament_id?: string | null;
          external_team_name?: string | null;
          opponent_name?: string | null;
          score_for?: number | null;
          score_against?: number | null;
          game_date?: string | null;
          home_or_away?: string | null;
          include_in_season_tournament?: boolean;
          games_played_delta?: number;
          goals_delta?: number;
          assists_delta?: number;
          fair_play_cards_delta?: number;
          note?: string | null;
          created_by?: string | null;
          applied_at?: string;
          created_at?: string;
        };
      };
      warmup_plans: {
        Row: {
          id: string;
          user_id: string;
          version: number;
          last_modified: string;
          is_default: boolean;
          sections: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          version?: number;
          last_modified?: string;
          is_default?: boolean;
          sections?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          version?: number;
          last_modified?: string;
          is_default?: boolean;
          sections?: unknown;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_settings: {
        Row: {
          user_id: string;
          current_game_id: string | null;
          last_home_team_name: string | null;
          language: string;
          has_seen_app_guide: boolean;
          use_demand_correction: boolean;
          is_drawing_mode_enabled: boolean;
          club_season_start_date: string;
          club_season_end_date: string;
          has_configured_season_dates: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          current_game_id?: string | null;
          last_home_team_name?: string | null;
          language?: string;
          has_seen_app_guide?: boolean;
          use_demand_correction?: boolean;
          is_drawing_mode_enabled?: boolean;
          club_season_start_date?: string;
          club_season_end_date?: string;
          has_configured_season_dates?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          current_game_id?: string | null;
          last_home_team_name?: string | null;
          language?: string;
          has_seen_app_guide?: boolean;
          use_demand_correction?: boolean;
          is_drawing_mode_enabled?: boolean;
          club_season_start_date?: string;
          club_season_end_date?: string;
          has_configured_season_dates?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_game_with_relations: {
        Args: {
          p_game: unknown;
          p_players: unknown;
          p_events: unknown;
          p_tactical: unknown;
          p_assessments: unknown;
        };
        Returns: string;
      };
      delete_personnel_cascade: {
        Args: {
          p_personnel_id: string;
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
  };
};

/**
 * Helper type to extract table row types.
 */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/**
 * Helper type to extract table insert types.
 */
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/**
 * Helper type to extract table update types.
 */
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

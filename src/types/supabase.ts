/**
 * Supabase Database Types
 *
 * AUTO-GENERATED from Supabase project: matchops-cloud (aybjmnxxtgspqesdiqxd)
 * Generated: 2026-01-20
 *
 * To regenerate:
 *   npx supabase gen types typescript --project-id aybjmnxxtgspqesdiqxd > src/types/supabase.ts
 *
 * Or use the MCP tool: generate_typescript_types
 *
 * @module types/supabase
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      game_events: {
        Row: {
          assister_id: string | null
          created_at: string | null
          entity_id: string | null
          event_type: string
          game_id: string
          id: string
          order_index: number
          scorer_id: string | null
          time_seconds: number
          user_id: string
        }
        Insert: {
          assister_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          event_type: string
          game_id: string
          id: string
          order_index: number
          scorer_id?: string | null
          time_seconds: number
          user_id: string
        }
        Update: {
          assister_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          event_type?: string
          game_id?: string
          id?: string
          order_index?: number
          scorer_id?: string | null
          time_seconds?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_events_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_players: {
        Row: {
          color: string | null
          created_at: string | null
          game_id: string
          id: string
          is_goalie: boolean | null
          is_selected: boolean | null
          jersey_number: string | null
          nickname: string | null
          notes: string | null
          on_field: boolean | null
          player_id: string
          player_name: string
          received_fair_play_card: boolean | null
          rel_x: number | null
          rel_y: number | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          game_id: string
          id: string
          is_goalie?: boolean | null
          is_selected?: boolean | null
          jersey_number?: string | null
          nickname?: string | null
          notes?: string | null
          on_field?: boolean | null
          player_id: string
          player_name: string
          received_fair_play_card?: boolean | null
          rel_x?: number | null
          rel_y?: number | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          game_id?: string
          id?: string
          is_goalie?: boolean | null
          is_selected?: boolean | null
          jersey_number?: string | null
          nickname?: string | null
          notes?: string | null
          on_field?: boolean | null
          player_id?: string
          player_name?: string
          received_fair_play_card?: boolean | null
          rel_x?: number | null
          rel_y?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_tactical_data: {
        Row: {
          completed_interval_durations: Json | null
          created_at: string | null
          drawings: Json | null
          game_id: string
          id: string
          last_sub_confirmation_time_seconds: number | null
          opponents: Json | null
          tactical_ball_position: Json | null
          tactical_discs: Json | null
          tactical_drawings: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_interval_durations?: Json | null
          created_at?: string | null
          drawings?: Json | null
          game_id: string
          id: string
          last_sub_confirmation_time_seconds?: number | null
          opponents?: Json | null
          tactical_ball_position?: Json | null
          tactical_discs?: Json | null
          tactical_drawings?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_interval_durations?: Json | null
          created_at?: string | null
          drawings?: Json | null
          game_id?: string
          id?: string
          last_sub_confirmation_time_seconds?: number | null
          opponents?: Json | null
          tactical_ball_position?: Json | null
          tactical_discs?: Json | null
          tactical_drawings?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_tactical_data_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          age_group: string | null
          away_score: number
          created_at: string | null
          current_period: number
          custom_league_name: string | null
          demand_factor: number | null
          formation_snap_points: Json | null
          game_date: string
          game_location: string | null
          game_notes: string
          game_personnel: string[] | null
          game_status: string
          game_time: string | null
          game_type: string | null
          gender: string | null
          home_or_away: string
          home_score: number
          id: string
          is_played: boolean
          league_id: string | null
          number_of_periods: number
          opponent_name: string
          period_duration_minutes: number
          season_id: string | null
          show_player_names: boolean
          sub_interval_minutes: number | null
          team_id: string | null
          team_name: string
          time_elapsed_in_seconds: number | null
          tournament_id: string | null
          tournament_level: string | null
          tournament_series_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age_group?: string | null
          away_score?: number
          created_at?: string | null
          current_period?: number
          custom_league_name?: string | null
          demand_factor?: number | null
          formation_snap_points?: Json | null
          game_date: string
          game_location?: string | null
          game_notes?: string
          game_personnel?: string[] | null
          game_status?: string
          game_time?: string | null
          game_type?: string | null
          gender?: string | null
          home_or_away?: string
          home_score?: number
          id: string
          is_played?: boolean
          league_id?: string | null
          number_of_periods?: number
          opponent_name: string
          period_duration_minutes?: number
          season_id?: string | null
          show_player_names?: boolean
          sub_interval_minutes?: number | null
          team_id?: string | null
          team_name: string
          time_elapsed_in_seconds?: number | null
          tournament_id?: string | null
          tournament_level?: string | null
          tournament_series_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age_group?: string | null
          away_score?: number
          created_at?: string | null
          current_period?: number
          custom_league_name?: string | null
          demand_factor?: number | null
          formation_snap_points?: Json | null
          game_date?: string
          game_location?: string | null
          game_notes?: string
          game_personnel?: string[] | null
          game_status?: string
          game_time?: string | null
          game_type?: string | null
          gender?: string | null
          home_or_away?: string
          home_score?: number
          id?: string
          is_played?: boolean
          league_id?: string | null
          number_of_periods?: number
          opponent_name?: string
          period_duration_minutes?: number
          season_id?: string | null
          show_player_names?: boolean
          sub_interval_minutes?: number | null
          team_id?: string | null
          team_name?: string
          time_elapsed_in_seconds?: number | null
          tournament_id?: string | null
          tournament_level?: string | null
          tournament_series_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel: {
        Row: {
          certifications: string[] | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          certifications?: string[] | null
          created_at?: string | null
          email?: string | null
          id: string
          name: string
          notes?: string | null
          phone?: string | null
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          certifications?: string[] | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      player_adjustments: {
        Row: {
          applied_at: string | null
          assists_delta: number | null
          created_at: string | null
          created_by: string | null
          external_team_name: string | null
          fair_play_cards_delta: number | null
          game_date: string | null
          games_played_delta: number | null
          goals_delta: number | null
          home_or_away: string | null
          id: string
          include_in_season_tournament: boolean | null
          note: string | null
          opponent_name: string | null
          player_id: string
          score_against: number | null
          score_for: number | null
          season_id: string | null
          team_id: string | null
          tournament_id: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          assists_delta?: number | null
          created_at?: string | null
          created_by?: string | null
          external_team_name?: string | null
          fair_play_cards_delta?: number | null
          game_date?: string | null
          games_played_delta?: number | null
          goals_delta?: number | null
          home_or_away?: string | null
          id: string
          include_in_season_tournament?: boolean | null
          note?: string | null
          opponent_name?: string | null
          player_id: string
          score_against?: number | null
          score_for?: number | null
          season_id?: string | null
          team_id?: string | null
          tournament_id?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          assists_delta?: number | null
          created_at?: string | null
          created_by?: string | null
          external_team_name?: string | null
          fair_play_cards_delta?: number | null
          game_date?: string | null
          games_played_delta?: number | null
          goals_delta?: number | null
          home_or_away?: string | null
          id?: string
          include_in_season_tournament?: boolean | null
          note?: string | null
          opponent_name?: string | null
          player_id?: string
          score_against?: number | null
          score_for?: number | null
          season_id?: string | null
          team_id?: string | null
          tournament_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_adjustments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      player_assessments: {
        Row: {
          awareness: number | null
          courage: number | null
          created_at: number
          created_by: string | null
          creativity: number | null
          decisions: number | null
          duels: number | null
          fair_play: number | null
          game_id: string
          id: string
          impact: number | null
          intensity: number | null
          minutes_played: number | null
          notes: string | null
          overall_rating: number | null
          player_id: string
          teamwork: number | null
          technique: number | null
          user_id: string
        }
        Insert: {
          awareness?: number | null
          courage?: number | null
          created_at: number
          created_by?: string | null
          creativity?: number | null
          decisions?: number | null
          duels?: number | null
          fair_play?: number | null
          game_id: string
          id: string
          impact?: number | null
          intensity?: number | null
          minutes_played?: number | null
          notes?: string | null
          overall_rating?: number | null
          player_id: string
          teamwork?: number | null
          technique?: number | null
          user_id: string
        }
        Update: {
          awareness?: number | null
          courage?: number | null
          created_at?: number
          created_by?: string | null
          creativity?: number | null
          decisions?: number | null
          duels?: number | null
          fair_play?: number | null
          game_id?: string
          id?: string
          impact?: number | null
          intensity?: number | null
          minutes_played?: number | null
          notes?: string | null
          overall_rating?: number | null
          player_id?: string
          teamwork?: number | null
          technique?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_assessments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_goalie: boolean | null
          jersey_number: string | null
          name: string
          nickname: string | null
          notes: string | null
          received_fair_play_card: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id: string
          is_goalie?: boolean | null
          jersey_number?: string | null
          name: string
          nickname?: string | null
          notes?: string | null
          received_fair_play_card?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_goalie?: boolean | null
          jersey_number?: string | null
          name?: string
          nickname?: string | null
          notes?: string | null
          received_fair_play_card?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          age_group: string | null
          archived: boolean | null
          badge: string | null
          club_season: string | null
          color: string | null
          created_at: string | null
          custom_league_name: string | null
          end_date: string | null
          game_dates: string[] | null
          game_type: string | null
          gender: string | null
          id: string
          league_id: string | null
          location: string | null
          name: string
          notes: string | null
          period_count: number | null
          period_duration: number | null
          start_date: string | null
          team_placements: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age_group?: string | null
          archived?: boolean | null
          badge?: string | null
          club_season?: string | null
          color?: string | null
          created_at?: string | null
          custom_league_name?: string | null
          end_date?: string | null
          game_dates?: string[] | null
          game_type?: string | null
          gender?: string | null
          id: string
          league_id?: string | null
          location?: string | null
          name: string
          notes?: string | null
          period_count?: number | null
          period_duration?: number | null
          start_date?: string | null
          team_placements?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age_group?: string | null
          archived?: boolean | null
          badge?: string | null
          club_season?: string | null
          color?: string | null
          created_at?: string | null
          custom_league_name?: string | null
          end_date?: string | null
          game_dates?: string[] | null
          game_type?: string | null
          gender?: string | null
          id?: string
          league_id?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          period_count?: number | null
          period_duration?: number | null
          start_date?: string | null
          team_placements?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      team_players: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          is_goalie: boolean | null
          jersey_number: string | null
          name: string
          nickname: string | null
          notes: string | null
          player_id: string
          received_fair_play_card: boolean | null
          team_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id: string
          is_goalie?: boolean | null
          jersey_number?: string | null
          name: string
          nickname?: string | null
          notes?: string | null
          player_id: string
          received_fair_play_card?: boolean | null
          team_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          is_goalie?: boolean | null
          jersey_number?: string | null
          name?: string
          nickname?: string | null
          notes?: string | null
          player_id?: string
          received_fair_play_card?: boolean | null
          team_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          age_group: string | null
          archived: boolean | null
          bound_season_id: string | null
          bound_tournament_id: string | null
          bound_tournament_series_id: string | null
          color: string | null
          created_at: string | null
          game_type: string | null
          id: string
          name: string
          notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age_group?: string | null
          archived?: boolean | null
          bound_season_id?: string | null
          bound_tournament_id?: string | null
          bound_tournament_series_id?: string | null
          color?: string | null
          created_at?: string | null
          game_type?: string | null
          id: string
          name: string
          notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age_group?: string | null
          archived?: boolean | null
          bound_season_id?: string | null
          bound_tournament_id?: string | null
          bound_tournament_series_id?: string | null
          color?: string | null
          created_at?: string | null
          game_type?: string | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          age_group: string | null
          archived: boolean | null
          awarded_player_id: string | null
          badge: string | null
          club_season: string | null
          color: string | null
          created_at: string | null
          end_date: string | null
          game_dates: string[] | null
          game_type: string | null
          gender: string | null
          id: string
          level: string | null
          location: string | null
          name: string
          notes: string | null
          period_count: number | null
          period_duration: number | null
          series: Json | null
          start_date: string | null
          team_placements: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          age_group?: string | null
          archived?: boolean | null
          awarded_player_id?: string | null
          badge?: string | null
          club_season?: string | null
          color?: string | null
          created_at?: string | null
          end_date?: string | null
          game_dates?: string[] | null
          game_type?: string | null
          gender?: string | null
          id: string
          level?: string | null
          location?: string | null
          name: string
          notes?: string | null
          period_count?: number | null
          period_duration?: number | null
          series?: Json | null
          start_date?: string | null
          team_placements?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          age_group?: string | null
          archived?: boolean | null
          awarded_player_id?: string | null
          badge?: string | null
          club_season?: string | null
          color?: string | null
          created_at?: string | null
          end_date?: string | null
          game_dates?: string[] | null
          game_type?: string | null
          gender?: string | null
          id?: string
          level?: string | null
          location?: string | null
          name?: string
          notes?: string | null
          period_count?: number | null
          period_duration?: number | null
          series?: Json | null
          start_date?: string | null
          team_placements?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          club_season_end_date: string | null
          club_season_start_date: string | null
          created_at: string | null
          current_game_id: string | null
          has_configured_season_dates: boolean | null
          has_seen_app_guide: boolean | null
          is_drawing_mode_enabled: boolean | null
          language: string | null
          last_home_team_name: string | null
          updated_at: string | null
          use_demand_correction: boolean | null
          user_id: string
        }
        Insert: {
          club_season_end_date?: string | null
          club_season_start_date?: string | null
          created_at?: string | null
          current_game_id?: string | null
          has_configured_season_dates?: boolean | null
          has_seen_app_guide?: boolean | null
          is_drawing_mode_enabled?: boolean | null
          language?: string | null
          last_home_team_name?: string | null
          updated_at?: string | null
          use_demand_correction?: boolean | null
          user_id: string
        }
        Update: {
          club_season_end_date?: string | null
          club_season_start_date?: string | null
          created_at?: string | null
          current_game_id?: string | null
          has_configured_season_dates?: boolean | null
          has_seen_app_guide?: boolean | null
          is_drawing_mode_enabled?: boolean | null
          language?: string | null
          last_home_team_name?: string | null
          updated_at?: string | null
          use_demand_correction?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          id: string
          user_id: string
          consent_type: string
          policy_version: string
          consented_at: string
          ip_address: string | null
          user_agent: string | null
          created_at: string | null
        }
        Insert: {
          id: string
          user_id: string
          consent_type: string
          policy_version: string
          consented_at?: string
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          consent_type?: string
          policy_version?: string
          consented_at?: string
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      warmup_plans: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          last_modified: string | null
          sections: Json | null
          updated_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string | null
          id: string
          is_default?: boolean | null
          last_modified?: string | null
          sections?: Json | null
          updated_at?: string | null
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          last_modified?: string | null
          sections?: Json | null
          updated_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clear_all_user_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      delete_personnel_cascade: {
        Args: { p_personnel_id: string }
        Returns: boolean
      }
      get_subscription_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          status: Database['public']['Enums']['subscription_status']
          period_end: string | null
          grace_end: string | null
          is_active: boolean
        }[]
      }
      get_user_consent: {
        Args: { p_consent_type: string }
        Returns: Json | null
      }
      record_user_consent: {
        Args: {
          p_consent_type: string
          p_policy_version: string
          p_ip_address?: string | null
          p_user_agent?: string | null
        }
        Returns: Json
      }
      save_game_with_relations: {
        Args: {
          p_assessments: Json[]
          p_events: Json[]
          p_game: Json
          p_players: Json[]
          p_tactical_data: Json
        }
        Returns: undefined
      }
      set_team_roster: {
        Args: { p_roster: Json[]; p_team_id: string }
        Returns: undefined
      }
    }
    Enums: {
      subscription_status: 'none' | 'active' | 'cancelled' | 'grace' | 'expired'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

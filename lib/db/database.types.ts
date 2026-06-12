/**
 * Database schema types — hand-derived from supabase/migrations/001–015.
 *
 * Mirrors the shape `supabase gen types typescript` produces, so it can be
 * replaced by the generated file once CLI auth is set up:
 *   npx supabase login
 *   npx supabase gen types typescript --project-id amtyxwqwnjiqodoiazpt > lib/db/database.types.ts
 *
 * KEEP IN SYNC: any new migration that adds/renames a column must update this
 * file (or regenerate it) — the typed clients and mappers compile against it.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      households: {
        Row: { id: string; invite_code: string; created_at: string };
        Insert: { id?: string; invite_code: string; created_at?: string };
        Update: { id?: string; invite_code?: string; created_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: { id: string; household_id: string; name: string; created_at: string };
        Insert: { id: string; household_id: string; name?: string; created_at?: string };
        Update: { id?: string; household_id?: string; name?: string; created_at?: string };
        Relationships: [];
      };
      coffees: {
        Row: {
          id: string;
          household_id: string;
          roaster: string;
          name: string;
          origin: string;
          region: string;
          varietal: string;
          process: string;
          roast: string;
          roasted_at: string;          // date
          rest_days: number;
          peak_days: number;
          grams: number;               // numeric (migration 014)
          frozen_grams: number;        // numeric (migration 014)
          frozen_at: string | null;    // date (migration 010)
          thawed_at: string | null;    // date (migration 010)
          archived: boolean;
          notes: string[];
          color: string;
          cc: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id?: string;       // defaults to my_household_id() (migration 002)
          roaster: string;
          name: string;
          origin?: string;
          region?: string;
          varietal?: string;
          process?: string;
          roast?: string;
          roasted_at: string;
          rest_days?: number;
          peak_days?: number;
          grams?: number;
          frozen_grams?: number;
          frozen_at?: string | null;
          thawed_at?: string | null;
          archived?: boolean;
          notes?: string[];
          color?: string;
          cc?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["coffees"]["Insert"]>;
        Relationships: [];
      };
      brews: {
        Row: {
          id: string;
          household_id: string;
          coffee_id: string;
          brewer_id: string;
          dose: number;
          water: number;
          bypass: number;
          temp: number;
          grind: number;               // numeric(4,1) (migration 007)
          ratio: number;
          water_type: string;
          started_at: string;          // timestamptz
          rated_at: string | null;     // timestamptz
          logged_by: string;
          rest_days: number | null;    // snapshot (migration 010)
          rate_for: string | null;     // handoff target (migration 011)
          session_id: string | null;   // split-brew link (migration 012)
          stars: number | null;        // numeric(2,1) (migration 006)
          stars2: number | null;       // numeric(2,1) (migration 006)
          taster1: string | null;
          taster2: string | null;
          acidity: number | null;
          sweetness: number | null;
          body: number | null;
          clarity: number | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id?: string;       // defaults to my_household_id() (migration 002)
          coffee_id: string;
          brewer_id: string;
          dose: number;
          water: number;
          bypass?: number;
          temp: number;
          grind: number;
          ratio: number;
          water_type?: string;
          started_at?: string;
          rated_at?: string | null;
          logged_by?: string;          // defaults to auth.uid() (migration 002)
          rest_days?: number | null;
          rate_for?: string | null;
          session_id?: string | null;
          stars?: number | null;
          stars2?: number | null;
          taster1?: string | null;
          taster2?: string | null;
          acidity?: number | null;
          sweetness?: number | null;
          body?: number | null;
          clarity?: number | null;
          note?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["brews"]["Insert"]>;
        Relationships: [];
      };
      config: {
        Row: {
          household_id: string;
          grinder: Json;
          brewers: Json;
          waters: string[];
          default_water: string;
          taster2: string;
          random_greeting: boolean;
          rest_days: number;           // migration 003
          serving_grams: number;       // migration 003
          peak_days: number;           // migration 005
        };
        Insert: {
          household_id: string;
          grinder?: Json;
          brewers?: Json;
          waters?: string[];
          default_water?: string;
          taster2?: string;
          random_greeting?: boolean;
          rest_days?: number;
          serving_grams?: number;
          peak_days?: number;
        };
        Update: Partial<Database["public"]["Tables"]["config"]["Insert"]>;
        Relationships: [];
      };
      household_ai: {
        Row: {
          household_id: string;
          provider: "openai" | "anthropic";
          key_ciphertext: string;
          key_iv: string;
          set_by: string;
          set_at: string;
        };
        Insert: {
          household_id: string;
          provider: "openai" | "anthropic";
          key_ciphertext: string;
          key_iv: string;
          set_by: string;
          set_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["household_ai"]["Insert"]>;
        Relationships: [];
      };
      household_insight: {
        Row: { household_id: string; text: string; generated_at: string };
        Insert: { household_id: string; text: string; generated_at?: string };
        Update: { household_id?: string; text?: string; generated_at?: string };
        Relationships: [];
      };
      household_tips: {
        Row: { household_id: string; tips: Json; generated_at: string };
        Insert: { household_id: string; tips: Json; generated_at?: string };
        Update: { household_id?: string; tips?: Json; generated_at?: string };
        Relationships: [];
      };
      learned_notes: {
        Row: { note: string; family: string };
        Insert: { note: string; family: string };
        Update: { note?: string; family?: string };
        Relationships: [];
      };
      gear_catalog: {
        Row: {
          id: string;
          kind: "grinder" | "brewer";
          name: string;
          unit: string | null;
          short: string | null;
          dose: number | null;
          ratio: number | null;
          temp: number | null;
          grind: number | null;
          pours: number | null;
          bypass: boolean | null;
          source: "seed" | "community";
        };
        Insert: {
          id?: string;
          kind: "grinder" | "brewer";
          name: string;
          unit?: string | null;
          short?: string | null;
          dose?: number | null;
          ratio?: number | null;
          temp?: number | null;
          grind?: number | null;
          pours?: number | null;
          bypass?: boolean | null;
          source?: "seed" | "community";
        };
        Update: Partial<Database["public"]["Tables"]["gear_catalog"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      my_household_id: { Args: Record<string, never>; Returns: string };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];

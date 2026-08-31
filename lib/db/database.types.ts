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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      brews: {
        Row: {
          acidity: number | null
          body: number | null
          brewer_id: string
          bypass: number
          clarity: number | null
          coffee_id: string
          created_at: string
          dose: number
          grind: number
          guest: boolean
          household_id: string
          id: string
          logged_by: string
          note: string | null
          rate_for: string | null
          rate_nudged_at: string | null
          rated_at: string | null
          ratio: number
          rest_days: number | null
          session_id: string | null
          stars: number | null
          stars2: number | null
          started_at: string
          sweetness: number | null
          taster1: string | null
          taster2: string | null
          temp: number
          water: number
          water_type: string
        }
        Insert: {
          acidity?: number | null
          body?: number | null
          brewer_id: string
          bypass?: number
          clarity?: number | null
          coffee_id: string
          created_at?: string
          dose: number
          grind: number
          guest?: boolean
          household_id?: string
          id?: string
          logged_by?: string
          note?: string | null
          rate_for?: string | null
          rate_nudged_at?: string | null
          rated_at?: string | null
          ratio: number
          rest_days?: number | null
          session_id?: string | null
          stars?: number | null
          stars2?: number | null
          started_at?: string
          sweetness?: number | null
          taster1?: string | null
          taster2?: string | null
          temp: number
          water: number
          water_type?: string
        }
        Update: {
          acidity?: number | null
          body?: number | null
          brewer_id?: string
          bypass?: number
          clarity?: number | null
          coffee_id?: string
          created_at?: string
          dose?: number
          grind?: number
          guest?: boolean
          household_id?: string
          id?: string
          logged_by?: string
          note?: string | null
          rate_for?: string | null
          rate_nudged_at?: string | null
          rated_at?: string | null
          ratio?: number
          rest_days?: number | null
          session_id?: string | null
          stars?: number | null
          stars2?: number | null
          started_at?: string
          sweetness?: number | null
          taster1?: string | null
          taster2?: string | null
          temp?: number
          water?: number
          water_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "brews_coffee_id_fkey"
            columns: ["coffee_id"]
            isOneToOne: false
            referencedRelation: "coffees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brews_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brews_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brews_rate_for_fkey"
            columns: ["rate_for"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coffees: {
        Row: {
          archived: boolean
          cc: string | null
          color: string
          created_at: string
          frozen_at: string | null
          frozen_grams: number
          grams: number
          household_id: string
          id: string
          name: string
          notes: string[]
          origin: string
          peak_days: number
          process: string
          region: string
          rest_days: number
          roast: string
          roasted_at: string
          roaster: string
          thawed_at: string | null
          varietal: string
          varietals: string[]
        }
        Insert: {
          archived?: boolean
          cc?: string | null
          color?: string
          created_at?: string
          frozen_at?: string | null
          frozen_grams?: number
          grams?: number
          household_id?: string
          id?: string
          name: string
          notes?: string[]
          origin?: string
          peak_days?: number
          process?: string
          region?: string
          rest_days?: number
          roast?: string
          roasted_at: string
          roaster: string
          thawed_at?: string | null
          varietal?: string
          varietals?: string[]
        }
        Update: {
          archived?: boolean
          cc?: string | null
          color?: string
          created_at?: string
          frozen_at?: string | null
          frozen_grams?: number
          grams?: number
          household_id?: string
          id?: string
          name?: string
          notes?: string[]
          origin?: string
          peak_days?: number
          process?: string
          region?: string
          rest_days?: number
          roast?: string
          roasted_at?: string
          roaster?: string
          thawed_at?: string | null
          varietal?: string
          varietals?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "coffees_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          brewers: Json
          default_water: string
          grinder: Json
          hidden_roasters: string[]
          household_id: string
          peak_days: number
          random_greeting: boolean
          rest_days: number
          roaster_rest: Json
          serving_grams: number
          taster2: string
          waters: string[]
        }
        Insert: {
          brewers?: Json
          default_water?: string
          grinder?: Json
          hidden_roasters?: string[]
          household_id: string
          peak_days?: number
          random_greeting?: boolean
          rest_days?: number
          roaster_rest?: Json
          serving_grams?: number
          taster2?: string
          waters?: string[]
        }
        Update: {
          brewers?: Json
          default_water?: string
          grinder?: Json
          hidden_roasters?: string[]
          household_id?: string
          peak_days?: number
          random_greeting?: boolean
          rest_days?: number
          roaster_rest?: Json
          serving_grams?: number
          taster2?: string
          waters?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "config_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      gear_catalog: {
        Row: {
          bypass: boolean | null
          dose: number | null
          grind: number | null
          id: string
          kind: string
          name: string
          pours: number | null
          ratio: number | null
          short: string | null
          source: string
          temp: number | null
          unit: string | null
        }
        Insert: {
          bypass?: boolean | null
          dose?: number | null
          grind?: number | null
          id?: string
          kind: string
          name: string
          pours?: number | null
          ratio?: number | null
          short?: string | null
          source?: string
          temp?: number | null
          unit?: string | null
        }
        Update: {
          bypass?: boolean | null
          dose?: number | null
          grind?: number | null
          id?: string
          kind?: string
          name?: string
          pours?: number | null
          ratio?: number | null
          short?: string | null
          source?: string
          temp?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      household_ai: {
        Row: {
          household_id: string
          key_ciphertext: string
          key_iv: string
          provider: string
          set_at: string
          set_by: string
        }
        Insert: {
          household_id: string
          key_ciphertext: string
          key_iv: string
          provider: string
          set_at?: string
          set_by: string
        }
        Update: {
          household_id?: string
          key_ciphertext?: string
          key_iv?: string
          provider?: string
          set_at?: string
          set_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_ai_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_ai_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_insight: {
        Row: {
          generated_at: string
          household_id: string
          text: string
        }
        Insert: {
          generated_at?: string
          household_id: string
          text: string
        }
        Update: {
          generated_at?: string
          household_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_insight_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_tips: {
        Row: {
          generated_at: string
          household_id: string
          tips: Json
        }
        Insert: {
          generated_at?: string
          household_id: string
          tips: Json
        }
        Update: {
          generated_at?: string
          household_id?: string
          tips?: Json
        }
        Relationships: [
          {
            foreignKeyName: "household_tips_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          invite_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
        }
        Relationships: []
      }
      learned_notes: {
        Row: {
          family: string
          note: string
        }
        Insert: {
          family: string
          note: string
        }
        Update: {
          family?: string
          note?: string
        }
        Relationships: []
      }
      learned_varietals: {
        Row: {
          canonical: string
          is_blend_label: boolean
          raw: string
        }
        Insert: {
          canonical: string
          is_blend_label?: boolean
          raw: string
        }
        Update: {
          canonical?: string
          is_blend_label?: boolean
          raw?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          household_id: string
          id: number
          kind: string
          local_day: string
          person_key: string
          sent_at: string
          slot: string
        }
        Insert: {
          household_id: string
          id?: number
          kind: string
          local_day: string
          person_key: string
          sent_at?: string
          slot?: string
        }
        Update: {
          household_id?: string
          id?: number
          kind?: string
          local_day?: string
          person_key?: string
          sent_at?: string
          slot?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      notify_person: {
        Row: {
          arvo_active: boolean
          arvo_fire_min: number | null
          arvo_misses: number
          created_at: string
          household_id: string
          log_nudge: boolean
          morning_active: boolean
          morning_fire_min: number | null
          morning_misses: number
          person_key: string
          rate_nudge: boolean
          slots_computed_on: string | null
        }
        Insert: {
          arvo_active?: boolean
          arvo_fire_min?: number | null
          arvo_misses?: number
          created_at?: string
          household_id: string
          log_nudge?: boolean
          morning_active?: boolean
          morning_fire_min?: number | null
          morning_misses?: number
          person_key: string
          rate_nudge?: boolean
          slots_computed_on?: string | null
        }
        Update: {
          arvo_active?: boolean
          arvo_fire_min?: number | null
          arvo_misses?: number
          created_at?: string
          household_id?: string
          log_nudge?: boolean
          morning_active?: boolean
          morning_fire_min?: number | null
          morning_misses?: number
          person_key?: string
          rate_nudge?: boolean
          slots_computed_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notify_person_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          household_id: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id: string
          name?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          household_id: string
          iana_tz: string
          last_seen_at: string
          p256dh: string
          person_key: string
          profile_id: string | null
          ua: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          household_id: string
          iana_tz?: string
          last_seen_at?: string
          p256dh: string
          person_key: string
          profile_id?: string | null
          ua?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          household_id?: string
          iana_tz?: string
          last_seen_at?: string
          p256dh?: string
          person_key?: string
          profile_id?: string | null
          ua?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_household_id_person_key_fkey"
            columns: ["household_id", "person_key"]
            isOneToOne: false
            referencedRelation: "notify_person"
            referencedColumns: ["household_id", "person_key"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          brewer_id: string | null
          bypass: number
          created_at: string
          dose: number
          grind: number
          household_id: string
          id: string
          name: string
          ratio: number
          temp: number
          water: number
          water_type: string
        }
        Insert: {
          brewer_id?: string | null
          bypass?: number
          created_at?: string
          dose: number
          grind: number
          household_id?: string
          id?: string
          name: string
          ratio: number
          temp: number
          water: number
          water_type?: string
        }
        Update: {
          brewer_id?: string | null
          bypass?: number
          created_at?: string
          dose?: number
          grind?: number
          household_id?: string
          id?: string
          name?: string
          ratio?: number
          temp?: number
          water?: number
          water_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_household_id: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
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

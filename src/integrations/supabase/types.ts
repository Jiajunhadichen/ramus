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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      contributors: {
        Row: {
          color: string
          created_at: string
          garden_id: string
          id: string
          kind: string
          name: string
          user_id: string | null
        }
        Insert: {
          color: string
          created_at?: string
          garden_id: string
          id?: string
          kind?: string
          name: string
          user_id?: string | null
        }
        Update: {
          color?: string
          created_at?: string
          garden_id?: string
          id?: string
          kind?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contributors_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          consent_confirmed: boolean
          created_at: string
          created_by: string
          garden_id: string
          happened_at: string | null
          id: string
          imported_at: string
          original_file: string | null
          raw_text: string
          source: string
          source_format: string
          title: string
        }
        Insert: {
          consent_confirmed: boolean
          created_at?: string
          created_by?: string
          garden_id: string
          happened_at?: string | null
          id?: string
          imported_at?: string
          original_file?: string | null
          raw_text?: string
          source?: string
          source_format?: string
          title: string
        }
        Update: {
          consent_confirmed?: boolean
          created_at?: string
          created_by?: string
          garden_id?: string
          happened_at?: string | null
          id?: string
          imported_at?: string
          original_file?: string | null
          raw_text?: string
          source?: string
          source_format?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor: string | null
          actor_kind: string
          created_at: string
          garden_id: string
          id: string
          idea_id: string | null
          payload: Json
          type: string
        }
        Insert: {
          actor?: string | null
          actor_kind?: string
          created_at?: string
          garden_id: string
          id?: string
          idea_id?: string | null
          payload?: Json
          type: string
        }
        Update: {
          actor?: string | null
          actor_kind?: string
          created_at?: string
          garden_id?: string
          id?: string
          idea_id?: string | null
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      garden_members: {
        Row: {
          created_at: string
          garden_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          garden_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          garden_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "garden_members_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      gardens: {
        Row: {
          collected: string
          created_at: string
          created_by: string
          focus_idea_id: string | null
          id: string
          is_demo: boolean
          specimen_no: number
          title: string
          updated_at: string
        }
        Insert: {
          collected?: string
          created_at?: string
          created_by?: string
          focus_idea_id?: string | null
          id?: string
          is_demo?: boolean
          specimen_no?: number
          title: string
          updated_at?: string
        }
        Update: {
          collected?: string
          created_at?: string
          created_by?: string
          focus_idea_id?: string | null
          id?: string
          is_demo?: boolean
          specimen_no?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      idea_evidence: {
        Row: {
          created_at: string
          created_by: string | null
          garden_id: string
          id: string
          idea_id: string
          message_id: string
          note: string | null
          role: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          garden_id: string
          id?: string
          idea_id: string
          message_id: string
          note?: string | null
          role: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          garden_id?: string
          id?: string
          idea_id?: string
          message_id?: string
          note?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "idea_evidence_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_evidence_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_evidence_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      idea_links: {
        Row: {
          child_id: string
          confirmed: boolean
          created_at: string
          garden_id: string
          id: string
          kind: string
          nature: string | null
          origin: string
          parent_id: string
          position: number
          rationale: string | null
        }
        Insert: {
          child_id: string
          confirmed?: boolean
          created_at?: string
          garden_id: string
          id?: string
          kind: string
          nature?: string | null
          origin?: string
          parent_id: string
          position?: number
          rationale?: string | null
        }
        Update: {
          child_id?: string
          confirmed?: boolean
          created_at?: string
          garden_id?: string
          id?: string
          kind?: string
          nature?: string | null
          origin?: string
          parent_id?: string
          position?: number
          rationale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "idea_links_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_links_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "idea_links_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
        ]
      }
      ideas: {
        Row: {
          confirmed: boolean
          contributor_id: string | null
          conversation_id: string | null
          created_at: string
          garden_id: string
          id: string
          is_knot: boolean
          key: string
          label: string
          message_id: string | null
          note: string
          origin: string
          owner_user_id: string | null
          position: number
          rejected_at: string | null
          settled: string | null
          source_excerpt: string | null
          status: string
          step: number
          updated_at: string
          visibility: string
        }
        Insert: {
          confirmed?: boolean
          contributor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          garden_id: string
          id?: string
          is_knot?: boolean
          key: string
          label: string
          message_id?: string | null
          note?: string
          origin?: string
          owner_user_id?: string | null
          position?: number
          rejected_at?: string | null
          settled?: string | null
          source_excerpt?: string | null
          status?: string
          step?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          confirmed?: boolean
          contributor_id?: string | null
          conversation_id?: string | null
          created_at?: string
          garden_id?: string
          id?: string
          is_knot?: boolean
          key?: string
          label?: string
          message_id?: string | null
          note?: string
          origin?: string
          owner_user_id?: string | null
          position?: number
          rejected_at?: string | null
          settled?: string | null
          source_excerpt?: string | null
          status?: string
          step?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideas_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          contributor_id: string | null
          conversation_id: string
          external_id: string | null
          garden_id: string
          id: string
          imported_at: string
          parent_message_id: string | null
          position: number
          sent_at: string | null
          sequence: number
          time_precision: string
          time_source: string
        }
        Insert: {
          content: string
          contributor_id?: string | null
          conversation_id: string
          external_id?: string | null
          garden_id: string
          id?: string
          imported_at?: string
          parent_message_id?: string | null
          position: number
          sent_at?: string | null
          sequence?: number
          time_precision?: string
          time_source?: string
        }
        Update: {
          content?: string
          contributor_id?: string | null
          conversation_id?: string
          external_id?: string | null
          garden_id?: string
          id?: string
          imported_at?: string
          parent_message_id?: string | null
          position?: number
          sent_at?: string | null
          sequence?: number
          time_precision?: string
          time_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      steps: {
        Row: {
          date: string | null
          garden_id: string
          id: string
          step: number
          title: string
        }
        Insert: {
          date?: string | null
          garden_id: string
          id?: string
          step: number
          title?: string
        }
        Update: {
          date?: string | null
          garden_id?: string
          id?: string
          step?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "steps_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_write_garden: { Args: { _garden: string }; Returns: boolean }
      is_garden_member: { Args: { _garden: string }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

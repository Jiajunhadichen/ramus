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
      ai_usage: {
        Row: {
          created_at: string
          garden_id: string | null
          guest: boolean
          id: string
          input_tokens: number
          kind: string
          model: string | null
          output_tokens: number
          usd: number
          user_id: string
        }
        Insert: {
          created_at?: string
          garden_id?: string | null
          guest?: boolean
          id?: string
          input_tokens?: number
          kind: string
          model?: string | null
          output_tokens?: number
          usd?: number
          user_id: string
        }
        Update: {
          created_at?: string
          garden_id?: string | null
          guest?: boolean
          id?: string
          input_tokens?: number
          kind?: string
          model?: string | null
          output_tokens?: number
          usd?: number
          user_id?: string
        }
        Relationships: []
      }
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
          deleted_at: string | null
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
          deleted_at?: string | null
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
          deleted_at?: string | null
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
          is_outcome: boolean
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
          is_outcome?: boolean
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
          is_outcome?: boolean
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
      intake_batches: {
        Row: {
          accession_no: number
          conversation_id: string
          created_at: string
          created_by: string | null
          garden_id: string
          id: string
          options: Json
          original_file: string | null
          parser_version: string
          raw_text: string
          report: Json
          source_format: string
        }
        Insert: {
          accession_no: number
          conversation_id: string
          created_at?: string
          created_by?: string | null
          garden_id: string
          id?: string
          options?: Json
          original_file?: string | null
          parser_version: string
          raw_text: string
          report?: Json
          source_format: string
        }
        Update: {
          accession_no?: number
          conversation_id?: string
          created_at?: string
          created_by?: string | null
          garden_id?: string
          id?: string
          options?: Json
          original_file?: string | null
          parser_version?: string
          raw_text?: string
          report?: Json
          source_format?: string
        }
        Relationships: [
          {
            foreignKeyName: "intake_batches_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intake_batches_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          batch_id: string | null
          content: string
          contributor_id: string | null
          conversation_id: string
          external_id: string | null
          garden_id: string
          hidden_reason: string | null
          id: string
          imported_at: string
          offset_ms: number | null
          parent_message_id: string | null
          position: number
          raw_end: number | null
          raw_start: number | null
          sent_at: string | null
          sequence: number
          speaker_label: string | null
          time_precision: string
          time_source: string
        }
        Insert: {
          batch_id?: string | null
          content: string
          contributor_id?: string | null
          conversation_id: string
          external_id?: string | null
          garden_id: string
          hidden_reason?: string | null
          id?: string
          imported_at?: string
          offset_ms?: number | null
          parent_message_id?: string | null
          position: number
          raw_end?: number | null
          raw_start?: number | null
          sent_at?: string | null
          sequence?: number
          speaker_label?: string | null
          time_precision?: string
          time_source?: string
        }
        Update: {
          batch_id?: string | null
          content?: string
          contributor_id?: string | null
          conversation_id?: string
          external_id?: string | null
          garden_id?: string
          hidden_reason?: string | null
          id?: string
          imported_at?: string
          offset_ms?: number | null
          parent_message_id?: string | null
          position?: number
          raw_end?: number | null
          raw_start?: number | null
          sent_at?: string | null
          sequence?: number
          speaker_label?: string | null
          time_precision?: string
          time_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "intake_batches"
            referencedColumns: ["id"]
          },
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
      speaker_aliases: {
        Row: {
          alias: string
          contributor_id: string
          created_at: string
          created_by: string | null
          garden_id: string
          id: string
        }
        Insert: {
          alias: string
          contributor_id: string
          created_at?: string
          created_by?: string | null
          garden_id: string
          id?: string
        }
        Update: {
          alias?: string
          contributor_id?: string
          created_at?: string
          created_by?: string | null
          garden_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "speaker_aliases_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "speaker_aliases_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
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
      thought_event_evidence: {
        Row: {
          garden_id: string
          message_id: string
          thought_event_id: string
        }
        Insert: {
          garden_id: string
          message_id: string
          thought_event_id: string
        }
        Update: {
          garden_id?: string
          message_id?: string
          thought_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thought_event_evidence_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thought_event_evidence_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thought_event_evidence_thought_event_id_fkey"
            columns: ["thought_event_id"]
            isOneToOne: false
            referencedRelation: "thought_events"
            referencedColumns: ["id"]
          },
        ]
      }
      thought_events: {
        Row: {
          confirmed: boolean
          corrects_event_id: string | null
          garden_id: string
          id: string
          idea_id: string
          occurred_at: string | null
          origin: string
          person_id: string | null
          rationale: string | null
          recorded_at: string
          recorded_by: string | null
          rejected_at: string | null
          related_idea_id: string | null
          seq: number
          settled_kind: string | null
          time_precision: string
          type: string
        }
        Insert: {
          confirmed?: boolean
          corrects_event_id?: string | null
          garden_id: string
          id?: string
          idea_id: string
          occurred_at?: string | null
          origin?: string
          person_id?: string | null
          rationale?: string | null
          recorded_at?: string
          recorded_by?: string | null
          rejected_at?: string | null
          related_idea_id?: string | null
          seq?: never
          settled_kind?: string | null
          time_precision?: string
          type: string
        }
        Update: {
          confirmed?: boolean
          corrects_event_id?: string | null
          garden_id?: string
          id?: string
          idea_id?: string
          occurred_at?: string | null
          origin?: string
          person_id?: string | null
          rationale?: string | null
          recorded_at?: string
          recorded_by?: string | null
          rejected_at?: string | null
          related_idea_id?: string | null
          seq?: never
          settled_kind?: string | null
          time_precision?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "thought_events_corrects_event_id_fkey"
            columns: ["corrects_event_id"]
            isOneToOne: false
            referencedRelation: "thought_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thought_events_garden_id_fkey"
            columns: ["garden_id"]
            isOneToOne: false
            referencedRelation: "gardens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thought_events_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thought_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thought_events_related_idea_id_fkey"
            columns: ["related_idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
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
      delete_garden_forever: { Args: { _garden: string }; Returns: undefined }
      is_garden_member: { Args: { _garden: string }; Returns: boolean }
      is_garden_owner: { Args: { _garden: string }; Returns: boolean }
      purge_guest: { Args: { _user: string }; Returns: undefined }
      receive_batch: {
        Args: {
          _aliases: Json
          _batch: Json
          _conversation: string
          _garden: string
          _messages: Json
          _new_conversation: Json
          _people: Json
        }
        Returns: Json
      }
      record_action: {
        Args: {
          _audit_type: string
          _garden: string
          _idea: string
          _payload: Json
          _thoughts: Json
        }
        Returns: undefined
      }
      review_thought_event: {
        Args: { _confirm: boolean; _id: string }
        Returns: undefined
      }
      seed_thought_events: {
        Args: { _by: string; _garden: string }
        Returns: undefined
      }
      set_idea_outcome: {
        Args: { _garden: string; _idea: string; _outcome: boolean }
        Returns: undefined
      }
      trash_garden: {
        Args: { _garden: string; _trash: boolean }
        Returns: undefined
      }
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

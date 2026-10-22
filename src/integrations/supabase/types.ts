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
      messenger_sessions: {
        Row: {
          data: Json
          owner_id: string
          pin_verified: boolean
          psid: string
          state: string
          updated_at: string
        }
        Insert: {
          data?: Json
          owner_id: string
          pin_verified?: boolean
          psid: string
          state?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          owner_id?: string
          pin_verified?: boolean
          psid?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string
          category: string
          created_at: string
          customer_name: string
          delivery_status: string
          id: string
          note: string | null
          order_no: number
          owner_id: string
          phone: string
          product_code: string
          product_id: string | null
          product_name: string
          psid: string | null
          quantity: number
          sent: boolean
          sent_at: string | null
          status: string
          total: number
          tracking_number: string | null
          tracking_url: string | null
          township: string
          unit_price: number
          proof_image_url: string | null
          proof_uploaded_at: string | null
          updated_at: string
        }
        Insert: {
          address: string
          category: string
          created_at?: string
          customer_name: string
          delivery_status?: string
          id?: string
          note?: string | null
          order_no?: number
          owner_id: string
          phone: string
          product_code: string
          product_id?: string | null
          product_name: string
          psid?: string | null
          quantity: number
          sent?: boolean
          sent_at?: string | null
          status?: string
          total: number
          tracking_number?: string | null
          tracking_url?: string | null
          township: string
          unit_price: number
          proof_image_url?: string | null
          proof_uploaded_at?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          category?: string
          created_at?: string
          customer_name?: string
          delivery_status?: string
          id?: string
          note?: string | null
          order_no?: number
          owner_id?: string
          phone?: string
          product_code?: string
          product_id?: string | null
          product_name?: string
          psid?: string | null
          quantity?: number
          sent?: boolean
          sent_at?: string | null
          status?: string
          total?: number
          tracking_number?: string | null
          tracking_url?: string | null
          township?: string
          unit_price?: number
          proof_image_url?: string | null
          proof_uploaded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          owner_id: string
          price: number
          stock: number
        }
        Insert: {
          active?: boolean
          category?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          owner_id?: string
          price: number
          stock?: number
        }
        Update: {
          active?: boolean
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          owner_id?: string
          price?: number
          stock?: number
        }
        Relationships: []
      }
      shop_settings: {
        Row: {
          fb_page_id: string | null
          low_stock_threshold: number
          messenger_username: string | null
          owner_id: string
          pin_hash: string | null
          shop_name: string
          updated_at: string
        }
        Insert: {
          fb_page_id?: string | null
          low_stock_threshold?: number
          messenger_username?: string | null
          owner_id: string
          pin_hash?: string | null
          shop_name?: string
          updated_at?: string
        }
        Update: {
          fb_page_id?: string | null
          low_stock_threshold?: number
          messenger_username?: string | null
          owner_id?: string
          pin_hash?: string | null
          shop_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_history: {
        Row: {
          balance: number
          change: number
          created_at: string
          id: string
          note: string | null
          order_id: string | null
          owner_id: string
          product_code: string
          product_id: string | null
          reason: string
        }
        Insert: {
          balance: number
          change: number
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          owner_id: string
          product_code: string
          product_id?: string | null
          reason: string
        }
        Update: {
          balance?: number
          change?: number
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          owner_id?: string
          product_code?: string
          product_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_order: { Args: { _order_id: string }; Returns: undefined }
      change_stock: {
        Args: {
          _delta: number
          _note: string
          _product_id: string
          _reason: string
        }
        Returns: number
      }
      get_public_product: {
        Args: { _code: string }
        Returns: {
          category: string
          code: string
          description: string
          image_url: string
          messenger_username: string
          name: string
          price: number
          shop_name: string
          stock: number
        }[]
      }
      place_order: {
        Args: {
          _address: string
          _name: string
          _note: string
          _owner: string
          _phone: string
          _product_id: string
          _psid: string
          _qty: number
          _township: string
        }
        Returns: {
          address: string
          category: string
          created_at: string
          customer_name: string
          id: string
          note: string | null
          order_no: number
          owner_id: string
          phone: string
          product_code: string
          product_id: string | null
          product_name: string
          psid: string | null
          quantity: number
          sent: boolean
          sent_at: string | null
          status: string
          total: number
          township: string
          unit_price: number
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_shop_pin: { Args: { _pin: string }; Returns: undefined }
      verify_shop_pin: {
        Args: { _owner: string; _pin: string }
        Returns: boolean
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

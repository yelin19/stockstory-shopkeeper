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
      low_stock_alert_pair_attempts: {
        Row: {
          attempts: number
          blocked_until: string | null
          owner_id: string
          psid: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          owner_id: string
          psid: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          owner_id?: string
          psid?: string
          window_started_at?: string
        }
        Relationships: []
      }
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
          currency: string
          customer_name: string
          delivery_image_url: string | null
          delivery_notified_at: string | null
          delivery_status: string
          id: string
          note: string | null
          order_no: number
          owner_id: string
          payment_approved_at: string | null
          payment_method: string
          payment_proof_url: string | null
          payment_status: string
          payment_submitted_at: string | null
          phone: string
          product_code: string
          product_id: string | null
          product_name: string
          product_unit: string
          psid: string | null
          public_order_id: string
          quantity: number
          sent: boolean
          sent_at: string | null
          status: string
          total: number
          township: string
          tracking_number: string | null
          tracking_url: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          address: string
          category: string
          created_at?: string
          currency?: string
          customer_name: string
          delivery_image_url?: string | null
          delivery_notified_at?: string | null
          delivery_status?: string
          id?: string
          note?: string | null
          order_no?: number
          owner_id: string
          payment_approved_at?: string | null
          payment_method?: string
          payment_proof_url?: string | null
          payment_status?: string
          payment_submitted_at?: string | null
          phone: string
          product_code: string
          product_id?: string | null
          product_name: string
          product_unit?: string
          psid?: string | null
          public_order_id: string
          quantity: number
          sent?: boolean
          sent_at?: string | null
          status?: string
          total: number
          township: string
          tracking_number?: string | null
          tracking_url?: string | null
          unit_price: number
          updated_at?: string
        }
        Update: {
          address?: string
          category?: string
          created_at?: string
          currency?: string
          customer_name?: string
          delivery_image_url?: string | null
          delivery_notified_at?: string | null
          delivery_status?: string
          id?: string
          note?: string | null
          order_no?: number
          owner_id?: string
          payment_approved_at?: string | null
          payment_method?: string
          payment_proof_url?: string | null
          payment_status?: string
          payment_submitted_at?: string | null
          phone?: string
          product_code?: string
          product_id?: string | null
          product_name?: string
          product_unit?: string
          psid?: string | null
          public_order_id?: string
          quantity?: number
          sent?: boolean
          sent_at?: string | null
          status?: string
          total?: number
          township?: string
          tracking_number?: string | null
          tracking_url?: string | null
          unit_price?: number
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
          allow_prepaid: boolean
          allow_seller_delivery_cash: boolean
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          low_stock_alert_sent: boolean
          name: string
          owner_id: string
          price: number
          stock: number
          unit: string
        }
        Insert: {
          active?: boolean
          allow_prepaid?: boolean
          allow_seller_delivery_cash?: boolean
          category?: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          low_stock_alert_sent?: boolean
          name: string
          owner_id?: string
          price: number
          stock?: number
          unit?: string
        }
        Update: {
          active?: boolean
          allow_prepaid?: boolean
          allow_seller_delivery_cash?: boolean
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          low_stock_alert_sent?: boolean
          name?: string
          owner_id?: string
          price?: number
          stock?: number
          unit?: string
        }
        Relationships: []
      }
      shop_settings: {
        Row: {
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          currency: string
          fb_page_id: string | null
          low_stock_alert_pin_hash: string | null
          low_stock_alert_psid: string | null
          low_stock_threshold: number
          messenger_username: string | null
          owner_id: string
          pin_hash: string | null
          shop_name: string
          updated_at: string
        }
        Insert: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          currency?: string
          fb_page_id?: string | null
          low_stock_alert_pin_hash?: string | null
          low_stock_alert_psid?: string | null
          low_stock_threshold?: number
          messenger_username?: string | null
          owner_id: string
          pin_hash?: string | null
          shop_name?: string
          updated_at?: string
        }
        Update: {
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          currency?: string
          fb_page_id?: string | null
          low_stock_alert_pin_hash?: string | null
          low_stock_alert_psid?: string | null
          low_stock_threshold?: number
          messenger_username?: string | null
          owner_id?: string
          pin_hash?: string | null
          shop_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_action_requests: {
        Row: {
          created_at: string
          final_stock: number
          owner_id: string
          product_id: string
          request_id: string
        }
        Insert: {
          created_at?: string
          final_stock: number
          owner_id: string
          product_id: string
          request_id: string
        }
        Update: {
          created_at?: string
          final_stock?: number
          owner_id?: string
          product_id?: string
          request_id?: string
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
      cancel_order_by_customer: {
        Args: { _owner: string; _psid: string; _public_order_id: string }
        Returns: {
          address: string
          category: string
          created_at: string
          currency: string
          customer_name: string
          delivery_image_url: string | null
          delivery_notified_at: string | null
          delivery_status: string
          id: string
          note: string | null
          order_no: number
          owner_id: string
          payment_approved_at: string | null
          payment_method: string
          payment_proof_url: string | null
          payment_status: string
          payment_submitted_at: string | null
          phone: string
          product_code: string
          product_id: string | null
          product_name: string
          product_unit: string
          psid: string | null
          public_order_id: string
          quantity: number
          sent: boolean
          sent_at: string | null
          status: string
          total: number
          township: string
          tracking_number: string | null
          tracking_url: string | null
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      change_stock: {
        Args: {
          _delta: number
          _note: string
          _product_id: string
          _reason: string
          _request_id?: string
        }
        Returns: number
      }
      claim_low_stock_alerts: {
        Args: { _owner: string; _product_id?: string }
        Returns: {
          product_code: string
          product_id: string
          product_name: string
          recipient_psid: string
          stock: number
          threshold: number
          unit: string
        }[]
      }
      delete_order_history_range: {
        Args: { _end_at: string; _expected_count: number; _start_at: string }
        Returns: number
      }
      delete_stock_history_range: {
        Args: { _end_at: string; _expected_count: number; _start_at: string }
        Returns: number
      }
      edit_order_by_customer: {
        Args: {
          _owner: string
          _psid: string
          _public_order_id: string
          _qty: number
        }
        Returns: {
          address: string
          category: string
          created_at: string
          currency: string
          customer_name: string
          delivery_image_url: string | null
          delivery_notified_at: string | null
          delivery_status: string
          id: string
          note: string | null
          order_no: number
          owner_id: string
          payment_approved_at: string | null
          payment_method: string
          payment_proof_url: string | null
          payment_status: string
          payment_submitted_at: string | null
          phone: string
          product_code: string
          product_id: string | null
          product_name: string
          product_unit: string
          psid: string | null
          public_order_id: string
          quantity: number
          sent: boolean
          sent_at: string | null
          status: string
          total: number
          township: string
          tracking_number: string | null
          tracking_url: string | null
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_public_product: {
        Args: { _code: string }
        Returns: {
          category: string
          code: string
          currency: string
          description: string
          image_url: string
          messenger_username: string
          name: string
          price: number
          shop_name: string
          sold_count: number
          stock: number
          unit: string
        }[]
      }
      pair_low_stock_alert_recipient: {
        Args: { _owner: string; _pin: string; _psid: string }
        Returns: boolean
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
          currency: string
          customer_name: string
          delivery_image_url: string | null
          delivery_notified_at: string | null
          delivery_status: string
          id: string
          note: string | null
          order_no: number
          owner_id: string
          payment_approved_at: string | null
          payment_method: string
          payment_proof_url: string | null
          payment_status: string
          payment_submitted_at: string | null
          phone: string
          product_code: string
          product_id: string | null
          product_name: string
          product_unit: string
          psid: string | null
          public_order_id: string
          quantity: number
          sent: boolean
          sent_at: string | null
          status: string
          total: number
          township: string
          tracking_number: string | null
          tracking_url: string | null
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_order_from_messenger: {
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
          currency: string
          customer_name: string
          delivery_image_url: string | null
          delivery_notified_at: string | null
          delivery_status: string
          id: string
          note: string | null
          order_no: number
          owner_id: string
          payment_approved_at: string | null
          payment_method: string
          payment_proof_url: string | null
          payment_status: string
          payment_submitted_at: string | null
          phone: string
          product_code: string
          product_id: string | null
          product_name: string
          product_unit: string
          psid: string | null
          public_order_id: string
          quantity: number
          sent: boolean
          sent_at: string | null
          status: string
          total: number
          township: string
          tracking_number: string | null
          tracking_url: string | null
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_order_from_messenger_with_payment_method: {
        Args: {
          _address: string
          _name: string
          _note: string
          _owner: string
          _payment_method: string
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
          currency: string
          customer_name: string
          delivery_image_url: string | null
          delivery_notified_at: string | null
          delivery_status: string
          id: string
          note: string | null
          order_no: number
          owner_id: string
          payment_approved_at: string | null
          payment_method: string
          payment_proof_url: string | null
          payment_status: string
          payment_submitted_at: string | null
          phone: string
          product_code: string
          product_id: string | null
          product_name: string
          product_unit: string
          psid: string | null
          public_order_id: string
          quantity: number
          sent: boolean
          sent_at: string | null
          status: string
          total: number
          township: string
          tracking_number: string | null
          tracking_url: string | null
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      preview_order_history_cleanup: {
        Args: { _end_at: string; _start_at: string }
        Returns: {
          eligible_count: number
          protected_count: number
        }[]
      }
      preview_stock_history_cleanup: {
        Args: { _end_at: string; _start_at: string }
        Returns: {
          record_count: number
        }[]
      }
      release_low_stock_alert: {
        Args: { _product_id: string }
        Returns: undefined
      }
      set_low_stock_alert_pin: { Args: { _pin: string }; Returns: undefined }
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
